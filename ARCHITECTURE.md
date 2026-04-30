# LLM Harness — Architecture

> 최종 갱신: 2026-04-30 (Phase 11 + Phase 10 Step 3)

## 개요

MSSQL ERP/MES/그룹웨어 데이터를 자연어로 조회하고 시각화하는 에이전트 시스템.
Claude/LM Studio를 LLM으로, 도메인 레지스트리로 스키마를 관리한다.

---

## 파일 구조

```
LosszeroDEMO/
├── backend/
│   ├── main.py
│   ├── pyproject.toml
│   ├── prompts/
│   │   ├── system_base.md               # core (anti-hallucination / 응답 언어 / name resolution / 시각화 / report pipeline)
│   │   ├── loader.py                    # SKILL/rules loader + frontmatter parser (Phase 10 Step 3)
│   │   └── rules/                       # cross-cutting rule (applies_to: [system_prompt])
│   ├── agent/
│   │   ├── loop.py                      # AgentLoop (ReAct, 10턴 + continue, sub-agent 옵션 전파)
│   │   └── events.py                    # SSE 이벤트 타입 9종 (subagent_* 포함)
│   ├── llm/
│   │   ├── base.py                      # LLMProvider ABC (max_tokens / thinking_*) + load_base_system_prompt()
│   │   ├── __init__.py                  # Provider 팩토리
│   │   ├── claude.py                    # Anthropic 스트리밍 (max_retries=0)
│   │   └── lm_studio.py                 # OpenAI 호환 + Harmony 정규화 + httpx.Timeout per-phase
│   ├── tools/                           # 각 도구는 패키지 (tool.py + SKILL.md, sub_agent는 + system.md)
│   │   ├── base.py                      # Tool ABC (description = loader.get_tool_description default)
│   │   ├── db_query/
│   │   ├── list_tables/
│   │   ├── sp_call/
│   │   ├── build_report/                # sub_agent: data_results → ReportSchema
│   │   └── build_view/                  # sub_agent: ReportSchema → ViewBundle
│   ├── db/
│   │   └── connection.py                # pyodbc 풀 + run_in_executor
│   ├── domains/
│   │   ├── loader.py                    # 단일 *.json + 폴더 도메인 로딩, 매칭
│   │   ├── parser.py                    # build_select() — joins → SELECT SQL
│   │   └── __init__.py
│   └── schema_registry/
│       └── domains/
│           └── <name>/                  # 폴더 형식 (Phase 7) — meta/tables/joins/stored_procedures.json
│               # 또는 <name>.json 단일 파일 (하위호환)
│
├── frontend/
│   ├── src/
│   │   ├── design/                      # 디자인 시스템
│   │   │   ├── components/
│   │   │   │   ├── primitives.tsx       # Button, Dot, cls
│   │   │   │   ├── icons.tsx            # SVG 아이콘
│   │   │   │   ├── TweaksPanel.tsx      # 테마/density/팔레트 설정 UI
│   │   │   │   ├── AppShell.tsx
│   │   │   │   ├── ChatInput.tsx, MessageThread.tsx, AgentTrace.tsx
│   │   │   │   ├── VizPanel.tsx, ConversationList.tsx, ResultsBoard.tsx
│   │   │   ├── index.css                # OKLCH 컬러 + density CSS 변수
│   │   │   └── types/
│   │   │       └── events.ts
│   │   │
│   │   └── framework/                   # 비즈니스 로직 + 페이지
│   │       ├── App.tsx
│   │       ├── main.tsx                 # → import "../design/index.css"
│   │       ├── pages/
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── DataQueryPage.tsx    # /api/sql 직접
│   │       │   ├── AgentChatPage.tsx    # 대화 + 인라인 차트
│   │       │   └── UIBuilderPage.tsx
│   │       ├── components/
│   │       │   └── builder/
│   │       │       ├── DataSourceStep.tsx
│   │       │       └── VizSuggestionStep.tsx
│   │       └── hooks/
│   │           ├── useAgentStream.ts    # SSE + 재연결 + 취소
│   │           ├── useConversationStore.ts
│   │           └── useTweaks.ts         # 테마/팔레트 + CSS 변수
│   ├── package.json
│   ├── vite.config.ts                   # /api → 127.0.0.1:8000
│   └── tailwind.config.ts               # design/ + framework/ 경로
│
├── .claude/skills/                      # Claude Code 세션 전용 (런타임 미사용)
│   ├── LosszeroDB_3Z_MES/
│   └── LosszeroDB_GW/
│
├── .env.example
├── README.md
└── ARCHITECTURE.md                      # ← 이 문서
```

