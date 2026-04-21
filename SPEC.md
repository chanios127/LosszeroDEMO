# LLM Harness — 시스템 명세서

> 최종 갱신: 2026-04-16 (Phase 5 완료 시점)

MSSQL ERP/MES/그룹웨어 데이터를 자연어로 조회하고 시각화하는 에이전트 시스템.

---

## 1. 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 18.3, Vite 5, TypeScript 5, Tailwind CSS 3 |
| 시각화 | Recharts 2.12, @tanstack/react-table, react-markdown, remark-gfm |
| Backend | FastAPI, Python 3.12+, pyodbc (ODBC async via `run_in_executor`) |
| LLM | Anthropic SDK (Claude) / httpx (LM Studio OpenAI 호환) |
| DB | MSSQL (읽기 전용) |
| 패키지 관리 | uv (Python), pnpm (Node) |

---

## 2. 디렉토리 구조

```
LosszeroDEMO/
├── backend/
│   ├── main.py                          # FastAPI 엔트리, 모든 라우터
│   ├── pyproject.toml                   # uv 의존성
│   ├── uv.lock
│   ├── agent/
│   │   ├── events.py                    # SSE 이벤트 타입 6종
│   │   └── loop.py                      # AgentLoop (ReAct 멀티턴, 10턴 + continue)
│   ├── llm/
│   │   ├── base.py                      # LLMProvider ABC, Message, ToolSchema
│   │   ├── __init__.py                  # Provider 팩토리
│   │   ├── claude.py                    # Anthropic 스트리밍
│   │   └── lm_studio.py                # OpenAI 호환 + <execute_sql> fallback
│   ├── tools/
│   │   ├── base.py                      # Tool ABC
│   │   ├── list_tables.py              # 테이블명 조회 + 도메인 분류
│   │   ├── db_query.py                  # SELECT 전용 (DML/DDL regex 차단)
│   │   └── sp_call.py                   # SP 화이트리스트 실행
│   ├── db/
│   │   └── connection.py                # PyodbcPool + asyncio wrapper
│   ├── domains/
│   │   ├── loader.py                    # schema_registry 글로빙 + 매칭 + 프롬프트 변환
│   │   └── __init__.py
│   └── schema_registry/
│       └── domains/
│           └── groupware.json           # GW 도메인 (13 tables, 6 groups)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # CSS-hidden 라우터 (탭 전환 세션 유지)
│   │   ├── main.tsx
│   │   ├── index.css                    # Tailwind 지시자
│   │   ├── types/
│   │   │   └── events.ts                # AgentEvent, ChatMessage, ResultEntry
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx        # 허브 + 도메인 수 실시간 표시
│   │   │   ├── DataQueryPage.tsx        # 직접 SQL 에디터 (LLM 없음)
│   │   │   ├── AgentChatPage.tsx        # 대화형 + 사이드바 + 인라인 차트
│   │   │   └── UIBuilderPage.tsx        # 3단계 위저드 (데이터→시각화→위젯)
│   │   ├── components/
│   │   │   ├── AppShell.tsx             # 사이드바(208px↔56px) + 헤더
│   │   │   ├── ChatInput.tsx            # 자연어 입력 (Shift+Enter 줄바꿈)
│   │   │   ├── MessageThread.tsx        # 마크다운 + <think> 블록 + 인라인 차트
│   │   │   ├── AgentTrace.tsx           # ToolResultInlineViz + CollapsibleTrace
│   │   │   ├── ConversationList.tsx     # 대화 사이드바 (검색/rename/삭제/export)
│   │   │   ├── VizPanel.tsx             # Chart 시각화 (Switchable/Inline)
│   │   │   ├── ResultsBoard.tsx         # 결과 히스토리 패널 (현재 미사용)
│   │   │   └── builder/
│   │   │       ├── DataSourceStep.tsx   # SQL / 자연어 → 데이터 수집
│   │   │       └── VizSuggestionStep.tsx # LLM 차트 제안 + 미리보기
│   │   └── hooks/
│   │       ├── useAgentStream.ts        # SSE + useReducer
│   │       └── useConversationStore.ts  # localStorage 영속화
│   ├── package.json
│   ├── vite.config.ts                   # 5173 포트, /api → 127.0.0.1:8000 프록시
│   ├── tsconfig.json
│   └── tailwind.config.ts
│
├── .claude/skills/                      # Claude Code 세션 전용 도구 (런타임 미사용)
│   ├── LosszeroDB_3Z_MES/               # MES DB (DB0=표준, DB1=비즈니스)
│   └── LosszeroDB_GW/                   # GW DB
│
├── README.md                            # 빠른 시작
├── ARCHITECTURE.md                      # 상세 아키텍처
├── SPEC.md                              # ← 이 문서 (시스템 명세)
├── ROADMAP.md                           # 미이행 로드맵
├── DESIGN.md / DESIGN-phase*.md         # 과거 설계 기록
└── .env.example
```

