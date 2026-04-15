# LossZero Demo — Text-to-SQL

MSSQL 데이터를 자연어로 조회하는 Text-to-SQL 챗봇 시스템.

## 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Next.js 15 (App Router), Tailwind CSS v4, @xyflow/react |
| Backend | FastAPI, Python 3.11, pyodbc |
| Database | MSSQL (읽기 전용) |
| LLM | LM Studio (로컬, OpenAI 호환) / Claude API (fallback) |
| 컨테이너 | Docker Compose |

---

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
```

`.env`를 열어 MSSQL 접속 정보와 LLM 설정을 입력:

```env
# MSSQL
MSSQL_SERVER=<host,port>
MSSQL_DATABASE=<database>
MSSQL_USER=<username>
MSSQL_PASSWORD=<password>

# LLM 프로바이더: lm_studio | claude
LLM_PROVIDER=lm_studio

# LM Studio (로컬 실행 중이어야 함)
LM_STUDIO_BASE_URL=http://host.docker.internal:1234/v1
LM_STUDIO_MODEL=<로드된 모델 이름>
```

### 2. 백엔드 실행

#### Docker (권장)

```bash
docker compose up --build
```

백엔드: `http://localhost:8080`

#### 로컬 직접 실행 (개발용)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

> `next.config.ts`의 프록시 destination을 포트에 맞게 확인하세요.

### 3. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저: `http://localhost:3000`

---

## 프로젝트 구조

```
LosszeroDEMO/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 앱, CORS
│   │   ├── config.py            # pydantic-settings 환경 변수
│   │   ├── routers/
│   │   │   ├── health.py        # GET /health
│   │   │   └── query.py         # POST /query, GET /query/schema
│   │   ├── pipeline/
│   │   │   └── text_to_sql.py   # 질문 → SQL → 실행 파이프라인
│   │   ├── llm/
│   │   │   ├── __init__.py      # get_llm_client() 팩토리
│   │   │   ├── base.py          # LLMClient ABC
│   │   │   ├── lm_studio.py     # LM Studio (httpx, OpenAI 호환)
│   │   │   └── claude.py        # Claude API (anthropic SDK)
│   │   └── mssql/
│   │       ├── schema.py        # 스키마 조회 + 캐시
│   │       └── executor.py      # SQL 실행 (pyodbc async 래퍼)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx       # Root Layout (Server Component)
│   │   │   ├── page.tsx         # 메인 페이지 ('use client')
│   │   │   └── globals.css      # Tailwind v4 import + 전역 스타일
│   │   ├── components/
│   │   │   ├── Chat/            # ChatPanel, MessageBubble, QueryInput
│   │   │   ├── Results/         # ResultsPanel, SqlBlock
│   │   │   └── Schema/          # SchemaGraph (dynamic), SchemaGraphInner
│   │   ├── api/
│   │   │   ├── client.ts        # axios 인스턴스
│   │   │   └── query.ts         # postQuery, getSchema
│   │   └── types/index.ts       # QueryResponse, TableInfo 등
│   ├── next.config.ts           # /api/* 프록시 → 백엔드
│   └── package.json
├── docker-compose.yml
├── .env.example
└── DESIGN.md
```

---

## API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/health` | 헬스 체크 |
| `POST` | `/query` | `{ "question": "..." }` → SQL + 결과 |
| `GET` | `/query/schema` | 테이블/컬럼 목록 (캐시) |
| `GET` | `/query/schema?refresh=true` | 캐시 무효화 후 재조회 |

### POST /query 응답 예시

```json
{
  "question": "최근 주문 10건을 보여줘",
  "sql": "SELECT TOP 10 * FROM dbo.Orders ORDER BY OrderDate DESC",
  "results": [...],
  "error": null
}
```

---

## LLM 설정

### LM Studio (기본)

1. LM Studio 실행 → 모델 로드 → Local Server 탭에서 서버 시작 (기본 포트 1234)
2. `.env`에서 `LLM_PROVIDER=lm_studio`, `LM_STUDIO_MODEL=<모델명>` 설정
3. Docker에서 실행 시 `LM_STUDIO_BASE_URL=http://host.docker.internal:1234/v1` 유지

### Claude API (fallback)

```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

---

## 개발 메모

- **포트 충돌**: Docker Desktop이 내부적으로 8000을 사용하므로 외부 포트는 8080으로 설정됨
- **ReactFlow SSR**: `next/dynamic`으로 `ssr: false` 처리 (`SchemaGraph.tsx` → `SchemaGraphInner.tsx`)
- **Tailwind v4**: `postcss.config.mjs`에서 `@tailwindcss/postcss` 플러그인 사용 (vite 플러그인 아님)
- **스키마 캐시**: 서버 재시작 전까지 인메모리 캐시 유지; Schema 탭 "새로고침" 버튼으로 수동 갱신 가능