---

## 데이터 흐름

```
사용자 입력
  │
  ▼
[ChatInput] ──POST /api/query──▶ [main.py]
                                    │
                                    ├─ 세션 히스토리 로드 (최대 20개)
                                    ├─ 도메인 키워드 매칭 → 스키마 컨텍스트 생성
                                    └─ AgentLoop.run() 비동기 시작
                                         │
  ┌──SSE /api/stream/{key}──────────────┘
  │
  ▼
[AgentLoop] ◀────────────── 반복 (10턴 단위) ───────────────┐
  │                                                          │
  ├─ LLM.complete(messages, tools)                           │
  │   ├─ TEXT_DELTA → LLMChunkEvent                          │
  │   ├─ TOOL_CALL → 도구 선택                                │
  │   └─ DONE → 루프 탈출                                     │
  │                                                          │
  ├─ 도구 실행                                                │
  │   ├─ tool.execute(input)                                 │
  │   ├─ ToolResultEvent → SSE 전송                           │
  │   └─ 메시지 히스토리에 assistant + tool 추가               │
  │                                                          │
  ├─ 10턴 도달 + tool_call 진행 중                             │
  │   ├─ ContinuePromptEvent → 프론트엔드에 계속/중단 버튼     │
  │   ├─ 사용자 "계속" → turn_limit += 10                     │
  │   └─ 사용자 "중단" → FinalEvent 반환                      │
  │                                                          │
  └─ tool_call 없으면 → FinalEvent ──────────────────────────┘
                              │
                              ▼
                        [MessageThread]
                          ├─ 마크다운 답변 (react-markdown)
                          ├─ <think> 블록 (접이식)
                          ├─ CollapsibleTrace (도구 호출 내역)
                          └─ SwitchableViz (Bar/Line/Pie/Table 전환)
```

---

## SSE 이벤트 타입

| 이벤트 | 발생 시점 | 데이터 |
|--------|----------|--------|
| `tool_start` | 도구 호출 시작 | tool, input, turn |
| `tool_result` | 도구 실행 완료 | tool, output, rows, error, turn |
| `llm_chunk` | LLM 텍스트 스트리밍 | delta |
| `continue_prompt` | 10턴 도달 | turn, message |
| `subagent_start` | sub_agent 진입 (build_report / build_view) | name |
| `subagent_progress` | sub_agent 단계 진행 | name, stage |
| `subagent_complete` | sub_agent 종료 | name, output_summary |
| `final` | 에이전트 완료 | answer, viz_hint, data |
| `error` | 에러 발생 | message |

### SSE heartbeat (Phase 11 G7)

reasoning 모델의 긴 silence 동안 reverse proxy idle-close를 방지하기 위해 `event_generator`가 `SSE_HEARTBEAT_SEC` 간격(default 15s)으로 SSE comment 라인(`: heartbeat\n\n`)을 흘린다. 프론트는 이를 무시 (이벤트 X) — EventSource가 connection alive로 인식만 하면 충분. vite proxy는 짝으로 `timeout: 0, proxyTimeout: 0` 설정 필요.

---

## 도구 목록 (Phase 10 Step 3 — SKILL.md 표준)

각 도구는 **패키지** 구조 (`tools/{name}/{tool.py, SKILL.md, __init__.py}`). sub_agent는 `system.md`(내부 LLM system 메시지) + `schema.py`(Pydantic 모델) 추가.