---

## 3. 데이터 흐름

### 3.1 AgentLoop 기반 (에이전트 챗봇)

```
사용자 입력
  │
  ▼
[ChatInput] ──POST /api/query {query, session_id?}──▶ [main.py]
                                    │
                                    ├─ 세션 히스토리 로드 (MAX_HISTORY=20)
                                    ├─ match_domain(query) → 키워드 매칭
                                    ├─ domain_to_context() → 시스템 프롬프트 주입
                                    └─ asyncio.create_task(AgentLoop.run())
                                         │
  ┌──GET /api/stream/{key} (SSE)────────┘
  │
  ▼
[AgentLoop] ◀─────── 10턴 단위 반복 (continue_callback으로 연장) ──────┐
  │                                                                     │
  ├─ LLM.complete(messages, tools)                                      │
  │   ├─ TEXT_DELTA → LLMChunkEvent (스트리밍)                           │
  │   ├─ TOOL_CALL → 도구 선택                                           │
  │   └─ DONE → 루프 탈출                                                │
  │                                                                     │
  ├─ 도구 실행                                                           │
  │   ├─ tool.execute(input)                                            │
  │   ├─ ToolResultEvent → SSE 전송                                      │
  │   └─ 메시지 히스토리에 assistant(tool_use) + tool(result) 추가        │
  │                                                                     │
  ├─ turn_limit 도달 + tool_call 진행 중                                 │
  │   ├─ ContinuePromptEvent → 프론트 [계속/중단] 버튼                   │
  │   ├─ asyncio.Event 대기 (120s 타임아웃)                              │
  │   └─ [계속] → turn_limit += 10, [중단] → FinalEvent                  │
  │                                                                     │
  └─ tool_call 없으면 → FinalEvent(answer, viz_hint, data) ─────────────┘
                              │
                              ▼
                  [MessageThread 렌더링]
                    ├─ 마크다운 답변 (react-markdown + remark-gfm)
                    ├─ <think>...</think> → 접이식 ThinkBlock
                    ├─ CollapsibleTrace (도구 호출 전체 내역)
                    ├─ ToolResultInlineViz (db_query/sp_call 결과 인라인 차트)
                    └─ InlineViz (FinalEvent data → SwitchableViz)
```

### 3.2 직접 SQL (데이터 조회 페이지)

```
DataQueryPage textarea
  │ Ctrl+Enter
  ▼
POST /api/sql {sql}
  │
  ├─ _assert_read_only() → DML/DDL regex 차단
  ├─ pyodbc cursor.execute() via run_in_executor
  └─ {data: [...], rows: N}
  │
  ▼
DataTable 렌더링 (히스토리 누적, 최신 위)
```

### 3.3 UI 빌더 (Track C 스캐폴딩)

```
Step 1: 데이터 수집
  ├─ SQL 직접: /api/sql
  └─ 자연어: /api/generate_aggregation_sql → LLM이 T-SQL 생성 → /api/sql 자동 실행

Step 2: 시각화 구상
  └─ /api/suggest_viz (샘플 5행) → viz_hint + x/y 축 추천 → SwitchableViz 미리보기

Step 3: 위젯 저장 (Phase 6 예정)
```

---

## 4. API 명세

