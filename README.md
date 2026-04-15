# LLM Harness — ERP 자연어 조회 플랫폼

MSSQL 제조업 ERP 데이터를 자연어로 조회하고 시각화하는 에이전트 시스템.

## 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | FastAPI, Python 3.11+, pyodbc |
| LLM | Claude API (Anthropic SDK) / LM Studio (OpenAI 호환) |
| Database | MSSQL (읽기 전용) |
| 패키지 | uv (백엔드), pnpm (프론트엔드) |

---

## 빠른 시작

### 1. 환경 변수

```bash
cp .env.example .env
```

`.env`에 MSSQL 접속 정보와 LLM API 키 입력:

```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
MSSQL_SERVER=hostname,port
MSSQL_DATABASE=dbname
MSSQL_USER=user
MSSQL_PASSWORD=pass
```

### 2. 백엔드

```bash
cd backend
uv sync
uv ruv run python main.py    # http://127.0.0.1:8000
```

### 3. 프론트엔드

```bash
cd frontend
pnpm install
pnpm dev                             # http://localhost:5173
```

---

## API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 + LLM 프로바이더 + 도메인 목록 |
| `POST` | `/api/query` | 에이전트 실행 시작. `{query, session_id?}` → `{session_id, status}` |
| `GET` | `/api/stream/{stream_key}` | SSE 이벤트 스트림 |
| `POST` | `/api/approve/{stream_key}` | HITL 도구 승인/거부. `{approved: bool}` |
| `DELETE` | `/api/session/{session_id}` | 세션 정리 |

### SSE 이벤트

| 이벤트 | 데이터 |
|--------|--------|
| `tool_start` | `{tool, input, turn}` |
| `tool_result` | `{tool, output, rows, error, turn}` |
| `llm_chunk` | `{delta}` (스트리밍 텍스트) |
| `approval_required` | `{tool, input, reason, turn}` |
| `final` | `{answer, viz_hint, data}` |
| `error` | `{message}` |

---

## 도메인 레지스트리

LLM이 정확한 테이블/SP를 호출하도록 사전 정의된 스키마 정보.

- 위치: `backend/domains/*.json`
- 사용자가 직접 작성하거나 `gen_domain.py`로 생성
- 사용자 질문의 키워드와 매칭되면 자동으로 시스템 프롬프트에 주입

매칭되지 않는 질문은 `explore_schema` 도구를 통해 DB를 직접 탐색 (사용자 승인 필요).

---

## 아키텍처

상세 구조는 [ARCHITECTURE.md](./ARCHITECTURE.md) 참조.

```
사용자 질문 → POST /api/query
  → 도메인 매칭 → 스키마 컨텍스트 주입
  → AgentLoop (최대 10턴)
    → LLM 호출 → 도구 선택 → 실행 → 결과 반환
  → SSE 스트리밍 → 프론트엔드 렌더링
```

---

## 환경변수 목록

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LLM_PROVIDER` | `claude` | `claude` 또는 `lm_studio` |
| `ANTHROPIC_API_KEY` | — | Claude API 키 |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude 모델명 |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio 엔드포인트 |
| `MSSQL_SERVER` | — | MSSQL 호스트 (예: `host,port`) |
| `MSSQL_DATABASE` | — | 데이터베이스명 |
| `MSSQL_USER` | — | DB 사용자 |
| `MSSQL_PASSWORD` | — | DB 비밀번호 |
| `AGENT_MAX_TURNS` | `10` | 에이전트 최대 턴 수 |
| `SP_WHITELIST` | (빈값=전체허용) | SP 호출 허용 목록 (콤마 구분) |