| 도구 | type | 용도 |
|------|------|------|
| `list_tables` | tool | 테이블명 조회 + 도메인 자동 분류 |
| `db_query` | tool | SELECT 쿼리 실행 (DML/DDL regex 차단) |
| `sp_call` | tool | 화이트리스트 SP 실행 (도메인 JSON에서 추출) |
| `build_report` | sub_agent | 데이터 결과 → ReportSchema (블록 구조) |
| `build_view` | sub_agent | ReportSchema → ViewBundle (인라인 렌더링용) |

---

## 도메인 레지스트리

**위치**: `backend/schema_registry/domains/`

도메인은 **폴더 형식**(권장, Phase 7) 또는 **단일 `*.json` 파일**(하위호환) 두 형식을 모두 지원.

### 폴더 형식 (groupware 사용)

```
domains/groupware/
├── meta.json              # domain / display_name / db / keywords / table_groups
├── tables.json            # {"tables": [...]} — 컬럼 스키마, 내부 joins 없음
├── joins.json             # {"joins": [...]} — 1급 join 스키마 (top-level 평탄화)
└── stored_procedures.json # {"stored_procedures": [...]}
```

`meta.json` + `tables.json` 필수, 나머지는 선택. 로더가 4 파일을 단일 DomainSpec으로 병합.

### joins 스키마 (Phase 8 — compact)

```json
{
  "name":      "attendList2LZXP310T",            // <from>2<to> camelCase, optional
  "tables":   ["TGW_AttendList", "LZXP310T"],   // 길이 2, dbo prefix 미포함
  "join_type": "L",                              // L/R/I/C (대소문자 무시)
  "columns":  [["at_UserID"], ["Uid"]],          // [from_cols, to_cols], composite 지원
  "operators": ["="],                            // = / <> / > / < / >= / <=
  "description": "사용자 이름 해석 (at_UserID → uName)"
}
```

dbo 스키마는 본 프로젝트 고정 — 직렬화 / SQL 생성 시점에 코드가 자동 prepend.

### 작동 방식

1. 서버 시작 시 `*.json` 글로빙(구) + 디렉토리 순회(신, `meta.json` 검사) → 메모리 캐시
2. 사용자 질문 → keywords 매칭 → 최적 도메인 선택
3. 테이블/컬럼/SP/joins 정보를 시스템 프롬프트에 주입 (top-level joins는 `### Join Relationships` 섹션으로 직렬화)
4. SP 화이트리스트는 각 도메인의 `stored_procedures`에서 자동 추출

### join → SQL 파서

`backend/domains/parser.py:build_select(joins, select_cols=None, use_alias=True) -> str` — 신 joins 스키마를 입력받아 `SELECT ... FROM A LEFT JOIN B ON ... LEFT JOIN C ON ...` SQL 문자열을 재조립. alias 자동 부여, composite ON, CROSS JOIN, 체인 검증 지원.

**프론트엔드 연동**: `GET /api/domains` → 요약 dict(`table_count`, `join_count`, `sp_count`, `table_groups`, `keywords[:5]`) → 에이전트 카드 동적 생성 (AgentChatPage).

---

## 프론트엔드 구조

### 페이지 라우팅
- `App.tsx` — CSS hidden 방식으로 전 페이지 상시 마운트 (탭 전환 시 세션 유지)
- `AppShell` — 접이식 사이드바(208px ↔ 56px) + 헤더

### 시각화
- `VizPanel.tsx` — recharts 기반
  - `SwitchableViz` — 차트 타입 수동 전환 (Bar/Line/Pie/Table/Number)
  - `getApplicableHints()` — 데이터 형태에 따라 적용 가능 차트만 표시
  - `Brush` — Bar/Line 차트 드래그 줌
  - 클릭 포커스 — Bar/Pie 개별 항목 강조

### 상태 관리
- `useAgentStream` — useReducer 기반 (messages, results, sessionId, pendingContinue)
- `useConversationStore` — localStorage 영속화 (대화 목록/저장/불러오기/export)
- 탭 전환 시 CSS hidden으로 DOM 유지 → 세션 유지
- localStorage key: `llm-harness-conversations`

