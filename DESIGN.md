# DESIGN.md
> 작성: 2026-04-10 | 갱신 조건: Phase 전환, 전체 방향 변경 시
> Phase 상세 설계는 DESIGN-phase{N}.md 참조

---

## 시스템 목적

MSSQL에 저장된 업무 데이터를 자연어로 조회할 수 있는 Text-to-SQL 시스템을 구축한다.
사용자는 SQL 없이 대화형 챗봇으로 데이터를 질의하고, 결과를 시각화 UI에서 확인한다.

## 핵심 설계 원칙

1. **NL → SQL 단방향 흐름**: 자연어 입력 → LLM SQL 생성 → MSSQL 실행 → 결과 반환. 역방향 없음.
2. **LLM 호출 레이어 추상화**: LM Studio(기본)와 Claude API를 OpenAI 호환 인터페이스로 통일. LM Studio는 로컬 외부 프로세스로 실행되며 Docker Compose에 포함하지 않는다.
3. **읽기 전용 MSSQL 접근**: 데이터 파이프라인은 MSSQL을 SELECT만 한다. 쓰기는 분석 결과 DB(PostgreSQL)에만 한다.
4. **결과 영속화**: 쿼리 실행 결과와 생성된 SQL은 PostgreSQL에 저장하여 이력 추적 가능.
5. **컨테이너 격리**: 각 서비스(Backend, PostgreSQL, Ollama)는 Docker Compose로 격리 실행.

## Phase 로드맵

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트 기반 설정 — Docker Compose, FastAPI 뼈대, PostgreSQL 연결 | ✅ 완료 |
| 2 | MSSQL 연결 + Schema 추출 + Text-to-SQL 파이프라인 (백엔드) | ✅ 완료 |
| 3 | 대화형 챗봇 UI + 쿼리 결과 시각화 (프론트엔드) | 🔄 진행 중 |
| 4 | LLM 멀티 프로바이더 지원 + 고도화 (스키마 캐시, 쿼리 이력) | 🔲 미착수 |

## 주요 설계 결정 색인

| ADR | 결정 요약 |
|---|---|
| ADR-001 | Text-to-SQL 방식 채택 — NL 질의를 SQL로 변환하여 MSSQL 직접 조회 |
| ADR-002 | LLM 인터페이스를 OpenAI 호환 API로 통일 — LM Studio/Claude 동일 코드로 처리. LM Studio는 외부 프로세스, Compose 미포함 |
| ADR-003 | MSSQL 읽기 전용, 분석 결과는 PostgreSQL에 저장 — 운영 DB 보호 |
