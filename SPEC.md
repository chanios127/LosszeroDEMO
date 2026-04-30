# LLM Harness — 시스템 명세서

> 최종 갱신: 2026-04-30 (Phase 11 + Phase 10 Step 3 종료 시점)

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
│   ├── main.py                          # FastAPI 엔트리, 모든 라우터, 세션 저장소
│   ├── pyproject.toml                   # uv 의존성
│   ├── uv.lock
│   ├── prompts/
│   │   ├── system_base.md               # core (anti-hallucination / 응답 언어 / name resolution / 시각화 / report pipeline)
│   │   ├── loader.py                    # SKILL/rules loader + frontmatter parser (lru_cache, Phase 10 Step 3)
│   │   └── rules/                       # cross-cutting rule (frontmatter applies_to: [system_prompt])
│   │       ├── korean-sql.md
│   │       ├── result-size.md
│   │       ├── error-recovery.md
│   │       ├── report-block-types.md
│   │       └── json-output.md
│   ├── agent/
│   │   ├── events.py                    # SSE 이벤트 타입 9종 (subagent_start/progress/complete 포함)
│   │   └── loop.py                      # AgentLoop (ReAct 멀티턴, 10턴 + continue, sub-agent 옵션 전파)
│   ├── llm/
│   │   ├── base.py                      # LLMProvider ABC (max_tokens / thinking_* keyword-only) + load_base_system_prompt()
│   │   ├── __init__.py                  # Provider 팩토리
│   │   ├── claude.py                    # Anthropic 스트리밍 (max_retries=0, extended thinking 지원 모델 자동 감지)
│   │   └── lm_studio.py                 # OpenAI 호환 + Harmony 정규화 + httpx.Timeout per-phase
│   ├── tools/
│   │   ├── base.py                      # Tool ABC (description property는 loader.get_tool_description default)
│   │   ├── db_query/                    # 패키지 (tool.py + SKILL.md)
│   │   ├── list_tables/                 # 패키지 (tool.py + SKILL.md)
│   │   ├── sp_call/                     # 패키지 (tool.py + SKILL.md)
│   │   ├── build_report/                # sub-agent (tool.py + SKILL.md + system.md + schema.py)
│   │   └── build_view/                  # sub-agent (tool.py + SKILL.md + system.md + schema.py)
│   ├── db/
│   │   └── connection.py                # PyodbcPool + asyncio wrapper
│   ├── domains/
│   │   ├── loader.py                    # 단일 *.json + 폴더 도메인 로딩, 매칭, 프롬프트 변환
│   │   ├── parser.py                    # build_select() — joins → SELECT SQL 재조립
│   │   └── __init__.py                  # build_select 재수출
│   └── schema_registry/
│       └── domains/
│           └── groupware/                # GW 도메인 (폴더 형식 — Phase 7)
│               ├── meta.json             # domain / display_name / db / keywords / table_groups
│               ├── tables.json           # {"tables": [...]} — 컬럼 스키마, joins 분리됨
│               ├── joins.json            # {"joins": [...]} — 1급 join 스키마 (from/to_columns + operators)
│               └── stored_procedures.json # {"stored_procedures": [...]}
│
├── frontend/
│   ├── src/
│   │   ├── design/                      # ⬛ 디자인 시스템 (UI primitives, 스타일)
│   │   │   ├── components/
│   │   │   │   ├── primitives.tsx       # Button, Dot, cls 유틸
│   │   │   │   ├── icons.tsx            # SVG 아이콘 라이브러리
│   │   │   │   ├── TweaksPanel.tsx      # 테마/density/팔레트 설정 UI
│   │   │   │   ├── AppShell.tsx         # 사이드바 + 헤더 레이아웃
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── MessageThread.tsx
│   │   │   │   ├── AgentTrace.tsx
│   │   │   │   ├── VizPanel.tsx
│   │   │   │   ├── ConversationList.tsx
│   │   │   │   └── ResultsBoard.tsx
│   │   │   ├── index.css                # Tailwind + OKLCH 컬러 시스템 (CSS 변수)
│   │   │   └── types/
│   │   │       └── events.ts            # AgentEvent, ChatMessage, ResultEntry
│   │   │
│   │   └── framework/                   # ⬛ 비즈니스 로직 + 페이지
│   │       ├── App.tsx                  # CSS-hidden 라우터
│   │       ├── main.tsx                 # 엔트리 (design/index.css import)
│   │       ├── pages/
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── DataQueryPage.tsx    # 직접 SQL 에디터 (LLM 없음)
│   │       │   ├── AgentChatPage.tsx    # 대화형 + 인라인 차트
│   │       │   └── UIBuilderPage.tsx    # 3단계 위저드
│   │       ├── components/
│   │       │   └── builder/
│   │       │       ├── DataSourceStep.tsx
│   │       │       └── VizSuggestionStep.tsx
│   │       └── hooks/
│   │           ├── useAgentStream.ts    # SSE + useReducer (스트림 재연결 지원)
│   │           ├── useConversationStore.ts  # localStorage 영속화
│   │           └── useTweaks.ts         # 테마/팔레트 + CSS 변수 동적 주입
│   ├── package.json
│   ├── vite.config.ts                   # 5173 포트, /api → 127.0.0.1:8000 프록시
│   ├── tsconfig.json
│   └── tailwind.config.ts               # design/framework 경로 포함
│
├── .claude/skills/                      # Claude Code 세션 전용 도구 (런타임 미사용)
│   ├── LosszeroDB_3Z_MES/               # MES DB (DB0=표준, DB1=비즈니스)
│   └── LosszeroDB_GW/                   # GW DB
│
├── README.md                            # 빠른 시작
├── HANDOFF.md                           # supervisor 인수인계 프롬프트 (세션 cold start)
├── ARCHITECTURE.md                      # 상세 아키텍처
├── SPEC.md                              # ← 이 문서 (시스템 명세)
├── ROADMAP.md                           # 미이행 로드맵
├── agent-prompts/                       # 에이전트 위임 표준 프롬프트 (Phase 6.5)
│   ├── README.md                        # 위임 워크플로우 + per-agent 브랜치 규칙
│   ├── backend-infra.md                 # FastAPI / LLM / AgentLoop / tools / DB
│   ├── db-domain.md                     # schema_registry/domains + 매칭/서빙
│   ├── front-view.md                    # React framework/ 영역
│   ├── claude-design.md                 # 외부 Claude Design 위임 절차 + design-export/ 규격
│   └── debug.md                         # A+C 가드레일 본문 (옵션 1 블랙리스트 11종 트리거)
├── design-export/                       # Claude Design 위임 시 자동 생성 (gitignore 권장)
├── DESIGN.md / DESIGN-phase*.md         # 과거 설계 기록 (legacy)
└── .env.example
```

### 2.1 design / framework 분리 원칙

| 레이어 | 역할 | 의존성 |
|--------|------|--------|
| `src/design/` | 순수 UI primitives, 컴포넌트, 스타일, 이벤트 타입 | 비즈니스 로직 없음, framework 의존 X |
| `src/framework/` | 페이지, 라우팅, 훅(SSE/저장소/테마 적용), 비즈니스 컴포넌트 | design을 import해서 사용 |

design 레이어는 단독으로 다른 프로젝트에 이식 가능. framework는 도메인 특화.

### 2.2 Backend tools 패키지 구조 (Phase 10 Step 3 — SKILL.md 표준)

각 도구는 단일 파일이 아닌 **패키지**로 분리. `description.md`는 폐기되고 `SKILL.md`로 일원화 (frontmatter + Description / Rules / Guards / Errors / Examples 섹션).

```
tools/db_query/                        # 일반 tool
├── __init__.py                        # from .tool import DBQueryTool
├── tool.py                            # 실제 클래스 구현
└── SKILL.md                           # frontmatter + Description / Rules / Guards / Errors

