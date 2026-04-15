# LossZero Demo — 현재 구현 명세서

> 작성일: 2026-04-14  
> 상태: 프로토타이핑 단계 (구조 개편 전)

---

## 1. 시스템 개요

MSSQL 데이터베이스에 자연어로 질문하면 LLM이 SQL을 생성·실행하고 결과를 시각화하는 웹 애플리케이션.

```
Browser (Next.js :3000)
  └─ /api/* proxy
       └─ FastAPI Backend (:8080, Docker)
            ├─ LLM (LM Studio :1234 or Claude API)
            └─ MSSQL (3z.losszero.net:21433)
```

---

## 2. 인프라 / 배포

| 항목 | 값 |
|------|-----|
| 백엔드 컨테이너 | `python:3.11-slim-bookworm` |
| ODBC 드라이버 | Microsoft ODBC Driver 17 for SQL Server |
| 외부 포트 | `8080:8000` |
| 볼륨 마운트 | `./backend:/app` (uvicorn --reload 활성) |
| env 로딩 | `env_file: .env` |
| 프론트엔드 | 로컬 dev server (`next dev --turbopack`, :3000) |

**`docker-compose.yml`** — backend 서비스만 존재 (PostgreSQL/Redis 없음)

---

## 3. 환경 변수 (`.env`)

```env
# MSSQL
MSSQL_SERVER=3z.losszero.net,21433
MSSQL_PORT=21433
MSSQL_DATABASE=LzPRJ_COM_3Z
MSSQL_USER=lzxpdev_prj
MSSQL_PASSWORD=lzxpdev_prj!
MSSQL_CONNECTION_STRING=        # 직접 지정 시 우선 적용

# LLM 프로바이더
LLM_PROVIDER=claude             # lm_studio | claude

# LM Studio
LM_STUDIO_BASE_URL=http://host.docker.internal:1234/v1
LM_STUDIO_API_KEY=lm-studio
LM_STUDIO_MODEL=                # 비어있으면 payload에서 생략

# Claude API
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
CLAUDE_MODEL=claude-sonnet-4-6
```

---

## 4. 백엔드

### 4-1. 디렉터리 구조

```
backend/
├── Dockerfile
├── requirements.txt
└── app/
    ├── __init__.py
    ├── main.py
    ├── config.py
    ├── routers/
    │   ├── health.py
    │   └── query.py
    ├── llm/
    │   ├── __init__.py       # get_llm_client() 팩토리
    │   ├── base.py           # LLMClient ABC
    │   ├── lm_studio.py      # LM Studio 구현
    │   └── claude.py         # Claude API 구현
    ├── mssql/
    │   ├── connection.py     # pyodbc 실행 레이어
    │   └── schema.py         # 스키마 조회 + 캐시
    └── pipeline/
        ├── __init__.py
        ├── text_to_sql.py    # 레거시: 항상 SQL 실행
        └── agent.py          # 현재: tool calling 기반 agent
```

### 4-2. API 엔드포인트

| Method | Path | 설명 | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/health` | 헬스체크 | — | `{"status":"ok"}` |
| `POST` | `/query` | 레거시 Text-to-SQL (항상 SQL 실행) | `{"question": str}` | `QueryResponse` |
| `POST` | `/query/chat` | Agent 챗봇 (선택적 SQL 실행) | `{"messages": [{role, content}]}` | `ChatResponse` |
| `GET` | `/query/schema` | 스키마 조회 | `?refresh=bool` | `{tables: [...]}` |

**QueryResponse**
```json
{ "question": "...", "sql": "...", "results": [...], "error": null }
```

**ChatResponse**
```json
{
  "type": "text | sql_result",
  "content": "LLM 응답 텍스트",
  "sql": "SELECT ...",
  "results": [...],
  "error": null
}
```

### 4-3. LLM 레이어

**`LLMClient` ABC** (`llm/base.py`)
```python
async def chat(messages, **kwargs) -> str
async def chat_with_tools(messages, tools) -> {"content": str, "tool_call": {...} | None}
```

**`LMStudioClient`** (`llm/lm_studio.py`)
- httpx POST → `{base_url}/chat/completions` (OpenAI 호환)
- `chat_with_tools`: tool calling 시도 → 400 응답 시 `<execute_sql>` tag 기반 fallback

**`ClaudeClient`** (`llm/claude.py`)
- anthropic SDK (`AsyncAnthropic`)
- tools를 Anthropic 포맷으로 변환 (`input_schema`)
- `ToolUseBlock` vs `TextBlock` 분기

### 4-4. Agent Pipeline (`pipeline/agent.py`)

**흐름:**
```
messages → LLM (chat_with_tools, tools=[list_tables, execute_sql])
  ├─ tool_call: list_tables(filter?) → 스키마 조회 → 결과 주입 → 루프 계속
  ├─ tool_call: execute_sql(sql) → DB 실행 → 결과 주입 → 루프 계속
  └─ 텍스트 응답 → 최종 반환