| Method | Path | 설명 | Body / Query |
|--------|------|------|-------------|
| GET | `/health` | 서버 상태 | — |
| GET | `/api/domains` | 등록 도메인 목록 | — |
| POST | `/api/sql` | 직접 SQL 실행 (LLM 없음) | `{sql: string}` |
| POST | `/api/query` | 에이전트 실행 시작 | `{query, session_id?}` |
| GET | `/api/stream/{stream_key}` | SSE 이벤트 스트림 | — |
| POST | `/api/continue/{stream_key}` | 10턴 초과 승인 | `{proceed: bool}` |
| DELETE | `/api/session/{session_id}` | 세션 정리 | — |
| POST | `/api/suggest_viz` | 데이터 → 차트 추천 | `{sample: [...]}` |
| POST | `/api/generate_aggregation_sql` | 자연어 → T-SQL | `{prompt, domain?}` |

### 4.1 SSE 이벤트

| 이벤트 | 발생 시점 | 데이터 |
|--------|----------|--------|
| `tool_start` | 도구 호출 시작 | `{tool, input, turn}` |
| `tool_result` | 도구 실행 완료 | `{tool, output, rows, error, turn}` |
| `llm_chunk` | LLM 텍스트 델타 | `{delta}` |
| `continue_prompt` | 10턴 도달 | `{turn, message}` |
| `final` | 에이전트 완료 | `{answer, viz_hint, data}` |
| `error` | 에러 발생 | `{message}` |

### 4.2 viz_hint 값
`"bar_chart" | "line_chart" | "pie_chart" | "table" | "number"`

---

## 5. 도메인 레지스트리

**위치**: `backend/schema_registry/domains/*.json`

**현재 등록**: `groupware.json` (13 tables, 6 groups: attendance, task, workboard, approval, meeting, hr_etc)

**JSON 구조**:
```json
{
  "domain": "groupware",
  "display_name": "그룹웨어",
  "db": "GW",
  "keywords": ["출근", "퇴근", "근태", ...],
  "table_groups": {"attendance": "근태 — 출퇴근 기록"},
  "stored_procedures": [],
  "tables": [
    {
      "name": "dbo.TGW_AttendList",
      "table_group": "attendance",
      "description": "출/퇴근 기록",
      "columns": [
        {"name": "at_AttDt", "type": "datetime", "pk": true, "description": "출근일시"}
      ],
      "joins": [{"target": "...", "on": "...", "type": "one_to_many"}]
    }
  ]
}
```

**로더 동작**:
1. 서버 시작 시 `*.json` 글로빙 → 메모리 캐시
2. 사용자 질문 → keywords 매칭 (+ display_name/domain 보너스)
3. 최적 도메인의 테이블/컬럼/SP를 시스템 프롬프트에 주입
4. SP 화이트리스트: 각 JSON의 `stored_procedures`에서 자동 추출

**프론트엔드 연동**: `GET /api/domains` → AgentChatPage, DashboardPage 동적 렌더링

---

## 6. 에이전트 도구 (AgentLoop tools)

| 도구 | 용도 | 파라미터 |
|------|------|---------|
| `list_tables` | DB 테이블명 조회 + 도메인 자동 분류 | `{pattern?}` |
| `db_query` | SELECT 쿼리 (DML/DDL regex 차단) | `{sql, params?}` |
| `sp_call` | 화이트리스트 SP 실행 | `{sp_name, params?}` |

**last_data 로직**: `_DATA_TOOLS = {"db_query", "sp_call"}` — 이 도구 결과만 `FinalEvent.data`로 저장 (메타데이터 도구 제외).

---

## 7. LLM Provider

| Provider | 연결 | Tool Calling | Fallback |
|----------|------|-------------|----------|
| Claude | Anthropic SDK `messages.stream()` | 네이티브 tool_use | — |
| LM Studio | httpx `/v1/chat/completions` | 네이티브 (모델 의존) | HTTP 400 시 `<execute_sql>...</execute_sql>` 추출 |

**시스템 프롬프트**: 고정 기본 + `domain_to_context()` 동적 합성. system role 메시지는 각 provider가 적절히 병합.

---

## 8. DB 연결