tools/build_report/                    # sub_agent
├── __init__.py
├── tool.py                            # AgentLoop에서 호출하는 entry, 내부에서 LLM 재호출
├── SKILL.md                           # frontmatter (sub_agent_system: ./system.md 포함)
├── system.md                          # 내부 LLM 호출용 system 메시지
└── schema.py                          # ReportSchema / ViewBundle Pydantic 모델
```

**SKILL.md frontmatter**:
```yaml
---
name: <tool_name>
type: tool                                # tool | sub_agent | rule
version: 1
applies_to:
  - tool_description                      # OpenAI function calling description
  - system_prompt_addendum                # 시스템 프롬프트의 도구별 섹션
required_rules:                           # cross-cutting rule 의존성
  - korean-sql
  - result-size
sub_agent_system: ./system.md             # sub_agent type만 — 내부 LLM 호출 시 system
---
```

**합성 흐름** (`backend/prompts/loader.py`):
- `build_system_prompt()` = `system_base.md` + `rules/*.md`(applies_to: system_prompt) + 도구별 addenda(`## Tool: <name>` + Rules/Guards/Errors)
- `get_tool_description(name)` = SKILL.md `## Description` 섹션 본문 → OpenAI tool schema description
- `get_subagent_system(name)` = SKILL.md frontmatter `sub_agent_system` 경로 read

**Tool.description ABC default** — `tools/base.py`가 `loader.get_tool_description(self.name)` 자동 호출. 도구별 override 불필요.

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

Step 3: 위젯 저장 (미구현 — ROADMAP §A 후보)
```

---

## 4. API 명세

| Method | Path | 설명 | Body / Query |
|--------|------|------|-------------|
| GET | `/health` | 서버 상태 | — |
| GET | `/api/domains` | 등록 도메인 목록 | — |
| GET | `/api/defaults` | provider-aware 기본 LLM 튜닝 값 | — (응답: `{provider, max_tokens, thinking_budget, thinking_supported}`) |
| POST | `/api/sql` | 직접 SQL 실행 (LLM 없음) | `{sql: string}` |
| POST | `/api/query` | 에이전트 실행 시작 | `{query, session_id?, max_tokens?, thinking_enabled?, thinking_budget?}` |
| GET | `/api/stream/{stream_key}` | SSE 이벤트 스트림 (재연결 지원, 15s heartbeat) | — |
| GET | `/api/stream_status/{stream_key}` | 스트림 존재/완료 여부 확인 | — |
| POST | `/api/continue/{stream_key}` | 10턴 초과 승인 | `{proceed: bool}` |
| POST | `/api/cancel/{session_id}` | 진행 중 작업 취소 | — |
| DELETE | `/api/session/{session_id}` | 세션 정리 | — |
| POST | `/api/suggest_viz` | 데이터 → 차트 추천 | `{sample: [...]}` |
| POST | `/api/generate_aggregation_sql` | 자연어 → T-SQL | `{prompt, domain?}` |

`/api/query` body 옵션 3개 (Phase 11 Backend, B-3): 모두 optional. None일 때 `LLMProvider`가 환경변수 default fallback. 값은 AgentLoop를 통해 매 turn `provider.complete(..., max_tokens=..., thinking_*=...)`로 전달되며 sub-agent에도 `set_llm_options()`로 propagate.

### 4.1 SSE 이벤트

| 이벤트 | 발생 시점 | 데이터 |
|--------|----------|--------|
| `tool_start` | 도구 호출 시작 | `{tool, input, turn}` |
| `tool_result` | 도구 실행 완료 | `{tool, output, rows, error, turn}` |
| `llm_chunk` | LLM 텍스트 델타 | `{delta}` |
| `continue_prompt` | 10턴 도달 | `{turn, message}` |
| `subagent_start` | sub-agent 시작 (build_report / build_view) | `{name}` |
| `subagent_progress` | sub-agent 진행 stage | `{name, stage}` |
| `subagent_complete` | sub-agent 종료 | `{name, output_summary}` |
| `final` | 에이전트 완료 | `{answer, viz_hint, data}` |
| `error` | 에러 발생 | `{message}` |

heartbeat: SSE 스트림은 `SSE_HEARTBEAT_SEC` 간격(default 15s)으로 SSE comment 라인(`: heartbeat\n\n`)을 흘려 reasoning 모델의 긴 silence 동안 reverse proxy idle-close를 방지 (Phase 11 G7).

### 4.2 viz_hint 값
`"bar_chart" | "line_chart" | "pie_chart" | "table" | "number"`

---

## 5. 도메인 레지스트리

**위치**: `backend/schema_registry/domains/`

**현재 등록**: `groupware/` (폴더 형식, 15 tables, 22 joins, 7 groups: attendance, task, workboard, approval, meeting, hr_etc, master)

### 5.1 도메인 형식 (Phase 7)

도메인은 **폴더** 또는 단일 **`*.json` 파일** 두 형식 모두 인식된다.

#### 폴더 형식 (권장, groupware 사용)

```
domains/groupware/
├── meta.json              # 도메인 메타 (domain, display_name, db, keywords, table_groups)
├── tables.json            # {"tables": [...]} — 컬럼 스키마. 내부 joins 필드 없음
├── joins.json             # {"joins": [...]} — 1급 join 스키마 (아래 §5.2)
└── stored_procedures.json # {"stored_procedures": [...]}
```

`meta.json` + `tables.json`은 필수, 나머지는 선택. 로더가 4 파일을 단일 DomainSpec으로 병합.

#### 단일 파일 형식 (하위호환)

기존 `domains/<name>.json` 단일 파일도 계속 정상 인식 (테이블 하위 `joins` 포함 구 스키마 유지).

### 5.2 joins 스키마 (Phase 8 — compact)

```json
{
  "joins": [
    {
      "name": "attendList2LZXP310T",
      "tables":  ["TGW_AttendList", "LZXP310T"],
      "join_type": "L",
      "columns": [["at_UserID"], ["Uid"]],
      "operators": ["="],
      "description": "사용자 이름 해석 (at_UserID → uName)"
    }
  ]
}
```

- `tables`: 길이 2 고정 배열 `[from, to]`. **dbo 스키마 prefix 미포함** — 직렬화 / SQL 생성 시 코드가 `dbo.` 자동 prepend (본 프로젝트는 dbo 고정).
- `columns`: 길이 2 외부 배열 `[from_columns, to_columns]`. 내부 배열은 composite key 컬럼들 (인덱스 1:1 매칭).
- `operators`: `columns[0]` 길이와 동일. `=`/`<>`/`>`/`<`/`>=`/`<=`.
- `join_type`: `L`/`R`/`I`/`C` (LEFT/RIGHT/INNER/CROSS), 대소문자 무시.
- `name`: optional 디버깅 식별자. 패턴 `<from>2<to>` (camelCase 축약, T**_ prefix 소거 후 첫 글자 lower; LZXP310T처럼 prefix 없는 마스터는 원형). 충돌 시 `__<firstFromColCamel>` suffix.

### 5.3 로더 동작

1. 서버 시작 시 `*.json` 글로빙(구 형식) + 디렉토리 순회(신 형식, `meta.json` 존재 검사) → 메모리 캐시
2. 사용자 질문 → keywords 매칭 (+ display_name/domain 보너스)
3. 최적 도메인의 테이블/컬럼/SP/joins를 시스템 프롬프트에 주입 (top-level joins → `### Join Relationships` 섹션)
4. SP 화이트리스트: 각 도메인의 `stored_procedures`에서 자동 추출

### 5.4 join → SQL 파서 (`backend/domains/parser.py`)

`build_select(joins, select_cols=None, use_alias=True) -> str`

- 입력: 신 joins 객체 배열의 부분집합(테이블 사슬). 첫 entry의 `tables[0]`이 base.
- 출력: `SELECT ... FROM A LEFT JOIN B ON ... LEFT JOIN C ON ...` SQL 문자열. 모든 테이블 참조에 `dbo.` 자동 prepend.
- alias: `use_alias=True`면 A/B/C… 자동 부여. `False`면 full table name(`dbo.<table>`).
- composite ON: `columns[0][i] {operators[i]} columns[1][i]`을 `AND`로 연결.
- CROSS JOIN은 ON 절 없이 생성.
- 체인 끊김 / 빈 입력 시 `ValueError`. 구 스키마(`from_table` 등) 입력 시 `KeyError`.

**프론트엔드 연동**: `GET /api/domains` → 요약 dict(`table_count`, `join_count`, `sp_count`, `table_groups`, `keywords[:5]`) → AgentChatPage, DashboardPage 동적 렌더링.

---

## 6. 에이전트 도구 (AgentLoop tools)

| 도구 | type | 용도 | 파라미터 |
|------|------|------|---------|
| `list_tables` | tool | DB 테이블명 조회 + 도메인 자동 분류 | `{pattern?}` |
| `db_query` | tool | SELECT 쿼리 (DML/DDL regex 차단) | `{sql, params?}` |
| `sp_call` | tool | 화이트리스트 SP 실행 | `{sp_name, params?}` |
| `build_report` | sub_agent | 데이터 결과 → ReportSchema (블록 구조) 변환 | `{data_results, user_intent}` |
| `build_view` | sub_agent | ReportSchema → ViewBundle (인라인 렌더링용) 변환 | `{report_schema}` |

**last_data 로직**: `_DATA_TOOLS = {"db_query", "sp_call"}` — 이 도구 결과만 `FinalEvent.data`로 저장 (메타데이터/sub-agent 도구 제외).

**sub-agent (Phase 9)**: `build_report` / `build_view`는 도구 형태로 호출되지만 내부에서 LLM을 재호출하여 구조화된 산출물(ReportSchema → ViewBundle)을 생성. 매 turn 시작 시 AgentLoop가 `set_llm_options()`로 sub-agent tool 인스턴스에 max_tokens / thinking_* 옵션 inject. 진행 stage는 `subagent_start/progress/complete` SSE 이벤트로 노출. 입력은 `_truncate_data_results`(default `BUILD_REPORT_MAX_CELL_CHARS=200`, `BUILD_REPORT_MAX_ROWS=30`)로 cap (Phase 11 C2).

**SKILL.md 표준** (Phase 10 Step 3): 각 도구의 description / rules / guards / errors는 `tools/<name>/SKILL.md`에 단일 보유. `Tool.description` ABC default가 `loader.get_tool_description(self.name)` 자동 호출 → 도구별 override 불필요. sub_agent의 내부 LLM system 메시지는 `tools/<name>/system.md`에 외부화 + `loader.get_subagent_system(name)`으로 read.

---

## 7. LLM Provider

| Provider | 연결 | Tool Calling | Retry / Timeout |
|----------|------|-------------|------------------|
| Claude | Anthropic SDK `messages.stream()` | 네이티브 tool_use | `max_retries=0` (A6, SDK auto-retry 차단 — agent loop가 backoff 결정) |
| LM Studio | httpx `/v1/chat/completions` | 네이티브 (모델 의존) | `httpx.Timeout(connect=10, read=600, write=30, pool=30)` — read 환경변수화 (`LM_STUDIO_TIMEOUT_READ`) |

### 7.1 `LLMProvider.complete` 시그니처

```python
async def complete(
    self,
    messages: list[Message],
    tools: list[ToolSchema],
    *,                                    # keyword-only 옵션
    max_tokens: int | None = None,        # None → env default (CLAUDE_MAX_TOKENS / LM_STUDIO_MAX_TOKENS, 10000)
    thinking_enabled: bool | None = None, # None → False (claude만 의미 있음)
    thinking_budget: int | None = None,   # None → CLAUDE_THINKING_BUDGET (4096)
) -> AsyncGenerator[LLMEvent, None]: ...
```

- claude: `thinking_enabled=True`이고 모델이 extended thinking 지원(`claude-sonnet-4-5+`, `claude-haiku-4-5`, `claude-opus-4-x`) 시 `thinking={"type":"enabled","budget_tokens":...}` 첨부. 미지원 모델은 silent ignore + warning 1줄.
- lm_studio: `thinking_enabled=True` 시 warning만 출력하고 무시.
- `max_tokens` None → provider별 env default 적용.
- AgentLoop는 `__init__`에서 옵션을 보관 → 매 turn `provider.complete(...)`에 forward. sub-agent tool 인스턴스도 `set_llm_options()`로 매 turn 동기화.

### 7.2 시스템 프롬프트 구성 (Phase 10 Step 3)
```
[system_base.md]                              ← prompts/system_base.md (core)
+ [rules/*.md applies_to: system_prompt]     ← prompts/rules/*.md
+ [tool addenda — ## Tool: <name>]            ← tools/<name>/SKILL.md (Rules/Guards/Errors)
+ [domain schema]                             ← domains/loader.domain_to_context()
```
- `prompts/loader.py:build_system_prompt()`가 system_base + rules + tool addenda를 lru_cache로 1회 합성
- `llm/base.py:load_base_system_prompt()`는 위 함수에 위임 (이전: system_base.md 단독 read)
- 도메인 컨텍스트는 매 요청 `match_domain(query)` 결과에 따라 base 뒤에 concat
- 새 도구 추가 워크플로우: 디렉토리 1개 + SKILL.md 1개 + tool.py만으로 끝 (description.md / `Tool.description` override 불필요)

### 7.3 Harmony 마커 정규화 (LM Studio)
일부 모델이 출력하는 `<|channel|>thought`, `<|channel|>analysis`, `<|channel|>final`, `<|end|>` 등의 토큰을 `<think>...</think>` 표준 형식으로 스트리밍 안전하게 변환 (`_HarmonyTransformer`).

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
| `_session_domains` | session_id | sticky 도메인 코드 (Fix 1) | 세션 단위 |
| `_continue_gates` | stream_key | `asyncio.Event` | 승인까지 |
| `_continue_results` | stream_key | bool | 일회성 |

- stream_key 포맷: `{session_id}:{8자 hex}`
- MAX_CONVERSATION_HISTORY: 20
- **`_session_domains` sticky** (Phase 9 Fix 1): 첫 turn에서 `match_domain(query)`이 도메인을 발견하면 session_id에 박제. 후속 turn에서 키워드 매칭 실패 시 sticky 도메인 fallback (사용자가 후속 질문에서 도메인 키워드를 생략해도 컨텍스트 유지).

---

## 11. 환경변수

```bash
# LLM
LLM_PROVIDER=claude               # claude | lm_studio
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6
CLAUDE_MAX_TOKENS=10000           # provider default — /api/query body로 per-request override
CLAUDE_THINKING_BUDGET=4096       # thinking_enabled=true일 때 budget default

# LM Studio (옵션)
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_API_KEY=lm-studio
LM_STUDIO_MODEL=                  # 비워두면 로드된 모델 자동 사용
LM_STUDIO_MAX_TOKENS=10000
LM_STUDIO_TIMEOUT_CONNECT=10      # httpx connect timeout (s)
LM_STUDIO_TIMEOUT_READ=600        # reasoning 모델의 첫 토큰 지연 대비 (s)

# build_report 입력 cap (Phase 11 C2)
BUILD_REPORT_MAX_CELL_CHARS=200
BUILD_REPORT_MAX_ROWS=30

# SSE keep-alive (Phase 11 G7) — reverse proxy idle-close 방지, LM_STUDIO_TIMEOUT_READ과 짝
SSE_HEARTBEAT_SEC=15

# MSSQL
DB_CONNECTION_STRING=DRIVER={ODBC Driver 17 for SQL Server};SERVER=host;DATABASE=db;UID=user;PWD=pass
# 또는 분할 변수:
# MSSQL_SERVER=host,port
# MSSQL_DATABASE=dbname
# MSSQL_USER=user
# MSSQL_PASSWORD=pass

# Mock 모드 — 하드코딩 샘플로 MSSQL 회피
MOCK_DB=true

# SP 화이트리스트 (도메인 JSON에서 추가 자동 추출, prefix 매칭 허용)
SP_WHITELIST=

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
| 6 | design/framework 분리, tools 패키지화, prompts 외부화, Harmony 정규화, 디자인 토큰(OKLCH/density/팔레트), 스트림 재연결 |
| 6.5 | 협업 인프라 정착: `HANDOFF.md`, `agent-prompts/` (5역할 + README), per-agent feature 브랜치 전략(`agent/<role>`), Debug A+C 가드레일(옵션 1 블랙리스트 11종 트리거 + 안전장치 2개), Claude Design 재주입 패키지 규격(`design-export/`) |
| 7 | 도메인 폴더 형식(`<name>/{meta,tables,joins,stored_procedures}.json`) + joins 1급화(top-level + composite/operators), `domains/parser.py:build_select()` (joins → SELECT SQL 자동 재조립) |
| 8 | joins 스키마 압축 (4 키 → 2 키 `tables`/`columns`, dbo prefix 자동 prepend), groupware 22 joins, parser/loader 신 스키마 마이그레이션 |
| 9 | Deep Agent Loop / Report Pipeline — 3-stage sub-agent (`build_report` + `build_view`) + ReportSchema → ViewBundle → 인라인 ReportContainer, SSE `subagent_*` 이벤트, `_session_domains` sticky (Fix 1), 메시지 메타데이터 localStorage 영속화 |
| 10 | SKILL.md 표준 (Step 1+2: `prompts/rules/` + sub-agent `system.md` 외부화 / Step 3: `prompts/loader.py` + 5 도구 SKILL.md + `Tool.description` ABC default + system_base.md 다이어트). 새 도구 추가 = 디렉토리 1개로 끝. |
| 11 | build_report 안정화 + Provider 인터페이스 가변화 — `LLMProvider.complete` keyword-only 옵션 (max_tokens / thinking_*), `claude max_retries=0`, `lm_studio httpx.Timeout` per-phase, `_truncate_data_results`, `/api/defaults`, SSE 15s heartbeat, TweaksPanel "LLM" 섹션 + Slider primitive, F7 빈 assistant bubble null guard, vite SSE-safe proxy |

상세한 미이행 항목은 [ROADMAP.md](./ROADMAP.md) 참조.
