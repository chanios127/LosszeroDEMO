# LLM Harness — ERP 자연어 조회 플랫폼

MSSQL ERP/MES/그룹웨어 데이터를 자연어로 조회하고 시각화하는 에이전트 시스템.

## 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts, react-markdown |
| Backend | FastAPI, Python 3.12+, pyodbc |
| LLM | Claude API (Anthropic SDK) / LM Studio (OpenAI 호환) |
| Database | MSSQL (읽기 전용) |
| 패키지 | uv (백엔드), pnpm (프론트엔드) |

---

## 빠른 시작

### 1. 환경 변수

```bash
cp .env.example .env
```

`.env`에 MSSQL 접속 정보와 LLM 설정 입력:

```env
LLM_PROVIDER=claude          # 또는 lm_studio
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
uv run python main.py       # http://0.0.0.0:8000
```

### 3. 프론트엔드

```bash
cd frontend
pnpm install
pnpm dev                     # http://localhost:5173
```

---

## API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 + 등록 도메인 |
| `GET` | `/api/domains` | 등록된 도메인 목록 (프론트엔드 동적 렌더링용) |
| `POST` | `/api/query` | 에이전트 실행 시작. `{query, session_id?}` → `{session_id, status}` |
| `GET` | `/api/stream/{stream_key}` | SSE 이벤트 스트림 |
| `POST` | `/api/continue/{stream_key}` | 10턴 초과 시 계속/중단. `{proceed: bool}` |
| `DELETE` | `/api/session/{session_id}` | 세션 정리 |

### SSE 이벤트

| 이벤트 | 데이터 |
|--------|--------|
| `tool_start` | `{tool, input, turn}` |
| `tool_result` | `{tool, output, rows, error, turn}` |
| `llm_chunk` | `{delta}` (스트리밍 텍스트) |
| `continue_prompt` | `{turn, message}` (10턴 도달 시) |
| `final` | `{answer, viz_hint, data}` |
| `error` | `{message}` |

---

## 도메인 레지스트리

LLM에 DB 스키마를 사전 주입하여 정확한 테이블/SP 호출을 유도.

- 위치: `backend/schema_registry/domains/*.json`
- 서버 시작 시 자동 로드 → 질문 키워드 매칭 → 시스템 프롬프트에 스키마 주입
- SP 화이트리스트도 도메인 JSON 내 `stored_procedures` 필드에서 자동 추출

### 도메인 JSON 추가 방법

`backend/schema_registry/domains/` 에 JSON 파일 추가:

```json
{
  "domain": "groupware",
  "display_name": "그룹웨어",
  "db": "GW",
  "keywords": ["출근", "퇴근", "근태", "업무일지"],
  "table_groups": { "attendance": "근태 — 출퇴근 기록" },
  "stored_procedures": [],
  "tables": [
    {
      "name": "dbo.TGW_AttendList",
      "table_group": "attendance",
      "description": "출/퇴근 기록",
      "columns": [
        {"name": "at_AttDt", "type": "datetime", "pk": true, "description": "출근일시"}
      ]
    }
  ]
}
```

프론트엔드 에이전트 카드는 `/api/domains`에서 동적 생성됨.

---

## 아키텍처

상세 구조는 [ARCHITECTURE.md](./ARCHITECTURE.md) 참조.

```
사용자 질문 → POST /api/query
  → 도메인 키워드 매칭 → 스키마 컨텍스트 주입
  → AgentLoop (10턴 단위, 사용자 승인으로 연장)
    → LLM 호출 → 도구 선택 → 실행 → 결과 반환
  → SSE 스트리밍 → 프론트엔드 시각화 (recharts)
```

---

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LLM_PROVIDER` | `claude` | `claude` 또는 `lm_studio` |
| `ANTHROPIC_API_KEY` | — | Claude API 키 |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude 모델명 |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio 엔드포인트 |
| `MSSQL_SERVER` | — | MSSQL 호스트 (예: `host,port`) |
| `MSSQL_DATABASE` | — | 데이터베이스명 |
| `MSSQL_USER` / `MSSQL_PASSWORD` | — | DB 인증 |
| `AGENT_MAX_TURNS` | `10` | 턴 단위 (초과 시 사용자에게 계속 여부 확인) |
| `MAX_CONVERSATION_HISTORY` | `20` | 세션 내 최대 메시지 수 |
