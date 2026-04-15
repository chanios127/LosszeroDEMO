# DESIGN-phase2.md — MSSQL 연결 + Text-to-SQL 파이프라인
> 작성: 2026-04-10 | 상태: ✅ 완료
> 전체 로드맵은 DESIGN.md 참조

---

## Phase 목표

자연어 질문을 받아 MSSQL에서 데이터를 조회하고 결과를 반환하는 백엔드 파이프라인을 완성한다.
Schema 추출 → SQL 생성 → 실행 → 결과 반환 + PostgreSQL 이력 저장.

## 입력 / 출력

```
입력: Phase 1 산출물 (FastAPI 앱, LLM 호출 레이어, PostgreSQL)
출력:
  - POST /query  → { question, sql, results, query_id }
  - GET  /schema → { tables: [{ name, columns: [{ name, type }] }] }
  - PostgreSQL query_history 테이블에 실행 이력 저장
```

## 디렉토리 구조 (추가분)

```
backend/app/
├── mssql/
│   ├── connection.py    # pyodbc 연결 팩토리 (동기 → asyncio executor 래핑)
│   └── schema.py        # INFORMATION_SCHEMA 기반 테이블/컬럼 추출
├── pipeline/
│   └── text_to_sql.py   # NL → SQL 생성 → 실행 → 결과 반환
├── models/
│   └── query_history.py # SQLAlchemy ORM: query_history 테이블
└── routers/
    └── query.py         # POST /query, GET /schema
```

## 세부 작업 목록

### 완료
_(없음)_

### 진행 중
- 🔄 DESIGN-phase2.md 작성 ← 현재 여기

### 대기
- 🔲 mssql/connection.py — pyodbc + asyncio.get_event_loop().run_in_executor 래핑
- 🔲 mssql/schema.py — INFORMATION_SCHEMA.COLUMNS 조회, 결과 캐싱
- 🔲 models/query_history.py — ORM 모델 (question, sql, status, created_at)
- 🔲 pipeline/text_to_sql.py — schema → system prompt → LLM → SQL → pyodbc 실행
- 🔲 routers/query.py — POST /query, GET /schema 엔드포인트
- 🔲 main.py에 query 라우터 등록

## SQL 생성 System Prompt 전략

```
You are a SQL expert for Microsoft SQL Server.
Given the schema below, generate a single valid T-SQL SELECT query.
Rules:
- SELECT only, no INSERT/UPDATE/DELETE/DROP
- Return ONLY the SQL statement, no explanation
- Use table aliases for readability

Schema:
{schema_text}
```

## 미해결 이슈

| 이슈 | 현황 |
|---|---|
| Schema가 큰 경우 prompt token 초과 | 검토 중 — 우선 전체 schema 전달, Phase 4에서 관련 테이블 선택 로직 추가 |
| pyodbc는 동기 드라이버 | asyncio executor로 래핑하여 FastAPI 이벤트 루프 블로킹 방지 |

## 완료 기준

- [ ] `POST /query` — 자연어 입력 → SQL 생성 → MSSQL 실행 → 결과 반환
- [ ] `GET /schema` — MSSQL 스키마 JSON 반환
- [ ] PostgreSQL `query_history` 테이블에 이력 저장 확인

## 완료 시 처리

- [ ] 이 파일 상태를 ✅ 완료로 변경
- [ ] DESIGN.md 로드맵 Phase 2 → ✅ 완료 갱신
- [ ] 이 파일을 `_archive/` 로 이동
- [ ] `DESIGN-phase3.md` 생성
