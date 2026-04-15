# LLM Harness — Architecture

> 최종 갱신: 2026-04-15

## 개요

MSSQL 제조업 ERP 데이터를 자연어로 조회하고 시각화하는 에이전트 시스템.
Claude/LM Studio를 LLM으로, 도메인 레지스트리로 스키마를 관리하며, HITL(Human-in-the-Loop) 승인 게이트를 포함한다.

---

## 파일 구조

```
LosszeroDEMO/
├── backend/                         # FastAPI + Agent Loop
│   ├── main.py                      # 엔트리포인트, 라우터, SSE, HITL 승인
│   ├── pyproject.toml               # uv 의존성 (fastapi, anthropic, pyodbc)
│   ├── agent/
│   │   ├── loop.py                  # 멀티턴 에이전트 루프 (ReAct 패턴)
│   │   └── events.py                # SSE 이벤트 타입 6종
│   ├── llm/
│   │   ├── base.py                  # LLMProvider ABC, Message, ToolSchema
│   │   ├── __init__.py              # Provider 팩토리 (claude | lm_studio)
│   │   ├── claude.py                # Anthropic SDK 스트리밍
│   │   └── lm_studio.py            # OpenAI 호환 + <execute_sql> 태그 fallback
│   ├── tools/
│   │   ├── base.py                  # Tool ABC (requires_approval 속성 포함)
│   │   ├── db_query.py              # SELECT 전용 (DML/DDL 차단)
│   │   ├── sp_call.py               # SP 화이트리스트 실행
│   │   ├── domain_lookup.py         # 도메인 레지스트리 조회 (자동)
│   │   └── explore_schema.py        # INFORMATION_SCHEMA 탐색 (HITL 승인 필요)
│   ├── db/
│   │   └── connection.py            # pyodbc 풀 + run_in_executor
│   └── domains/
│       ├── loader.py                # JSON 로더, 키워드 매칭, 프롬프트 변환
│       └── *.json                   # 도메인 정의 (사용자 작성)
│
├── frontend/                        # React 18 + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx                  # 메인 레이아웃
│   │   ├── hooks/
│   │   │   └── useAgentStream.ts    # SSE 수신 + useReducer 상태관리
│   │   ├── types/
│   │   │   └── events.ts            # AgentEvent, ChatMessage 타입
│   │   └── components/
│   │       ├── ChatInput.tsx         # 자연어 입력
│   │       ├── MessageThread.tsx     # 대화 스레드 (버블 UI)
│   │       ├── AgentTrace.tsx        # 도구 실행 추적 (접이식)
│   │       ├── VizPanel.tsx          # 차트/테이블 시각화
│   │       └── ApprovalPrompt.tsx    # HITL 승인/거부 UI
│   ├── package.json                 # react, recharts, tailwindcss
│   └── vite.config.ts               # 5173번 포트, /api → 8000 프록시
│
├── .claude/skills/LosszeroDB_3Z_MES/ # Claude Code 세션 전용 도구
│   ├── skill.md                      # 채널 구조 문서 (자동 로드)
│   ├── connect.py                    # DB0/DB1/DB2 멀티채널 커넥터
│   ├── meta.py                       # 메타데이터 조회 CLI
│   ├── gen_domain.py                 # 도메인 JSON 생성 스크립트
│   └── Query.py                      # SQL 실행 CLI
│
├── .env.example                      # 환경변수 템플릿
├── docker-compose.yml                # backend + frontend 서비스
├── DESIGN.md / SPEC.md               # 설계 문서
└── ARCHITECTURE.md                   # ← 이 문서
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
[AgentLoop] ◀──────────────── 반복 (최대 10턴) ─────────────────┐
  │                                                               │
  ├─ LLM.complete(messages, tools)                                │
  │   ├─ TEXT_DELTA → LLMChunkEvent (스트리밍 텍스트)              │
  │   ├─ TOOL_CALL → 도구 선택                                    │
  │   └─ DONE → 루프 탈출                                         │
  │                                                               │
  ├─ 도구 실행                                                     │
  │   ├─ requires_approval? → ApprovalRequestEvent → 사용자 대기   │
  │   ├─ tool.execute(input)                                      │
  │   ├─ ToolResultEvent → 결과 SSE 전송                           │
  │   └─ 메시지 히스토리에 assistant(tool_use) + tool(result) 추가   │
  │                                                               │
  └─ tool_call 없으면 → FinalEvent(answer, viz_hint, data) ───────┘
                              │
                              ▼
                        [MessageThread]
                          ├─ 답변 텍스트
                          ├─ CollapsibleTrace (도구 호출 내역)
                          └─ InlineViz (차트/테이블)
```

---

## SSE 이벤트 타입

| 이벤트 | 발생 시점 | 데이터 |
|--------|----------|--------|
| `tool_start` | 도구 호출 시작 | tool, input, turn |
| `tool_result` | 도구 실행 완료 | tool, output, rows, error, turn |
| `llm_chunk` | LLM 텍스트 스트리밍 | delta |
| `approval_required` | HITL 승인 대기 | tool, input, reason, turn |
| `final` | 에이전트 완료 | answer, viz_hint, data |
| `error` | 에러 발생 | message |

---

## 도구 목록

