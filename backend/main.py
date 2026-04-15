"""FastAPI entrypoint — LLM Harness PoC."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Load .env: project root first (has real keys), then backend/ for overrides
_root_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_root_env, override=True)
load_dotenv()

from agent.events import AgentEvent, EventType
from agent.loop import AgentLoop
from db.connection import init_pool, close_pool
from domains.loader import load_all_domains, match_domain, domain_to_context
from llm import get_provider
from llm.base import Message
from tools.db_query import DBQueryTool
from tools.domain_lookup import DomainLookupTool
from tools.explore_schema import ExploreSchemaTool
from tools.sp_call import SPCallTool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_HISTORY = int(os.environ.get("MAX_CONVERSATION_HISTORY", "20"))

# In-memory stores
_sessions: dict[str, list[AgentEvent]] = {}
_conversations: dict[str, list[Message]] = {}

# HITL approval store: stream_key → asyncio.Event + result
_approvals: dict[str, asyncio.Event] = {}
_approval_results: dict[str, bool] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load domain registry
    domains = load_all_domains()
    logger.info("Loaded %d domain(s) from registry", len(domains))
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="LLM Harness", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    query: str
    session_id: str | None = None


class QueryResponse(BaseModel):
    session_id: str
    status: str  # stream_key


class ApprovalRequest(BaseModel):
    approved: bool


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    domains = load_all_domains()
    return {
        "status": "ok",
        "provider": os.environ.get("LLM_PROVIDER", "claude"),
        "domains": [d.get("domain") for d in domains],
    }


@app.post("/api/query", response_model=QueryResponse)
async def start_query(body: QueryRequest):
    session_id = body.session_id or str(uuid.uuid4())

    if session_id not in _conversations:
        _conversations[session_id] = []

    stream_key = f"{session_id}:{uuid.uuid4().hex[:8]}"
    _sessions[stream_key] = []

    history = _conversations[session_id][-MAX_HISTORY:]

    # Domain matching: auto-inject relevant schema into system prompt
    matched = match_domain(body.query)
    domain_ctx = domain_to_context(matched) if matched else ""
    if matched:
        logger.info("Domain matched: %s for query: %s", matched.get("domain"), body.query[:50])

    # HITL approval callback
    async def _approval_callback(tool_name: str, tool_input: dict) -> bool:
        approval_event = asyncio.Event()
        _approvals[stream_key] = approval_event
        _approval_results[stream_key] = False

        # Wait for user response (timeout 120s)
        try:
            await asyncio.wait_for(approval_event.wait(), timeout=120.0)
        except asyncio.TimeoutError:
            logger.warning("Approval timeout for %s in stream %s", tool_name, stream_key)
            return False
        finally:
            _approvals.pop(stream_key, None)

        return _approval_results.pop(stream_key, False)

    async def _run():
        llm = get_provider()
        tools = [DomainLookupTool(), DBQueryTool(), SPCallTool(), ExploreSchemaTool()]
        max_turns = int(os.environ.get("AGENT_MAX_TURNS", "10"))
        loop = AgentLoop(
            llm=llm,
            tools=tools,
            max_turns=max_turns,
            approval_callback=_approval_callback,
            domain_context=domain_ctx,
        )

        final_answer = ""
        async for event in loop.run(body.query, history=history):
            _sessions[stream_key].append(event)
            if event.type == EventType.FINAL:
                final_answer = event.answer
                break
            if event.type == EventType.ERROR:
                break

        _conversations[session_id].append({"role": "user", "content": body.query})
        if final_answer:
            _conversations[session_id].append({"role": "assistant", "content": final_answer})

    asyncio.create_task(_run())
    return QueryResponse(session_id=session_id, status=stream_key)


@app.post("/api/approve/{stream_key}")
async def approve_tool(stream_key: str, body: ApprovalRequest):
    """User approves or denies a tool execution."""
    event = _approvals.get(stream_key)
    if event is None:
        raise HTTPException(status_code=404, detail="No pending approval for this stream")
    _approval_results[stream_key] = body.approved
    event.set()
    return {"approved": body.approved}


@app.get("/api/stream/{stream_key}")
async def stream_events(stream_key: str):
    if stream_key not in _sessions:
        raise HTTPException(status_code=404, detail="Stream not found")

    async def event_generator():
        sent = 0
        while True:
            events = _sessions[stream_key]
            while sent < len(events):
                event = events[sent]
                data = json.dumps(event.model_dump(), ensure_ascii=False, default=str)
                yield f"event: {event.type.value}\ndata: {data}\n\n"
                sent += 1
                if event.type in (EventType.FINAL, EventType.ERROR):
                    return
            await asyncio.sleep(0.05)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.delete("/api/session/{session_id}")
async def clear_session(session_id: str):
    _conversations.pop(session_id, None)
    keys_to_remove = [k for k in _sessions if k.startswith(session_id)]
    for k in keys_to_remove:
        _sessions.pop(k, None)
    return {"deleted": session_id}
