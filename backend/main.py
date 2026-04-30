"""FastAPI entrypoint — LLM Harness PoC."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
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

from agent.events import (
    AgentEvent,
    ErrorEvent,
    EventType,
    ReportProposedEvent,
    ReportProposedMeta,
)
from agent.history import normalize_for_persistence, trim_history_safely
from agent.loop import AgentLoop
from db.connection import init_pool, close_pool
from domains.loader import load_all_domains, match_domain, domain_to_context, get_domains_summary
from llm import get_provider
from llm.base import Message
from storage import Report, delete_report, get_report, list_reports, save_report
from tools.build_schema import BuildSchemaTool
from tools.build_view import BuildViewTool
from tools.db_query import DBQueryTool
from tools.list_tables import ListTablesTool
from tools.report_generate import ReportGenerateTool
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
_run_tasks: dict[str, asyncio.Task] = {}
# Sticky domain per session: follow-up turns rarely repeat domain keywords,
# so without this fallback domain_to_context drops out and the LLM loses
# schema → hallucinates column names from prior result headers.
_session_domains: dict[str, str] = {}

# Pending report proposals — keyed by id_temp (uuid hex). Populated when the
# agent loop runs report_generate; consumed by /api/reports/confirm/{id_temp}
# (save) or /api/reports/proposal/{id_temp} (discard). 10-min TTL: stale
# entries are filtered on access (no background sweep needed at this scale).
_report_proposals: dict[str, dict] = {}
_REPORT_PROPOSAL_TTL_SEC = 600
# Schema contract version — bumped when ReportSchema block catalog changes.
# Cycle 2 = "2" (7 blocks + 7 viz_hints).
_REPORT_SCHEMA_VERSION = "2"


def _proposal_is_fresh(entry: dict) -> bool:
    return (time.time() - entry.get("created_at", 0)) <= _REPORT_PROPOSAL_TTL_SEC


def _purge_stale_proposals() -> None:
    """Drop entries older than the TTL. Called on access — cheap at demo scale."""
    stale = [k for k, v in _report_proposals.items() if not _proposal_is_fresh(v)]
    for k in stale:
        _report_proposals.pop(k, None)


def _build_report_proposed(
    *,
    session_domain: str,
    tool_input: dict,
    tool_output: object,
) -> ReportProposedEvent | None:
    """Compose a ReportProposedEvent + register the proposal in _report_proposals.

    Returns None when the inputs are not in the expected shape (defensive — a
    sub_agent could in principle return malformed data). Mutates the global
    _report_proposals dict as a side effect so the proposal can later be
    confirmed via /api/reports/confirm/{id_temp}.
    """
    schema_dict = tool_input.get("report_schema") if isinstance(tool_input, dict) else None
    if not isinstance(schema_dict, dict):
        logger.warning("report_proposed: missing report_schema in tool_input")
        return None

    meta_out = tool_output if isinstance(tool_output, dict) else {}
    title = (meta_out.get("title") or schema_dict.get("title") or "(untitled)").strip()
    summary = (meta_out.get("summary") or "").strip()
    domain = (meta_out.get("domain") or session_domain or "").strip()
    raw_tags = meta_out.get("tags") or []
    tags = [str(t) for t in raw_tags if isinstance(t, (str, int, float))]

    id_temp = uuid.uuid4().hex[:12]
    blocks_n = len(schema_dict.get("blocks", []) or [])
    refs_n = len(schema_dict.get("data_refs", []) or [])

    _report_proposals[id_temp] = {
        "id_temp": id_temp,
        "schema": schema_dict,
        "title": title,
        "summary": summary,
        "domain": domain,
        "tags": tags,
        "meta": {
            "blocks": blocks_n,
            "dataRefs": refs_n,
            "schemaVersion": _REPORT_SCHEMA_VERSION,
        },
        "created_at": time.time(),
    }

    return ReportProposedEvent(
        id_temp=id_temp,
        meta=ReportProposedMeta(
            blocks=blocks_n,
            dataRefs=refs_n,
            domain=domain,
            schemaVersion=_REPORT_SCHEMA_VERSION,
        ),
        schema_=schema_dict,
        summary=summary,
    )


# ---------------------------------------------------------------------------
# Thinking-block markers — extended to recognize multiple model formats
# ---------------------------------------------------------------------------
# Different reasoning models emit different open/close markers around their
# chain-of-thought. We recognize the common ones and treat them all as the
# same hidden "think" region in the terminal log.
THINK_START_MARKERS: tuple[str, ...] = (
    "<think>",
    "<|channel|>thought",
    "<|channel|>analysis",
    "<|channel>thought",
    "<|channel>analysis",
)
THINK_END_MARKERS: tuple[str, ...] = (
    "</think>",
    "<|channel|>final",
    "<|channel>final",
    "<|end|>",
)


def _find_earliest(buf: str, markers: tuple[str, ...]) -> tuple[int, str]:
    """Return (idx, marker) of the earliest-occurring marker, or (-1, '')."""
    best_idx, best_marker = -1, ""
    for m in markers:
        idx = buf.find(m)
        if idx != -1 and (best_idx == -1 or idx < best_idx):
            best_idx, best_marker = idx, m
    return best_idx, best_marker


@asynccontextmanager
async def lifespan(app: FastAPI):
    import httpx as _httpx

    host = os.environ.get("SERVER_HOST", "0.0.0.0")
    port = os.environ.get("SERVER_PORT", "8000")
    llm_base = os.environ.get("LM_STUDIO_BASE_URL", "http://localhost:1234/v1").rstrip("/")

    print("─" * 50)
    print(f"  Server   : http://{host}:{port}")

    # LLM provider + reachability
    provider = os.environ.get("LLM_PROVIDER", "claude").lower()
    print(f"  Provider : {provider}")
    if provider == "lm_studio":
        try:
            async with _httpx.AsyncClient(timeout=3.0) as c:
                r = await c.get(f"{llm_base}/models")
            models = r.json().get("data", [])
            names = ", ".join(m.get("id", "") for m in models[:3]) or "—"
            print(f"  LLM      : ✔  {llm_base}  [{names}]")
        except Exception as e:
            print(f"  LLM      : ✘  {llm_base}  ({e})")
    elif provider == "claude":
        has_key = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
        model = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
        mark = "✔" if has_key else "✘ (ANTHROPIC_API_KEY missing)"
        print(f"  LLM      : {mark}  Anthropic API  [{model}]")
    else:
        print(
            f"  LLM      : ✘  Unknown provider {provider!r} "
            "(expected 'claude' or 'lm_studio')"
        )

    # MSSQL health
    try:
        await init_pool()
        server = os.environ.get("MSSQL_SERVER", "?")
        db = os.environ.get("MSSQL_DATABASE", "?")
        print(f"  MSSQL    : ✔  {server} / {db}")
    except Exception as e:
        print(f"  MSSQL    : ✘  {e}")

    domains = load_all_domains()
    summary = get_domains_summary()
    total_tables = sum(s["table_count"] for s in summary)
    total_sps = sum(s["sp_count"] for s in summary)
    names = ", ".join(s["display_name"] for s in summary) or "none"
    print(f"  Domains  : {len(domains)} loaded ({names}), {total_tables} tables, {total_sps} SPs")
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
    # Optional per-request LLM tuning (forwarded to provider.complete via AgentLoop).
    # When None, provider falls back to env defaults.
    max_tokens: int | None = None              # 1000 ~ 32000
    thinking_enabled: bool | None = None
    thinking_budget: int | None = None         # 1024 ~ 16000


class QueryResponse(BaseModel):
    session_id: str
    status: str  # stream_key


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    summary = get_domains_summary()
    return {
        "status": "ok",
        "provider": os.environ.get("LLM_PROVIDER", "claude"),
        "domains": [s["domain"] for s in summary],
    }


@app.get("/api/domains")
async def list_domains():
    """Return registered domains for frontend dynamic rendering."""
    return get_domains_summary()


@app.get("/api/defaults")
async def get_defaults():
    """Provider-aware default tuning values for the frontend tweak panel."""
    provider = os.environ.get("LLM_PROVIDER", "claude").lower()
    max_tokens_env = (
        "CLAUDE_MAX_TOKENS" if provider == "claude" else "LM_STUDIO_MAX_TOKENS"
    )
    return {
        "provider": provider,
        "max_tokens": int(os.environ.get(max_tokens_env, "10000")),
        "thinking_budget": int(os.environ.get("CLAUDE_THINKING_BUDGET", "4096")),
        "thinking_supported": provider == "claude",
    }


class SqlRequest(BaseModel):
    sql: str


@app.post("/api/sql")
async def execute_sql(body: SqlRequest):
    """Direct SQL execution — no LLM, no agent. SELECT only."""
    import asyncio as _aio
    from tools.db_query import _assert_read_only

    sql = body.sql.strip()
    _assert_read_only(sql)

    from db.connection import get_connection
    async with get_connection() as conn:
        loop = _aio.get_event_loop()

        def _run():
            cursor = conn.cursor()
            cursor.execute(sql)
            if cursor.description:
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                cursor.close()
                return [dict(zip(columns, row)) for row in rows]
            cursor.close()
            return []

        data = await loop.run_in_executor(None, _run)
        return {"data": data, "rows": len(data)}


# ---------------------------------------------------------------------------
# UI Builder endpoints (Track C)
# ---------------------------------------------------------------------------

class SuggestVizRequest(BaseModel):
    sample: list[dict]


@app.post("/api/suggest_viz")
async def suggest_viz(body: SuggestVizRequest):
    """LLM-based viz suggestion. Analyzes sample data shape and returns viz_hint + axes."""
    if not body.sample:
        return {"viz_hint": "table", "x_axis": None, "y_axis": None, "reasoning": "데이터 없음"}

    # Heuristic first — deterministic fallback
    keys = list(body.sample[0].keys())
    numeric_cols = [
        k for k in keys if isinstance(body.sample[0].get(k), (int, float))
    ]
    non_numeric = [k for k in keys if k not in numeric_cols]

    # Default
    viz_hint = "table"
    x_axis = non_numeric[0] if non_numeric else (keys[0] if keys else None)
    y_axis = numeric_cols[0] if numeric_cols else None
    reasoning = "데이터 형태 기반 자동 추론"

    if len(body.sample) == 1 and len(keys) == 1:
        viz_hint = "number"
        reasoning = "단일 값 — 숫자 카드로 표시"
    elif numeric_cols and non_numeric:
        date_hints = {"date", "month", "week", "year", "time", "dt", "일", "월", "주"}
        is_time_series = any(
            any(h in k.lower() for h in date_hints) for k in non_numeric
        )
        if is_time_series:
            viz_hint = "line_chart"
            reasoning = f"{x_axis}(시계열) 대비 {y_axis} 추이"
        else:
            viz_hint = "bar_chart"
            reasoning = f"{x_axis}별 {y_axis} 비교"

    # Optional: enrich with LLM (short prompt, low cost). For PoC, return heuristic only.
    return {
        "viz_hint": viz_hint,
        "x_axis": x_axis,
        "y_axis": y_axis,
        "reasoning": reasoning,
    }


class GenerateSqlRequest(BaseModel):
    prompt: str
    domain: str | None = None


@app.post("/api/generate_aggregation_sql")
async def generate_aggregation_sql(body: GenerateSqlRequest):
    """LLM-based SQL generation for aggregation queries. Single-shot, no SSE."""
    llm = get_provider()

    # Build domain context
    domain_ctx = ""
    if body.domain:
        for d in load_all_domains():
            if d.get("domain") == body.domain:
                domain_ctx = domain_to_context(d)
                break

    system_prompt = (
        "You are a T-SQL expert. Given a natural language request, output ONLY a valid SELECT "
        "statement that performs the requested aggregation. Do not include any explanation, "
        "markdown, or code fences — output raw SQL only. Use TOP N instead of LIMIT N. "
        "Ensure the query is read-only (SELECT only, no DML/DDL).\n\n"
        + domain_ctx
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": body.prompt},
    ]

    sql_parts: list[str] = []
    async for event in llm.complete(messages, []):
        if event.type.value == "text_delta":
            sql_parts.append(event.delta)
        elif event.type.value == "done":
            break
        elif event.type.value == "error":
            raise HTTPException(status_code=500, detail=event.message)

    sql = "".join(sql_parts).strip()
    # Strip common wrappers
    if sql.startswith("```"):
        lines = sql.split("\n")
        sql = "\n".join(l for l in lines if not l.strip().startswith("```"))
    sql = sql.strip()

    return {"sql": sql, "explanation": "LLM 생성"}


@app.post("/api/query", response_model=QueryResponse)
async def start_query(body: QueryRequest):
    session_id = body.session_id or str(uuid.uuid4())

    if session_id not in _conversations:
        _conversations[session_id] = []

    stream_key = f"{session_id}:{uuid.uuid4().hex[:8]}"
    _sessions[stream_key] = []

    history = trim_history_safely(_conversations[session_id], MAX_HISTORY)

    # Domain matching → schema context injection (sticky per session)
    matched = match_domain(body.query)
    if matched is not None:
        _session_domains[session_id] = matched.get("domain", "")
        logger.info("Domain matched: %s for query: %s", matched.get("domain"), body.query[:50])
    elif session_id in _session_domains:
        sticky_code = _session_domains[session_id]
        for d in load_all_domains():
            if d.get("domain") == sticky_code:
                matched = d
                logger.info("Domain sticky: %s for query: %s", sticky_code, body.query[:50])
                break
    domain_ctx = domain_to_context(matched) if matched else ""

    # Append user message to conversation history IMMEDIATELY so that
    # (a) concurrent/quickly-fired follow-ups see it and
    # (b) task crashes don't desync history.
    _conversations[session_id].append({"role": "user", "content": body.query})

    async def _run():
        llm = get_provider()
        tools = [
            ListTablesTool(), DBQueryTool(), SPCallTool(),
            BuildSchemaTool(llm=llm), BuildViewTool(llm=llm),
            ReportGenerateTool(llm=llm),
        ]
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
            max_tokens=body.max_tokens,
            thinking_enabled=body.thinking_enabled,
            thinking_budget=body.thinking_budget,
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
        # report_generate tool_start input 캡처 — tool_result 시점에 사용해
        # ReportProposedEvent를 합성하기 위한 1-shot 버퍼.
        _pending_report_input: dict | None = None
        # ─────────────────────────────────────────────────────────

        final_answer = ""
        run_error: str | None = None
        try:
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
                    if event.tool == "report_generate":
                        _pending_report_input = event.input

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
                    if (
                        event.tool == "report_generate"
                        and event.error is None
                        and _pending_report_input is not None
                    ):
                        proposed = _build_report_proposed(
                            session_domain=_session_domains.get(session_id, ""),
                            tool_input=_pending_report_input,
                            tool_output=event.output,
                        )
                        if proposed is not None:
                            _sessions[stream_key].append(proposed)
                            print(
                                f"   📄 report_proposed id_temp={proposed.id_temp}",
                                flush=True,
                            )
                        _pending_report_input = None

                elif event.type == EventType.LLM_CHUNK:
                    _buf += event.delta
                    # think 블록 마커 감지 (<think> 외에 Harmony-style 마커 포함)
                    # 안전 구간(마지막 '<' 이전)까지만 출력하여 partial-tag 보호.
                    while True:
                        if not _in_think:
                            ti, start_marker = _find_earliest(_buf, THINK_START_MARKERS)
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
                                _buf = _buf[ti + len(start_marker):]
                        else:
                            ci, end_marker = _find_earliest(_buf, THINK_END_MARKERS)
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
                                _buf = _buf[ci + len(end_marker):]

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
                    run_error = event.message
                    break
                # ─────────────────────────────────────────────────────
        except asyncio.CancelledError:
            logger.info("Agent task cancelled: stream=%s", stream_key)
            # SSE event_generator가 종료되도록 ERROR 이벤트 주입
            _sessions[stream_key].append(
                ErrorEvent(message="Cancelled by user")
            )
            # continue_prompt 대기 중이면 풀어주기 (task가 정상 cleanup하도록)
            gate = _continue_gates.pop(stream_key, None)
            if gate is not None:
                gate.set()
            print(f"\n⛔ Cancelled by user", flush=True)
            print("═" * W, flush=True)
            run_error = "Cancelled by user"
            raise  # task가 cancelled 상태로 정리되도록 재발생
        except Exception as e:
            logger.exception("AgentLoop crashed for session %s: %s", session_id, e)
            run_error = str(e)
            # CRITICAL: append ErrorEvent so SSE event_generator has a terminator.
            # Without this the stream buffer never reaches FINAL/ERROR and the
            # frontend's EventSource hangs indefinitely showing "처리 중...".
            _sessions[stream_key].append(
                ErrorEvent(message=f"Agent loop error: {run_error[:200]}")
            )
            # Release any pending continue gate so cleanup completes.
            gate = _continue_gates.pop(stream_key, None)
            if gate is not None:
                gate.set()
            print(f"\n❌ ERROR: {run_error}", flush=True)
            print("═" * W, flush=True)
        finally:
            # Always pair user message (appended before task) with an assistant
            # turn — even empty/errored — so history stays balanced for
            # subsequent turns. If omitted the next /api/query would see
            # history ending with unpaired user msg and context would desync.
            if not final_answer:
                if run_error:
                    final_answer = f"(error: {run_error[:200]})"
                    logger.warning(
                        "Session %s: replacing final_answer with error placeholder for query %r",
                        session_id, body.query[:80],
                    )
                else:
                    final_answer = "(empty response)"
                    logger.warning(
                        "Session %s: empty final_answer for query %r — storing placeholder",
                        session_id, body.query[:80],
                    )
            if run_error is None:
                # Success path: replace with full message history (user + assistant tool_use
                # + tool result + final assistant) so next turn sees the actual columns/values.
                final_msgs = loop.get_final_messages()
                if final_msgs:
                    _conversations[session_id] = normalize_for_persistence(final_msgs)
                else:
                    _conversations[session_id].append(
                        {"role": "assistant", "content": final_answer}
                    )
            else:
                # Error path: keep line-336 user append and add error placeholder assistant
                # so history balance is preserved for subsequent turns.
                _conversations[session_id].append(
                    {"role": "assistant", "content": final_answer}
                )

    task = asyncio.create_task(_run())
    _run_tasks[stream_key] = task
    task.add_done_callback(lambda t: _run_tasks.pop(stream_key, None))
    return QueryResponse(session_id=session_id, status=stream_key)


@app.get("/api/stream/{stream_key}")
async def stream_events(stream_key: str):
    if stream_key not in _sessions:
        raise HTTPException(status_code=404, detail="Stream not found")

    async def event_generator():
        # Idle keep-alive: long LLM reasoning (chain-of-thought, sub-agent
        # calls) can leave _sessions[stream_key] empty for tens of seconds.
        # Without a periodic comment line, intermediaries (nginx / Vite proxy
        # / browser EventSource) may close the connection on idle (G7). Pair
        # this with the longer LM_STUDIO_TIMEOUT_READ in lm_studio.py (A3).
        sent = 0
        loop = asyncio.get_event_loop()
        last_yield = loop.time()
        heartbeat_interval = float(os.environ.get("SSE_HEARTBEAT_SEC", "15"))
        while True:
            events = _sessions[stream_key]
            emitted = False
            while sent < len(events):
                event = events[sent]
                # by_alias=True so ReportProposedEvent.schema_ serializes as "schema"
                # (and matches frontend types/events.ts mirror). Existing events have
                # no aliases, so by_alias is a no-op for them.
                data = json.dumps(
                    event.model_dump(by_alias=True),
                    ensure_ascii=False,
                    default=str,
                )
                yield f"event: {event.type.value}\ndata: {data}\n\n"
                sent += 1
                emitted = True
                if event.type in (EventType.FINAL, EventType.ERROR):
                    return
            now = loop.time()
            if emitted:
                last_yield = now
            elif now - last_yield >= heartbeat_interval:
                # SSE comment lines are ignored by EventSource clients but
                # keep the TCP connection alive across proxies.
                yield ": heartbeat\n\n"
                last_yield = now
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


@app.get("/api/stream_status/{stream_key}")
async def stream_status(stream_key: str):
    """Lightweight check of whether a stream is still meaningfully connectable.

    Used by the frontend on conversation re-entry to decide whether to
    reconnect or to mark a stale streaming message as errored.
    """
    events = _sessions.get(stream_key)
    if events is None:
        return {
            "exists": False,
            "completed": False,
            "last_event_type": None,
            "event_count": 0,
        }
    last_type = events[-1].type.value if events else None
    completed = last_type in ("final", "error")
    return {
        "exists": True,
        "completed": completed,
        "last_event_type": last_type,
        "event_count": len(events),
    }


@app.post("/api/cancel/{session_id}")
async def cancel_session(session_id: str):
    """Cancel any in-flight agent task(s) for this session.

    Propagates asyncio.CancelledError into the agent loop, which closes the
    LLM stream connection (httpx / anthropic SDK async context managers),
    causing the LLM server to stop generating tokens.
    """
    cancelled: list[str] = []
    for stream_key in list(_run_tasks.keys()):
        if stream_key.startswith(f"{session_id}:"):
            task = _run_tasks.get(stream_key)
            if task and not task.done():
                task.cancel()
                cancelled.append(stream_key)
    logger.info("Cancel requested for session %s: %d task(s)", session_id, len(cancelled))
    return {"cancelled": cancelled, "count": len(cancelled)}


@app.delete("/api/session/{session_id}")
async def clear_session(session_id: str):
    _conversations.pop(session_id, None)
    _session_domains.pop(session_id, None)
    keys_to_remove = [k for k in _sessions if k.startswith(session_id)]
    for k in keys_to_remove:
        _sessions.pop(k, None)
    return {"deleted": session_id}


# ---------------------------------------------------------------------------
# Reports archive — Cycle 2 Phase B
# ---------------------------------------------------------------------------

class ReportConfirmRequest(BaseModel):
    """Body for POST /api/reports/confirm/{id_temp}.

    Both fields are optional — frontend sends them only when the user edits
    title/tags inline before confirming. Empty/None values fall back to the
    sub_agent-derived defaults stored in the proposal.
    """
    title: str | None = None
    tags: list[str] | None = None


@app.get("/api/reports")
async def reports_list():
    """Return the archive listing — newest first, lightweight fields only."""
    return list_reports()


@app.get("/api/reports/{report_id}")
async def reports_get(report_id: str):
    report = get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.model_dump(mode="json", by_alias=True)


@app.delete("/api/reports/{report_id}")
async def reports_delete(report_id: str):
    if not delete_report(report_id):
        raise HTTPException(status_code=404, detail="Report not found")
    return {"deleted": report_id}


@app.post("/api/reports/confirm/{id_temp}")
async def reports_confirm(id_temp: str, body: ReportConfirmRequest):
    """HITL confirmation — persist a pending proposal as a permanent Report."""
    _purge_stale_proposals()
    proposal = _report_proposals.pop(id_temp, None)
    if proposal is None:
        raise HTTPException(status_code=404, detail="No pending proposal (missing or expired)")

    title = (body.title or "").strip() or proposal.get("title") or "(untitled)"
    if body.tags is not None:
        tags = [str(t) for t in body.tags if isinstance(t, (str, int, float))]
    else:
        tags = list(proposal.get("tags") or [])

    report = Report.model_validate({
        "title": title,
        "domain": proposal.get("domain", ""),
        "tags": tags,
        "schema": proposal.get("schema", {}),
        "summary": proposal.get("summary", ""),
        "meta": proposal.get("meta", {}),
    })
    save_report(report)
    return report.model_dump(mode="json", by_alias=True)


@app.delete("/api/reports/proposal/{id_temp}")
async def reports_reject_proposal(id_temp: str):
    """User rejected the proposal — drop it from the in-memory store."""
    _purge_stale_proposals()
    if _report_proposals.pop(id_temp, None) is None:
        raise HTTPException(status_code=404, detail="No pending proposal (missing or expired)")
    return {"discarded": id_temp}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=[".venv"])