- **드라이버**: pyodbc (ODBC Driver 자동 감지: 18 → 17 → Native Client → SQL Server)
- **풀**: `PyodbcPool` — `queue.Queue`, max_size=5, `SELECT 1` 유효성 검증
- **비동기**: `asyncio.run_in_executor`로 동기 pyodbc 래핑
- **읽기 전용 차단 키워드**: INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE, EXEC, MERGE, REPLACE, CALL, GRANT, REVOKE, COMMIT, ROLLBACK

---

## 9. 프론트엔드 상태 관리

### 9.1 `useAgentStream` (메모리 + useReducer)
```
State: {messages, sessionId, isStreaming, error, pendingContinue, results, activeResultId}
Actions: send, cancel, reset, respondToContinue, setActiveResult, loadMessages
```

### 9.2 `useConversationStore` (localStorage)
```
Conversation: {id, title, domain, domainLabel, messages, createdAt, updatedAt}
Actions: saveConversation, deleteConversation, renameConversation, downloadMarkdown, clearAll
Storage key: "llm-harness-conversations"
```
- 제목 자동 생성: 첫 user 메시지 40자
- Markdown export: `<think>` 제거 후 "👤/🤖" 구조로 변환

### 9.3 세션 유지
- `App.tsx`가 모든 페이지를 **CSS `hidden`으로만 숨김** (DOM 유지)
- 탭 전환 시 훅 상태/EventSource 유지
- 대화는 localStorage 자동 저장 → 브라우저 재시작에도 복원

---

## 10. 백엔드 세션 저장소 (메모리)

| 저장소 | 키 | 내용 | 수명 |
|--------|-----|------|------|
| `_sessions` | stream_key | SSE 이벤트 버퍼 | 쿼리 단위 |
| `_conversations` | session_id | 대화 메시지 히스토리 | 세션 단위 |
| `_continue_gates` | stream_key | `asyncio.Event` | 승인까지 |
| `_continue_results` | stream_key | bool | 일회성 |

- stream_key 포맷: `{session_id}:{8자 hex}`
- MAX_CONVERSATION_HISTORY: 20

---

## 11. 환경변수

```bash
# LLM
LLM_PROVIDER=claude               # claude | lm_studio
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6

# LM Studio (옵션)
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_API_KEY=lm-studio
LM_STUDIO_MODEL=                  # 비워두면 로드된 모델 자동 사용

# MSSQL
MSSQL_SERVER=host,port
MSSQL_DATABASE=dbname
MSSQL_USER=user
MSSQL_PASSWORD=pass
# 또는:
# MSSQL_CONNECTION_STRING=DRIVER=...;SERVER=...;...

# 에이전트
AGENT_MAX_TURNS=10
MAX_CONVERSATION_HISTORY=20
```

---

## 12. 실행

```powershell
# 백엔드
cd backend
uv sync
uv run python main.py              # 0.0.0.0:8000

# 프론트엔드 (별도 터미널)
cd frontend
pnpm install
pnpm dev                           # localhost:5173
```

---

## 13. 스킬 시스템 (.claude/skills/)

Claude Code 세션 자동 로드. **런타임 백엔드와 분리**.

| 스킬 | 역할 |
|------|------|
| `LosszeroDB_3Z_MES` | MES DB 멀티채널(DB0/DB1/DB2) + meta.py + Query.py |
| `LosszeroDB_GW` | GW DB 메타 (TXP_TableInfo/TXP_ColumnInfo 기반) |

**워크플로우**: 스킬 meta.py로 DB 탐색 → 도메인 JSON 수동 작성 → `schema_registry/domains/` 배치.

---

## 14. 구현 이력 요약

| Phase | 핵심 변화 |
|-------|----------|
| 1 | Text-to-SQL + Next.js (폐기됨) |
| 2 | LLM Harness 전환 (AgentLoop + SSE + Vite) |
| 3 | HITL 승인 시스템 도입 후 제거, continue_prompt 재도입 |
| 4 | schema_registry 통합 + 구조 일원화 + `/api/domains` |
| 5 | 대화 관리(localStorage), tool_result 인라인 차트, UI Builder 스캐폴딩 |

상세한 미이행 항목은 [ROADMAP.md](./ROADMAP.md) 참조.
