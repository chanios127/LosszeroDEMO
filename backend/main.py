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

# Load .env: project root first, then backend/ for overrides
_root_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_root_env, override=True)
load_dotenv()

from agent.events import AgentEvent, EventType
from agent.loop import AgentLoop
from db.connection import init_pool, close_pool
from domains.loader import load_registry, match_domains, get_domain_context
from llm import get_provider
from llm.base import Message
from tools.db_query import DBQueryTool
from tools.list_tables import ListTablesTool
from tools.sp_call import SPCallTool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_HISTORY = int(os.environ.get("MAX_CONVERSATION_HISTORY", "20"))

# In-memory stores
_sessions: dict[str, list[AgentEvent]] = {}
_conversations: dict[str, list[Message]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    registry = load_registry()
    logger.info("Domain registry: %d domains loaded", len(registry))
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    registry = load_registry()
    return {
        "status": "ok",
        "provider": os.environ.get("LLM_PROVIDER", "claude"),
        "domains": list(registry.keys()),
    }


@app.post("/api/query", response_model=QueryResponse)
async def start_query(body: QueryRequest):
    session_id = body.session_id or str(uuid.uuid4())

    if session_id not in _conversations:
        _conversations[session_id] = []

    stream_key = f"{session_id}:{uuid.uuid4().hex[:8]}"
    _sessions[stream_key] = []

    history = _conversations[session_id][-MAX_HISTORY:]

    # Domain matching → schema context injection
    matched_codes = match_domains(body.query)
    domain_ctx = get_domain_context(matched_codes if matched_codes else None)
    if matched_codes:
        logger.info("Domain matched: %s for query: %s", matched_codes, body.query[:50])

    async def _run():
        llm = get_provider()
        tools = [ListTablesTool(), DBQueryTool(), SPCallTool()]
        max_turns = int(os.environ.get("AGENT_MAX_TURNS", "10"))
        loop = AgentLoop(
            llm=llm,
            tools=tools,
            max_turns=max_turns,
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=[".venv"])
