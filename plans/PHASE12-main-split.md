# Phase 12 — main.py 3-split + LLM helper 추출

> 작성: 2026-04-30 (Phase 11 Backend 클로즈 + 외부 진단 수신 직후)
> 입력 자료: 외부 진단 (LLM 검토 보고) + Phase 9·10·11 진행 흐름
> 결정 근거: main.py 638줄이 모든 사이클(Phase 9·10·11)에서 만져지는 병목. 충돌·인지부하 누적.

---

## Context

외부 진단 보고 핵심:

> "main.py (638줄) — HTTP 엔드포인트 + 4개 전역 딕셔너리 + think-block 파서 + 에이전트 루프 오케스트레이션 + 대화 이력 트리밍/영속화 + 도메인 sticky + 에러 복구 finally 50줄. 이 파일 하나가 기능 추가의 병목이 됐다."
>
> "build_report / build_view가 LLM을 직접 호출 — 인프라(db_query/list_tables/sp_call)와 다른 오케스트레이션 레이어. 두 도구가 LLM 호출 로직 40줄씩 복제. 다음 sub-agent 추가 시 패턴 계속 복제."

**나머지 모듈은 OK 평가**:
- `agent/loop.py` 266줄 ✅ 단일 책임
- `llm/` ✅ Provider 추상화
- `tools/base.py` ✅ ABC 최소
- `db/connection.py` ✅ 분리

→ 본 사이클 = **main.py 분리 + LLM helper 추출**. 두 가지만.

### 본 사이클 진입 조건

- Phase 11 Backend 머지 완료 ✅ (commits `464d74d` ~ `aaaef43` + merge `7a45c17`)
- Phase 11 Frontend (B-6) 머지 완료 또는 진행 중 (영역 무충돌)
- **Phase 10 Step 3 (SKILL.md + loader.py) 머지 완료 권장** — Step 3가 main.py에 `from prompts.loader import build_system_prompt` 추가 → 본 사이클이 loader 사용 위치를 새 모듈로 옮김. Step 3 → Phase 12 순서가 충돌 최소.

## 변경 범위

### A. main.py 3-split

현 `backend/main.py:638` → 다음 모듈 분리:

```
backend/
  app.py              ─ FastAPI 인스턴스 + 라우터 + lifespan banner (~150줄)
  session.py          ─ SessionManager class (4개 전역 dict 통합) (~100줄)
  orchestration.py    ─ AgentLoop 구동 + SSE event_generator + stream lifecycle (~250줄)
  main.py             ─ entrypoint (uvicorn run, 또는 삭제하고 app.py에 통합) (~30줄)
```

#### app.py — FastAPI 라우터 레이어

```python
"""FastAPI app + routes — pure HTTP layer."""
from fastapi import FastAPI
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    # banner + db init + domain load (현 main.py:88-140)
    ...

app = FastAPI(title="LLM Harness", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, ...)

# Routes
@app.get("/health") ...
@app.get("/api/domains") ...
@app.get("/api/defaults") ...
@app.post("/api/sql") ...
@app.post("/api/generate_aggregation_sql") ...
@app.post("/api/query") ...     # delegates to orchestration.start_query()
@app.get("/api/stream/{stream_key}") ...    # delegates to orchestration.stream_events()
@app.post("/api/continue/{stream_key}") ...
@app.get("/api/stream_status/{stream_key}") ...
@app.post("/api/cancel/{session_id}") ...
@app.post("/api/suggest_viz") ...
```

라우터는 **얇은 wrapper만** — orchestration 모듈에 위임.

#### session.py — 세션 상태 단일화

```python
"""SessionManager — single source of truth for session state."""
from dataclasses import dataclass, field
import asyncio
from agent.events import AgentEvent
from llm.base import Message

@dataclass
class SessionManager:
    sessions: dict[str, list[AgentEvent]] = field(default_factory=dict)
    conversations: dict[str, list[Message]] = field(default_factory=dict)
    continue_gates: dict[str, asyncio.Event] = field(default_factory=dict)
    continue_results: dict[str, bool] = field(default_factory=dict)
    run_tasks: dict[str, asyncio.Task] = field(default_factory=dict)
    session_domains: dict[str, str] = field(default_factory=dict)

    def get_or_create_conversation(self, session_id: str) -> list[Message]: ...
    def append_event(self, stream_key: str, event: AgentEvent) -> None: ...
    def get_events_after(self, stream_key: str, sent: int) -> list[AgentEvent]: ...
    def register_continue_gate(self, stream_key: str) -> asyncio.Event: ...
    def resolve_continue(self, stream_key: str, result: bool) -> None: ...
    def cleanup_session(self, session_id: str) -> None: ...
    # ...
```

전역 dict 6개 → 단일 인스턴스 메서드. 모듈 import 시 1개 인스턴스 생성 (`session_manager = SessionManager()`). app.py / orchestration.py에서 inject.

