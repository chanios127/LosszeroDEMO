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
from domains.loader import load_registry, load_sp_whitelist, match_domains, get_domain_context
from llm import get_provider
from llm.base import Message
from tools.db_query import DBQueryTool
from tools.list_tables import ListTablesTool
from tools.sp_call import SPCallTool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 자동 로그 억제
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

MAX_HISTORY = int(os.environ.get("MAX_CONVERSATION_HISTORY", "20"))

# In-memory stores
_sessions: dict[str, list[AgentEvent]] = {}
_conversations: dict[str, list[Message]] = {}
_continue_gates: dict[str, asyncio.Event] = {}
_continue_results: dict[str, bool] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    import httpx as _httpx

    host = os.environ.get("SERVER_HOST", "0.0.0.0")
    port = os.environ.get("SERVER_PORT", "8000")
    llm_base = os.environ.get("LM_STUDIO_BASE_URL", "http://localhost:1234/v1").rstrip("/")

    print("─" * 50)
    print(f"  Server   : http://{host}:{port}")

    # LLM 서버 health
    try:
        async with _httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{llm_base}/models")
        models = r.json().get("data", [])
        names = ", ".join(m.get("id", "") for m in models[:3]) or "—"
        print(f"  LLM      : ✔  {llm_base}  [{names}]")
    except Exception as e:
        print(f"  LLM      : ✘  {llm_base}  ({e})")

    # MSSQL health
    try:
        await init_pool()
        server = os.environ.get("MSSQL_SERVER", "?")
        db = os.environ.get("MSSQL_DATABASE", "?")
        print(f"  MSSQL    : ✔  {server} / {db}")
    except Exception as e:
        print(f"  MSSQL    : ✘  {e}")

    registry = load_registry()
    sp_wl = load_sp_whitelist()
    sp_count = sum(len(v.get("procedures", {})) for v in sp_wl.values())
    print(f"  Domains  : {len(registry)} loaded, {sp_count} SPs whitelisted")
    print("─" * 50, flush=True)

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

        async def _continue_callback() -> bool:
            gate = asyncio.Event()
            _continue_gates[stream_key] = gate
            _continue_results[stream_key] = False
            try:
                await asyncio.wait_for(gate.wait(), timeout=120.0)
            except asyncio.TimeoutError:
                return False
            finally:
                _continue_gates.pop(stream_key, None)
            return _continue_results.pop(stream_key, False)

        loop = AgentLoop(
            llm=llm,
            tools=tools,
            max_turns=max_turns,
            domain_context=domain_ctx,
            continue_callback=_continue_callback,
        )

        # ── 터미널 로그 상태 ──────────────────────────────────────
        W = 60
        print("═" * W)
        print(f"👤  {body.query}")
        print("═" * W, flush=True)

        # <think> 블록 실시간 감지용 버퍼
        _buf = ""          # 청크 누적 버퍼
        _in_think = False  # think 블록 진입 여부
        _ans_started = False  # 💬 접두사 출력 여부
        # ─────────────────────────────────────────────────────────

        final_answer = ""
        async for event in loop.run(body.query, history=history):
            _sessions[stream_key].append(event)

            # ── 터미널 출력 ───────────────────────────────────────
            if event.type == EventType.TOOL_START:
                # think 중이었으면 줄바꿈 정리
                if _in_think or _ans_started:
                    print(flush=True)
                    _in_think = False
                    _ans_started = False
                args = json.dumps(event.input, ensure_ascii=False)
                print(f"🔧 [T{event.turn}] {event.tool}({args})", flush=True)

            elif event.type == EventType.TOOL_RESULT:
                if event.error:
                    print(f"   ❌ {event.error}", flush=True)
                elif event.rows is not None:
                    print(f"   → {event.rows} rows", flush=True)
                else:
                    snippet = str(event.output)[:200].replace("\n", " ")
                    if len(str(event.output)) > 200:
                        snippet += "..."
                    print(f"   → {snippet}", flush=True)

            elif event.type == EventType.LLM_CHUNK:
                _buf += event.delta
                # <think>/<\/think> 감지하며 안전 구간 출력
                while True:
                    if not _in_think:
                        ti = _buf.find("<think>")
                        if ti == -1:
                            safe = _buf.rfind("<") if "<" in _buf else len(_buf)
                            if safe > 0:
                                text = _buf[:safe]
                                if text:
                                    if not _ans_started:
                                        print("💬 ", end="", flush=True)
                                        _ans_started = True
                                    print(text, end="", flush=True)
                                _buf = _buf[safe:]
                            break
                        else:
                            if ti > 0:
                                before = _buf[:ti]
                                if not _ans_started:
                                    print("💬 ", end="", flush=True)
                                    _ans_started = True
                                print(before, end="", flush=True)
                            print("\n🧠 [THINK] ", end="", flush=True)
                            _in_think = True
                            _ans_started = False
                            _buf = _buf[ti + len("<think>"):]
                    else:
                        ci = _buf.find("</think>")
                        if ci == -1:
                            safe = _buf.rfind("<") if "<" in _buf else len(_buf)
                            if safe > 0:
                                print(_buf[:safe], end="", flush=True)
                                _buf = _buf[safe:]
                            break
                        else:
                            print(_buf[:ci], end="", flush=True)
                            print()
                            _in_think = False
                            _buf = _buf[ci + len("</think>"):]

            elif event.type == EventType.FINAL:
                # 버퍼 잔여분 출력
                if _buf:
                    if not _ans_started and not _in_think:
                        print("💬 ", end="", flush=True)
                    print(_buf, end="", flush=True)
                print()
                print("═" * W, flush=True)
                final_answer = event.answer
                break

            elif event.type == EventType.CONTINUE_PROMPT:
                print(f"\n⏸️  {event.message}", flush=True)

            elif event.type == EventType.ERROR:
                if _buf:
                    print(_buf, end="", flush=True)
                print(f"\n❌ ERROR: {event.message}", flush=True)
                print("═" * W, flush=True)
                break
            # ─────────────────────────────────────────────────────

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


class ContinueRequest(BaseModel):
    proceed: bool


@app.post("/api/continue/{stream_key}")
async def continue_agent(stream_key: str, body: ContinueRequest):
    """User approves or declines continuing past max_turns."""
    gate = _continue_gates.get(stream_key)
    if gate is None:
        raise HTTPException(status_code=404, detail="No pending continue prompt")
    _continue_results[stream_key] = body.proceed
    gate.set()
    return {"continued": body.proceed}


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