```

**설정값:**
- `MAX_AGENT_STEPS = 5` (무한루프 방지)
- `list_tables` 결과: 최대 80개 테이블 반환 (filter 적용 후)
- `execute_sql` 결과: 최대 100행 LLM에 전달

**Tools 정의:**
- `list_tables(filter?: str)` — 테이블 목록 + 컬럼명 조회
- `execute_sql(sql: str)` — T-SQL SELECT 실행

**시스템 프롬프트:** 스키마 미포함 (tool로 필요 시 조회)

### 4-5. MSSQL 레이어

**`mssql/schema.py`**
- `_fetch_schema()`: `INFORMATION_SCHEMA.TABLES/COLUMNS` 쿼리 (synchronous pyodbc)
- `get_schema(refresh=False)`: async 래퍼, 모듈 레벨 인메모리 캐시 (`_schema_cache`)
- `schema_to_prompt(tables)`: `schema.table(col type?, ...)` 형식 (레거시 파이프라인용)

**`mssql/connection.py`**
- `execute_query(sql)`: async, `loop.run_in_executor()` 로 blocking 방지
- `mssql_cursor()`: context manager, 커서 생명주기 관리

---

## 5. 프론트엔드

### 5-1. 스택

| 항목 | 값 |
|------|-----|
| 프레임워크 | Next.js 15 (App Router) |
| 스타일 | Tailwind CSS v4 (`@tailwindcss/postcss`) |
| 차트 | recharts ^3.8.1 |
| HTTP | axios |
| 스키마 ER 다이어그램 | @xyflow/react + @dagrejs/dagre |
| 언어 | TypeScript |

### 5-2. 디렉터리 구조

```
frontend/src/
├── app/
│   ├── layout.tsx          # RootLayout (Server Component)
│   ├── page.tsx            # 메인 페이지 ('use client')
│   └── globals.css         # Tailwind v4 import
├── api/
│   ├── client.ts           # axios 인스턴스 (/api 프록시)
│   └── query.ts            # postQuery, postChat, getSchema
├── types/
│   └── index.ts            # ChatMessage, AgentResponse, TableInfo 등
└── components/
    ├── Chat/
    │   ├── ChatPanel.tsx       # 채팅 컨테이너, 자동 스크롤
    │   ├── MessageBubble.tsx   # 메시지 버블 (sql_result 인라인 미리보기)
    │   └── QueryInput.tsx      # textarea, Enter 전송, auto-resize
    ├── Results/
    │   ├── ResultsPanel.tsx    # 우측 패널, text/sql_result 분기
    │   ├── SqlBlock.tsx        # SQL 코드 블록, 복사 버튼
    │   ├── ResultTable.tsx     # 결과 테이블 (NULL 처리, 교차 행 색상)
    │   └── ChartPanel.tsx      # recharts Bar/Line 자동 감지, 토글
    └── Schema/
        ├── SchemaGraph.tsx     # dynamic() SSR 비활성 래퍼
        └── SchemaGraphInner.tsx # ReactFlow + Dagre ER 다이어그램
```

### 5-3. 타입 정의 (`types/index.ts`)

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  type: 'text' | 'sql_result'
  sql?: string
  results?: Record<string, unknown>[]
  error?: string | null
}

interface AgentResponse {
  type: 'text' | 'sql_result'
  content: string
  sql?: string
  results?: Record<string, unknown>[]
  error?: string | null
}

interface TableInfo { schema, name, columns: ColumnInfo[] }
interface ColumnInfo { name, type, nullable }
```

### 5-4. 상태 관리 (`page.tsx`)

- `messages: ChatMessage[]` — 전체 대화 히스토리
- `loading: boolean` — 요청 중 상태
- `activeId: string | null` — 선택된 메시지 ID
- `activeMessage: ChatMessage | null` — 우측 패널 표시 데이터
- `rightTab: 'results' | 'schema'` — 우측 탭 상태

메시지 전송 시 전체 history를 `postChat()`에 포함하여 대화 컨텍스트 유지.

### 5-5. API 프록시

`next.config.ts`:
```
/api/:path* → http://localhost:8080/:path*
```

### 5-6. ChartPanel 자동 감지 로직