미래 영속화 마이그레이션 (snapshot §11 운영 #12) 시 in-memory → Redis/SQLite 교체가 한 클래스 안에서 끝남.

#### orchestration.py — 에이전트 구동 + SSE

```python
"""Agent orchestration — _run task + SSE event_generator."""
from agent.loop import AgentLoop
from llm import get_provider
from session import session_manager
from tools.* import ...

THINK_START_MARKERS, THINK_END_MARKERS = ...   # 현 main.py:63-75 이전
def _find_earliest(...) -> ...: ...

async def start_query(body: QueryRequest) -> str:
    """Create stream_key + spawn _run task. Returns stream_key."""
    ...

async def _run(stream_key, session_id, body, ...):
    """AgentLoop run + terminal log + ErrorEvent injection."""
    ...

async def stream_events(stream_key: str) -> AsyncGenerator[str, None]:
    """SSE event_generator + heartbeat."""
    ...
```

terminal log 로직 (`👤`, `🔧`, `💬`, `🧠 [THINK]`, `❌ ERROR`) + history trim/persist + try/except/finally 50줄 = 모두 여기로.

#### main.py (entrypoint, 30줄)

```python
"""Entrypoint — uvicorn 호환."""
from app import app   # re-export for `uvicorn main:app`
```

또는 직접 `python main.py`로 실행 시:
```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=..., port=..., reload=True)
```

### B. LLM helper 공통화

build_report·build_view 양쪽이 다음 패턴 중복(40줄씩):

```python
# 현재 양쪽 도구에서 비슷한 코드
async def _call_llm_for_xxx(self, messages):
    text_parts = []
    async for ev in self._llm.complete(messages, [], **self._llm_options):
        if ev.type == TEXT_DELTA: text_parts.append(ev.delta)
        elif ev.type == ERROR: raise ...
        elif ev.type == DONE: break
    raw = "".join(text_parts)
    raw = _strip_think(raw)
    raw = _strip_fence(raw)
    try:
        return json.loads(raw)
    except JSONDecodeError as e:
        # retry with error context
        ...
```

→ 공통 helper 추출:

```python
# backend/llm/helpers.py (신설)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)
_FENCE_RE = re.compile(r"^```(?:json)?\s*\n(.*?)\n\s*```$", re.DOTALL | re.MULTILINE)

async def call_llm_for_json(
    llm: LLMProvider,
    messages: list[Message],
    *,
    max_retries: int = 1,
    fence_strip: bool = True,
    think_strip: bool = True,
    max_tokens: int | None = None,
    thinking_enabled: bool | None = None,
    thinking_budget: int | None = None,
) -> dict:
    """sub-agent용 표준 LLM JSON 호출.

    - fence/think strip + 1회 retry + JSON validation
    - 옵션 인자는 provider.complete() forward
    - retry 시 실패 JSON + 에러를 next message에 append하여 LLM에게 회복 단서 제공

    Raises:
        RuntimeError: max_retries 모두 실패 시 (raw output prefix 동봉)
    """
    last_err: Exception | None = None
    last_raw: str = ""
    for attempt in range(max_retries + 1):
        text_parts: list[str] = []
        async for ev in llm.complete(
            messages, [],
            max_tokens=max_tokens,
            thinking_enabled=thinking_enabled,
            thinking_budget=thinking_budget,
        ):
            if ev.type == LLMEventType.TEXT_DELTA:
                text_parts.append(ev.delta)
            elif ev.type == LLMEventType.ERROR:
                raise RuntimeError(f"LLM error: {ev.message}")
            elif ev.type == LLMEventType.DONE:
                break
        raw = "".join(text_parts)
        last_raw = raw
        if think_strip:
            raw = _THINK_RE.sub("", raw)
        if fence_strip:
            m = _FENCE_RE.search(raw)
            if m:
                raw = m.group(1)
        raw = raw.strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            last_err = e
            if attempt < max_retries:
                messages = messages + [
                    {"role": "assistant", "content": raw},
                    {"role": "user", "content": (
                        f"Previous JSON failed validation: {e}. "
                        "Output corrected JSON only — no markdown, no explanation."
                    )},
                ]
    raise RuntimeError(
        f"LLM returned invalid JSON after {max_retries+1} attempts: {last_err}\n"
        f"Last raw output (first 500 chars): {last_raw[:500]}"
    )
```

`build_report/tool.py:_call_llm_for_report` + `build_view/tool.py:_infer_axis` 양쪽 helper 사용으로 wrap. 코드 ~80줄 → ~30줄. 미래 sub-agent 추가는 1줄 helper 호출.

검증: 기존 retry 동작 = max_retries=1 default. fence/think strip 동일.

## 변경 파일 요약

| 파일 | 동작 | 비고 |
|---|---|---|
| `backend/app.py` | 신설 | FastAPI + routes (얇은 wrapper) |
| `backend/session.py` | 신설 | SessionManager class |
| `backend/orchestration.py` | 신설 | _run task + SSE event_generator + terminal log |
| `backend/main.py` | 압축 또는 삭제 | 30줄 entrypoint or 통합 |
| `backend/llm/helpers.py` | 신설 | call_llm_for_json |
| `backend/tools/build_report/tool.py` | 수정 | _call_llm_for_report → call_llm_for_json wrap |
| `backend/tools/build_view/tool.py` | 수정 | _infer_axis → call_llm_for_json wrap |

`uvicorn main:app` 호환 유지 — `main.py`가 `app` re-export 또는 새 entrypoint(`uvicorn app:app`).

## 잠금 영향

- 모든 SSE 이벤트 스키마 무변경 (단순 코드 위치 이동)
- `LLMProvider.complete` 시그니처 무변경 (Phase 11에서 확정된 시그니처 그대로 helper에 wrap)
- `BuildReportTool` / `BuildViewTool` input/output 무변경 (내부 helper만 교체)
- ReportSchema / ViewBundle 무변경
- **위험 영역 §5.2 접촉**: API 라우터 경로/메소드 — 무변경 (위치만 이동). 시스템 프롬프트 — 무변경. SSE 스키마 — 무변경. **본 plan = supervisor 사전 합의 박제**.

## 검증

### import + route count
```powershell
cd backend
uv run python -c "from app import app; print('routes:', len(app.routes))"
# 16 expected (Phase 11 기준 그대로)
```

### SessionManager 동작
```powershell
uv run python -c "
from session import session_manager, SessionManager
sm = SessionManager()
sm.get_or_create_conversation('s1')
sm.append_event('s1:abc', SomeEvent)
print(len(sm.sessions['s1:abc']))
"
```

### LLM helper 단위
```powershell
# Mock provider로 call_llm_for_json 테스트 (fixture)
uv run python -c "
from llm.helpers import call_llm_for_json
# ... mock LLMProvider that yields text_delta + done
# expect dict result
"
```

### 통합 회귀 (사용자 환경)
- Phase 11 통합 회귀와 동일 시나리오. main.py split 후에도 chain 그대로 작동.
- TweaksPanel UI 변경은 본 사이클 무관.

## Phase 11 / Step 3 / Phase 12 의존성

```
Phase 11 Backend (완료)
   ↓
Phase 10 Step 3 (SKILL.md + loader.py) 권장 선행
   ↓
Phase 11 Frontend B-6 (영역 분리, 무관)  →  ←  Phase 12 (본 plan)
```

Phase 12와 Step 3가 둘 다 main.py 만짐 → **Step 3 머지 후 Phase 12 진입**이 깔끔. 동시 진행 시 main.py 충돌 발생 위험.

## 진행 권장

### 위임 분배
- **BackEnd Infra 위임 1회** (worktree `agent/backend-infra`): A (main.py 3-split) + B (LLM helper) 묶음
  - 본 plan은 외부 진단 권고대로 분리 단위 명확
  - 3-split + helper = 단일 위임 적정 (모두 backend 영역, 모두 같은 inflight worktree)

### 순서
1. Phase 11 Frontend B-6 + Phase 10 Step 3 동시 진행 (영역 분리)
2. Step 3 머지 → Phase 12 진입
3. Phase 12 머지 → 다음 Phase (B4 / C1 / B1·B2·B3 / 도메인 schema 화이트리스트 등)

### worktree 충돌 가드
- Step 3가 만진 main.py 변경(`from prompts.loader import build_system_prompt`)이 Phase 12 진입 시 새 모듈로 옮겨감
- Phase 12 위임 명세에 "Step 3가 추가한 loader 호출을 어느 새 모듈로 이동할지" 명시

## 박제 / 후속

본 plan 적용 후 supervisorSnapshot.md §14 신설.

### error-case.md 영향 (직접 해소 케이스 없음)
본 plan은 구조 리팩터 — 직접 case 해소 X. 다만:
- 미래 case 진단 시 "main.py 어느 줄"이 아니라 "session.py / orchestration.py 어느 줄" 로 좁아져 분석 비용 ↓
- 미래 sub-agent 추가 시 LLM helper 1줄 호출로 끝나므로 재발 case 패턴 자체 회피

### 갱신 필요 문서
- SPEC.md §1 디렉토리 트리 — backend/ 항목 갱신
- SPEC.md §3 entrypoint — `uvicorn main:app` 또는 `uvicorn app:app` 갱신
- HANDOFF.md / agent-prompts/backend-infra.md §1 작업 영역 — `backend/main.py` 항목을 `app.py / session.py / orchestration.py`로 분할 명시

## 별도 사이클 (본 plan 범위 외)

- B4 / C1 / B1·B2·B3 (P0 잔재) — 본 plan 후 진입
- Phase 10 Step 4 — `backend/agents/` 디렉토리 (SubAgent 카탈로그 README) — Phase 12 후
- 세션 영속화 마이그레이션 (in-memory → SQLite/Redis) — SessionManager 객체화로 인터페이스 fixed → 별도 사이클에서 구현 교체 cheap
