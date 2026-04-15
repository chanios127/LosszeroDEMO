# DESIGN-phase1.md — 프로젝트 기반 설정
> 작성: 2026-04-10 | 상태: ✅ 완료
> 전체 로드맵은 DESIGN.md 참조

---

## Phase 목표

이후 모든 Phase의 토대가 되는 인프라와 코드 골격을 완성한다.
Docker Compose로 서비스를 띄우고, FastAPI가 PostgreSQL과 통신하며 헬스체크 엔드포인트가 정상 응답하면 완료.

## 입력 / 출력

```
입력: 빈 프로젝트 디렉토리
출력: 
  - 실행 가능한 Docker Compose 환경 (FastAPI + PostgreSQL + Ollama)
  - FastAPI 앱 뼈대 (라우터 구조, DB 세션, 설정 관리)
  - React + Vite 프론트엔드 뼈대 (라우팅, API 클라이언트)
  - 로컬 개발 실행 가이드
```

## 디렉토리 구조 (목표)

```
LosszeroDEMO/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 진입점
│   │   ├── config.py            # 환경변수 설정 (pydantic-settings)
│   │   ├── database.py          # PostgreSQL 세션 (SQLAlchemy async)
│   │   ├── routers/
│   │   │   └── health.py        # GET /health
│   │   └── models/              # SQLAlchemy ORM 모델
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── api/
│   │       └── client.ts        # axios 기반 API 클라이언트
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── .env.example
├── DESIGN.md
└── DESIGN-phase1.md
```

## 세부 작업 목록

### 완료
_(없음)_

### 진행 중
- 🔄 DESIGN.md / DESIGN-phase1.md 작성 ← 현재 여기

### 대기
- 🔲 docker-compose.yml 작성 (FastAPI, PostgreSQL 서비스 — LM Studio는 외부 프로세스)
- 🔲 .env.example 작성 (MSSQL DSN, PostgreSQL URL, LLM 엔드포인트 등)
- 🔲 FastAPI 앱 뼈대 (main.py, config.py, database.py, health 라우터)
- 🔲 requirements.txt (fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, pyodbc, pydantic-settings, httpx)
- 🔲 React + Vite 프론트엔드 초기화 및 axios 클라이언트 설정
- 🔲 Dockerfile (backend, frontend)
- 🔲 docker compose up 후 /health 200 응답 확인

## 미해결 이슈

| 이슈 | 현황 |
|---|---|
| LLM 런타임 관리 방식 | ✅ 결정 — LM Studio 로컬 외부 실행, Compose 미포함 |
| MSSQL 접속 정보 | ✅ 결정 — .env 파일에 직접 기입 방식, 코드에 하드코딩 없음 |

## 완료 기준

- [ ] `docker compose up` 으로 전체 스택 기동
- [ ] `GET /health` → `{"status": "ok"}` 응답
- [ ] FastAPI ↔ PostgreSQL(5434) 연결 정상
- [ ] React 개발 서버 기동 및 API 클라이언트 /health 호출 성공

## 완료 시 처리

- [ ] 이 파일 상태를 ✅ 완료로 변경
- [ ] DESIGN.md 로드맵 섹션 갱신 (Phase 1 → ✅ 완료)
- [ ] 이 파일을 `_archive/` 로 이동
- [ ] `DESIGN-phase2.md` 생성