### 인라인 시각화
- `MessageThread` 내 `CollapsibleTrace` → `ToolResultInlineViz`
  - `db_query` / `sp_call` 결과 데이터를 각 턴마다 접이식 차트 카드로 표시
  - 기본 접힘, 클릭 시 `InlineViz` 렌더
- `FinalEvent.data`는 메시지 하단에 `InlineViz`로 별도 표시

---

## UI 빌더 (3단계 위저드)

```
Step 1: DataSourceStep
  ├─ SQL 직접 입력 → POST /api/sql
  └─ 자연어 → POST /api/generate_aggregation_sql → SQL 생성 → 자동 실행

Step 2: VizSuggestionStep
  └─ POST /api/suggest_viz (샘플 5행)
      → viz_hint + x_axis/y_axis 추천 (현재는 휴리스틱)
      → SwitchableViz로 즉시 미리보기

Step 3: 위젯 저장 (Phase 6 예정)
  └─ react-grid-layout 기반 드래그 그리드 + localStorage 영속화
```

---

## LLM Provider

| Provider | 연결 | Tool Calling | Retry / Timeout |
|----------|------|-------------|------------------|
| Claude | Anthropic SDK 스트리밍 | 네이티브 tool_use | `max_retries=0` — SDK auto-retry storm 차단, agent loop가 backoff 결정 |
| LM Studio | httpx OpenAI 호환 | 네이티브 (모델 의존) | `httpx.Timeout(connect=10, read=600, write=30, pool=30)` — read 환경변수화 |

### 시스템 프롬프트 합성 흐름 (Phase 10 Step 3)

```
[system_base.md]                              ← prompts/system_base.md (core, 다이어트됨)
+ [rules/*.md applies_to: system_prompt]      ← prompts/rules/*.md (cross-cutting)
+ [tool addenda — ## Tool: <name>]            ← tools/<name>/SKILL.md (Rules/Guards/Errors)
+ [domain schema]                             ← domains/loader.domain_to_context()
```

`backend/prompts/loader.py:build_system_prompt()`이 startup에 1회 합성 (lru_cache). 각 도구의 SKILL.md frontmatter `applies_to` 키가 `system_prompt_addendum`을 포함하면 해당 도구의 Rules/Guards/Errors 섹션이 추출되어 system prompt 끝에 `## Tool: <name>` 섹션으로 concat. `Tool.description` property는 `loader.get_tool_description(self.name)` ABC default를 사용 → SKILL.md `## Description` 섹션이 OpenAI tool schema description으로 직행.

sub_agent의 내부 LLM system 메시지는 `tools/<name>/system.md`에 외부화. SKILL.md frontmatter `sub_agent_system: ./system.md`가 경로 박제. `loader.get_subagent_system(name)`이 read.

새 도구 추가 워크플로우: `tools/<name>/` 디렉토리 1개 + `tool.py`(Tool ABC 상속) + `SKILL.md`(frontmatter + 섹션) → main.py에 등록만 하면 끝. description.md 작성 / 시스템 프롬프트 직접 read / `Tool.description` override 모두 불필요.

### Per-request LLM tuning (Phase 11)

`LLMProvider.complete`는 `max_tokens` / `thinking_enabled` / `thinking_budget` 3개 keyword-only 옵션을 받는다. data flow:

```
TweaksPanel UI → useTweaks (localStorage) → useAgentStream POST /api/query body
   → QueryRequest.{max_tokens, thinking_enabled, thinking_budget}
   → AgentLoop(__init__ 보관) → 매 turn provider.complete(..., max_tokens=..., thinking_*=...)
   → sub_agent tool 인스턴스에는 set_llm_options()로 매 turn inject (turn 시작 시 동기화)
```

