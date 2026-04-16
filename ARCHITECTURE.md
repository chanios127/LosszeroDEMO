# LLM Harness — Architecture

> 최종 갱신: 2026-04-16

## 개요

MSSQL ERP/MES/그룹웨어 데이터를 자연어로 조회하고 시각화하는 에이전트 시스템.
Claude/LM Studio를 LLM으로, 도메인 레지스트리로 스키마를 관리한다.

---

## 파일 구조

```
LosszeroDEMO/
├── backend/
│   ├── main.py                          # FastAPI 엔트리, 라우터, SSE, HITL
│   ├── pyproject.toml                   # uv 의존성
│   ├── agent/
│   │   ├── loop.py                      # 멀티턴 에이전트 루프 (ReAct)
│   │   └── events.py                    # SSE 이벤트 타입 6종
│   ├── llm/
│   │   ├── base.py                      # LLMProvider ABC, Message, ToolSchema
│   │   ├── __init__.py                  # Provider 팩토리 (claude | lm_studio)
│   │   ├── claude.py                    # Anthropic SDK 스트리밍
│   │   └── lm_studio.py                # OpenAI 호환 + <execute_sql> fallback
│   ├── tools/
│   │   ├── base.py                      # Tool ABC
│   │   ├── list_tables.py              # 테이블명 조회 + 도메인 분류
│   │   ├── db_query.py                  # SELECT 전용 (DML/DDL 차단)
│   │   └── sp_call.py                   # SP 화이트리스트 실행
│   ├── db/
│   │   └── connection.py                # pyodbc 풀 + run_in_executor
│   ├── domains/
│   │   ├── loader.py                    # 도메인 로더 v3 (schema_registry 글로빙)
│   │   └── __init__.py
│   └── schema_registry/
│       └── domains/
│           └── *.json                   # 도메인 정의 (사용자 작성)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # 라우터 (CSS hidden 방식 — 탭 전환 세션 유지)
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx        # 대시보드 (도메인 수 동적)
│   │   │   ├── DataQueryPage.tsx        # 데이터 조회 (채팅 + 결과)
│   │   │   └── AgentChatPage.tsx        # 에이전트 챗봇 (도메인 동적 카드)
│   │   ├── components/
│   │   │   ├── AppShell.tsx             # 사이드바 + 헤더 레이아웃
│   │   │   ├── ChatInput.tsx            # 자연어 입력
│   │   │   ├── MessageThread.tsx        # 대화 스레드 (마크다운 + <think> 블록)
│   │   │   ├── AgentTrace.tsx           # 도구 실행 추적 (접이식)
│   │   │   ├── VizPanel.tsx             # 차트 시각화 (SwitchableViz, InlineViz)
│   │   │   └── ResultsBoard.tsx         # 결과 히스토리 패널
│   │   ├── hooks/
│   │   │   └── useAgentStream.ts        # SSE + useReducer 상태관리
│   │   └── types/
│   │       └── events.ts                # AgentEvent, ChatMessage, ResultEntry
│   ├── package.json
│   └── vite.config.ts                   # /api → 127.0.0.1:8000 프록시
│
├── .claude/skills/                      # Claude Code 세션 전용 도구 (런타임 미사용)
│   ├── LosszeroDB_3Z_MES/               # MES DB 탐색
│   └── LosszeroDB_GW/                   # GW DB 탐색
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
| `final` | 에이전트 완료 | answer, viz_hint, data |
| `error` | 에러 발생 | message |

---

## 도구 목록

| 도구 | 용도 |
|------|------|
| `list_tables` | 테이블명 조회 + 도메인 자동 분류 |
| `db_query` | SELECT 쿼리 실행 (DML/DDL regex 차단) |
| `sp_call` | 화이트리스트 SP 실행 (도메인 JSON에서 추출) |

---

## 도메인 레지스트리

**위치**: `backend/schema_registry/domains/*.json`

**작동 방식**:
1. 서버 시작 시 `*.json` 글로빙 → 메모리 캐시
2. 사용자 질문 → keywords 매칭 → 최적 도메인 선택
3. 해당 도메인의 테이블/컬럼/SP 정보를 시스템 프롬프트에 주입
4. SP 화이트리스트도 도메인 JSON 내 `stored_procedures`에서 자동 추출

**JSON 구조**:
```json
{
  "domain": "groupware",
  "display_name": "그룹웨어",
  "db": "GW",
  "keywords": ["출근", "퇴근", "근태"],
  "table_groups": { "attendance": "근태 — 출퇴근 기록" },
  "stored_procedures": [],
  "tables": [
    {
      "name": "dbo.TGW_AttendList",
      "table_group": "attendance",
      "description": "출/퇴근 기록",
      "columns": [{"name": "at_AttDt", "type": "datetime", "pk": true, "description": "출근일시"}],
      "joins": [{"target": "dbo.TGW_AttendExcept", "on": "...", "type": "one_to_many"}]
    }
  ]
}
```

**프론트엔드 연동**: `GET /api/domains` → 에이전트 카드 동적 생성 (AgentChatPage)

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

### 상태 관리 (`useAgentStream`)
- `useReducer` 기반 — messages[], results[], sessionId, pendingContinue
- `ResultEntry` — 쿼리 결과 스냅샷 자동 누적 (ResultsBoard에서 히스토리 표시)
- 탭 전환해도 상태 유지 (CSS hidden)

---

## LLM Provider

| Provider | 연결 | Tool Calling | Fallback |
|----------|------|-------------|----------|
| Claude | Anthropic SDK 스트리밍 | 네이티브 tool_use | — |
| LM Studio | httpx OpenAI 호환 | 네이티브 (모델 의존) | `<execute_sql>` 태그 추출 |

시스템 프롬프트 = 고정 기본 + 도메인 컨텍스트 동적 합성.

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
| `_continue_gates` | stream_key | asyncio.Event (계속 대기) | 승인 완료까지 |

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