| 도구 | 승인 | 용도 |
|------|------|------|
| `domain_lookup` | 자동 | 등록된 도메인/테이블/SP 목록 조회 |
| `db_query` | 자동 | SELECT 쿼리 실행 (DML/DDL 차단) |
| `sp_call` | 자동 | 화이트리스트 SP 실행 |
| `explore_schema` | **HITL** | INFORMATION_SCHEMA 직접 조회 (토큰 비용 높음) |

---

## 도메인 레지스트리

**목적**: LLM에 DB 스키마를 사전 주입하여 없는 테이블/SP 호출 방지

**작동 방식**:
1. `backend/domains/*.json` 서버 시작 시 로드
2. 사용자 질문 → 키워드 매칭 → 해당 도메인 스키마를 시스템 프롬프트에 주입
3. LLM은 주입된 스키마만 참조하여 쿼리 생성

**JSON 구조**:
```json
{
  "domain": "production",
  "display_name": "생산실적",
  "keywords": ["생산", "실적", "작업", "공정"],
  "table_groups": { "production_result": "생산실적 — 실적 헤더 및 상세" },
  "stored_procedures": [
    { "name": "LLM_ActWorkNote", "params": [{"name": "@sDt", "type": "date", "required": true}] }
  ],
  "tables": [
    { "name": "dbo.WPM_WorkPrdMST", "columns": [...], "joins": [...] }
  ]
}
```

**생성 도구**: `.claude/skills/LosszeroDB_3Z_MES/gen_domain.py`
- `meta.py`로 DB에서 컬럼 정보 자동 추출
- 그룹 분류, 조인 관계, 키워드는 수동 정의

---

## HITL 승인 흐름

```
AgentLoop: explore_schema 호출 감지
  → ApprovalRequestEvent SSE 발행
  → asyncio.Event 대기 (타임아웃 120초)

Frontend: ApprovalPrompt 표시
  → 사용자 "승인" 또는 "거부" 클릭
  → POST /api/approve/{stream_key} {approved: bool}

Backend: asyncio.Event.set()
  → 승인: 도구 실행 → 결과 반환
  → 거부: "사용자가 거부했습니다" → LLM에 전달
```

---

## LLM Provider

| Provider | 연결 방식 | Tool Calling | Fallback |
|----------|----------|-------------|----------|
| Claude | Anthropic SDK 스트리밍 | 네이티브 tool_use | 없음 |
| LM Studio | httpx OpenAI 호환 | 네이티브 (모델 의존) | `<execute_sql>` 태그 추출 |

**시스템 프롬프트**: 고정 기본 프롬프트 + 도메인 컨텍스트 동적 합성.
system role 메시지는 ClaudeProvider에서 `system` 파라미터로, LMStudioProvider에서 OpenAI system 메시지로 변환.

---

## DB 연결

- **드라이버**: pyodbc (ODBC Driver 자동 감지: 18 → 17 → Native Client → SQL Server)
- **풀링**: `PyodbcPool` — `queue.Queue` 기반, max_size=5, `SELECT 1` 유효성 검증
- **비동기**: `asyncio.run_in_executor`로 동기 pyodbc 래핑
- **읽기 전용**: `db_query` 도구에서 DML/DDL 키워드 regex 차단

---

## 세션 관리

| 저장소 | 키 | 내용 | 수명 |
|--------|-----|------|------|
| `_sessions` | stream_key | SSE 이벤트 버퍼 | 쿼리 단위 |
| `_conversations` | session_id | 대화 메시지 히스토리 | 세션 단위 (메모리) |
| `_approvals` | stream_key | asyncio.Event (HITL 대기) | 승인 완료까지 |

- 대화 히스토리: 최대 20개 메시지 (MAX_CONVERSATION_HISTORY)
- 세션 정리: `DELETE /api/session/{id}`

---

## 스킬 시스템 (.claude/skills/)

Claude Code 세션에서 자동 로드되는 컨텍스트 + CLI 도구.
**런타임 백엔드와 분리** — 스킬은 개발 시 DB 탐색/도메인 생성용.

| 파일 | 역할 | 런타임 사용 |
|------|------|------------|
| skill.md | 채널 구조 참조 문서 | ✗ (Claude Code만) |
| connect.py | 멀티채널 DB 커넥터 | ✗ |
| meta.py | 메타데이터 조회 (CLI) | ✗ |
| gen_domain.py | 도메인 JSON 생성 | ✗ (출력물만 사용) |
| Query.py | SQL 실행 (CLI) | ✗ |

---

## 환경변수

```bash
# LLM
LLM_PROVIDER=claude           # claude | lm_studio
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6

# LM Studio (선택)
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_API_KEY=lm-studio

# MSSQL
MSSQL_SERVER=hostname,port
MSSQL_DATABASE=dbname
MSSQL_USER=user
MSSQL_PASSWORD=pass

# 에이전트
AGENT_MAX_TURNS=10
MAX_CONVERSATION_HISTORY=20
SP_WHITELIST=                  # 비어있으면 전체 허용
```

---

## 실행

```bash
# 로컬 개발
cd backend && uv run uvicorn main:app --reload   # :8000
cd frontend && pnpm dev                           # :5173

# Docker
docker-compose up --build
```