옵션 None 시 provider별 환경변수 default fallback (`CLAUDE_MAX_TOKENS`/`LM_STUDIO_MAX_TOKENS` 10000, `CLAUDE_THINKING_BUDGET` 4096). claude는 모델이 extended thinking을 지원하지 않으면 silent ignore + warning 1줄. lm_studio는 thinking_enabled=True 시 항상 warning + 무시. `/api/defaults` GET이 provider-aware default + thinking_supported flag를 노출 → 프론트 `useServerDefaults` hook이 startup에 fetch하여 TweaksPanel 컨트롤 활성화 결정.

### Harmony 마커 정규화 (LM Studio)

일부 모델이 출력하는 `<|channel|>thought` / `<|channel|>analysis` / `<|channel|>final` / `<|end|>` 토큰을 `<think>...</think>` 표준 형식으로 **스트리밍 안전하게** 변환 (`_HarmonyTransformer`). 토큰 경계가 청크 사이에 걸쳐도 정상 처리.

---

## 디자인 시스템 (Phase 6 신규)

### 토큰 구조 (`design/index.css`)
- **OKLCH 컬러** — 지각적 균일 색공간 사용
- 6단계 차트 팔레트: `teal`, `ember`, `violet`, `mono`
- 의미 색상: `--success`, `--warning`, `--danger`, `--info`
- 밀도 변수: `--density-scale` (compact 0.85x / comfortable 1.0x / spacious 1.18x)
- 사이드바 스타일: `minimal`, `elevated`

### 적용 메커니즘 (`framework/hooks/useTweaks.ts`)
- localStorage(`losszero.tweaks.v1`) 영속화
- `data-theme`, `data-density`, `data-sidebar` 속성을 `<html>`에 주입
- `--brand-{300-700}` CSS 변수를 OKLCH 보간으로 동적 계산
- 차트 팔레트도 CSS 변수(`--chart-default-{1-6}`)로 노출 → recharts에서 참조

### TweaksPanel
- 우측 슬라이드 패널, 세그먼티드 컨트롤
- 테마/density/사이드바 스타일/팔레트/디버그 viz 토글
- 즉시 반영 (CSS 변수 변경)

---

## DB 연결

- pyodbc + `asyncio.run_in_executor` (동기 → 비동기 래핑)
- `PyodbcPool` — `queue.Queue` 기반, max_size=5, `SELECT 1` 유효성 검증
- ODBC Driver 자동 감지 (18 → 17 → Native Client → SQL Server)
- DML/DDL 차단: `db_query` 도구에서 regex로 INSERT/UPDATE/DELETE 등 차단

---

## 세션 관리

| 저장소 | 키 | 내용 | 수명 |
|--------|-----|------|------|
| `_sessions` | stream_key | SSE 이벤트 버퍼 | 쿼리 단위 |
| `_conversations` | session_id | 대화 메시지 히스토리 | 세션 단위 (메모리) |
| `_session_domains` | session_id | sticky 도메인 코드 (Phase 9 Fix 1) | 세션 단위 |
| `_continue_gates` | stream_key | asyncio.Event (계속 대기) | 승인 완료까지 |

**`_session_domains` sticky**: 첫 turn에서 `match_domain(query)`이 도메인을 발견하면 session_id에 박제. 후속 turn에서 키워드 매칭이 실패하면 sticky 도메인을 fallback으로 사용 → 사용자가 후속 질문에서 도메인 키워드를 생략해도 컨텍스트가 유지된다.

---

## 스킬 시스템 (.claude/skills/)

Claude Code 세션 전용. **런타임 백엔드와 분리**.

| 스킬 | 역할 |
|------|------|
| LosszeroDB_3Z_MES | MES DB 채널 구조, meta.py (테이블/컬럼/SP 조회), Query.py |
| LosszeroDB_GW | GW DB 메타 조회 |

스킬의 meta.py로 DB를 탐색 → 도메인 JSON 수동 작성 → `schema_registry/domains/`에 배치.

---

## 실행

```bash
# 백엔드
cd backend
uv run python main.py

# 프론트엔드 (별도 터미널)
cd frontend
pnpm dev
```