- 결과 컬럼 분석: 수치형 컬럼 vs 문자열 컬럼 분리
- 수치 + 문자열 컬럼 모두 있을 때만 차트 표시
- label 컬럼값이 날짜 패턴(`YYYY-MM-*`) → LineChart, 그 외 → BarChart
- 최대 50행 렌더링
- Bar/Line 수동 토글 버튼

---

## 6. 알려진 문제 / 개편 필요 사항

### 6-1. Agent 구조 문제

| 문제 | 내용 |
|------|------|
| 스키마 전체 주입 시도 | 초기 설계 시 1,566개 테이블 스키마를 시스템 프롬프트에 넣어 rate limit 소진 |
| tool calling 루프 미검증 | `list_tables` → `execute_sql` 다단계 흐름 실제 동작 미확인 |
| LM Studio fallback 미완성 | tag 기반 fallback이 `list_tables` tool을 지원하지 않음 |
| 대화 히스토리 전송 방식 | 매 요청마다 전체 history 전송 → 대화가 길어질수록 토큰 증가 |

### 6-2. 프론트엔드 잔여 이슈

| 문제 | 내용 |
|------|------|
| `ChatPanel.tsx` 하드코딩 | `msg.queryResponse` 참조 잔재 (구 타입) → `msg.type` 기반으로 수정 필요 |
| 로딩 메시지 | "SQL 생성 중..." 고정 텍스트 → agent 흐름에 맞게 변경 필요 |
| `App.tsx` 미삭제 | `frontend/src/App.tsx` 파일이 잔존 (Next.js 이전 후 불필요) |

### 6-3. 기타

| 문제 | 내용 |
|------|------|
| `/query` 레거시 엔드포인트 | 현재 프론트에서 미사용이지만 코드 잔존 |
| 스키마 캐시 무효화 없음 | 서버 재시작 전까지 캐시 유지, Schema 탭 새로고침 버튼 미구현 |
| Docker .env 민감정보 | API 키가 `.env`에 평문 저장 (개발 환경 전용) |

---

## 7. 파일별 현재 상태 요약

| 파일 | 상태 | 비고 |
|------|------|------|
| `backend/app/config.py` | ✅ 완성 | |
| `backend/app/main.py` | ✅ 완성 | |
| `backend/app/routers/health.py` | ✅ 완성 | |
| `backend/app/routers/query.py` | ✅ 완성 | `/query`, `/query/chat`, `/query/schema` |
| `backend/app/llm/base.py` | ✅ 완성 | `chat` + `chat_with_tools` ABC |
| `backend/app/llm/lm_studio.py` | ⚠️ 부분 완성 | tag fallback이 `list_tables` 미지원 |
| `backend/app/llm/claude.py` | ✅ 완성 | |
| `backend/app/pipeline/text_to_sql.py` | ⚠️ 레거시 | 구조 개편 시 제거 대상 |
| `backend/app/pipeline/agent.py` | ⚠️ 미검증 | tool loop 실동작 확인 필요 |
| `backend/app/mssql/schema.py` | ✅ 완성 | |
| `backend/app/mssql/connection.py` | ✅ 완성 | |
| `frontend/src/app/page.tsx` | ✅ 완성 | |
| `frontend/src/app/layout.tsx` | ✅ 완성 | |
| `frontend/src/api/client.ts` | ✅ 완성 | |
| `frontend/src/api/query.ts` | ✅ 완성 | `postQuery`, `postChat`, `getSchema` |
| `frontend/src/types/index.ts` | ✅ 완성 | |
| `frontend/src/components/Chat/ChatPanel.tsx` | ⚠️ 구 타입 잔재 | `msg.queryResponse` 참조 |
| `frontend/src/components/Chat/MessageBubble.tsx` | ✅ 완성 | |
| `frontend/src/components/Chat/QueryInput.tsx` | ✅ 완성 | |
| `frontend/src/components/Results/ResultsPanel.tsx` | ✅ 완성 | |
| `frontend/src/components/Results/SqlBlock.tsx` | ✅ 완성 | |
| `frontend/src/components/Results/ResultTable.tsx` | ✅ 완성 | |
| `frontend/src/components/Results/ChartPanel.tsx` | ✅ 완성 | |
| `frontend/src/components/Schema/SchemaGraph.tsx` | ✅ 완성 | SSR 비활성 래퍼 |
| `frontend/src/components/Schema/SchemaGraphInner.tsx` | ✅ 완성 | ReactFlow + Dagre |
| `frontend/src/App.tsx` | ❌ 불필요 | Next.js 이전 후 잔존, 삭제 대상 |
| `Dockerfile` | ✅ 완성 | |
| `docker-compose.yml` | ✅ 완성 | |
| `.env.example` | ✅ 완성 | |
| `README.md` | ✅ 완성 | |
