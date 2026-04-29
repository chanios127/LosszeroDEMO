# LLM Harness — 미이행 로드맵

> 최종 갱신: 2026-04-29 (Phase 7 종료 시점)

현재 SPEC.md에 정의된 기능은 Phase 7까지 완료. 이 문서는 **다음 세션에서 이어서 할 작업**을 정리합니다.

## ✅ Phase 7에서 처리됨 (도메인 레지스트리 폴더화 + join 1급화)

- **도메인 폴더 형식 도입** — `groupware.json` → `groupware/{meta,tables,joins,stored_procedures}.json` 분리. 단일 `*.json` 형식은 하위호환 유지
- **joins 1급 스키마** — 테이블 하위 `joins[*]` (target/on string) → top-level `joins[*]` 객체 (`from_table`/`to_table`/`from_columns`/`to_columns`/`operators`/`join_type`). composite key + `=`/`<>`/`>`/`<`/`>=`/`<=` 연산자 지원
- **로더 디렉토리 인식** — `backend/domains/loader.py:_load_directory_omain()` + `load_all_domains()` 디렉토리 순회 추가
- **`domain_to_context()` top-level joins 직렬화** — `### Join Relationships` 섹션으로 LLM 친화 출력
- **`build_select` 파서 신설** — `backend/domains/parser.py`. joins 부분집합 → `SELECT ... FROM A LEFT JOIN B ON ...` SQL 자동 재조립. alias / composite ON / CROSS JOIN / 체인 검증
- **위임 검증 가드** — 각 agent cold-start §1에 추가, 잘못 라우팅된 위임 자동 차단

## ✅ Phase 6.5에서 처리됨 (협업 인프라)

- **`HANDOFF.md` 정착** — supervisor 세션 cold start용 인수인계 프롬프트 (이전 `partitioned-marinating-cook.md` 정착)
- **`agent-prompts/` 디렉토리** — 5역할(BackEnd Infra / DB Domain Manager / Front/View / Claude Design / Debug) 표준 cold-start 프롬프트 + README
- **per-agent feature 브랜치 전략** — `agent/<role>` 명명, 세션 자율 분기, supervisor 머지 검수 게이트
- **Debug 정책 확정** — A+C 혼합. 옵션 1 블랙리스트 가드레일 (11종 트리거 + 안전장치 2개: 회귀 명세 필수 / 모호 시 자동 A 경유)
- **Claude Design 재주입 패키지 규격** — `design-export/` 고정 출력, `DELTA.md` + `SNAPSHOT.md` 매 사이클 자동 생성, 주입 전략 자동 판단 4종

## ✅ Phase 6에서 처리됨

- **프론트엔드 design/framework 분리** — UI primitives와 비즈니스 로직 분리
- **디자인 토큰 시스템** — OKLCH 컬러, density 변수, TweaksPanel
- **백엔드 tools 패키지화** — 각 도구별 description.md 분리
- **시스템 프롬프트 외부화** — `backend/prompts/system_base.md` (lru_cache)
- **LM Studio Harmony 마커 정규화** — `<|channel|>` → `<think>`
- **스트림 재연결** — `GET /api/stream_status/{key}`, `POST /api/cancel/{session_id}`
- **이슈 #2 (LM Studio fallback)** — 부분 해결 (Harmony 정규화 추가)

---

## 🎯 당장 해야 할 것 (Phase 6 후보)

우선순위는 사용자 논의로 결정 예정. 아래는 규모/가치 추정.

### A. 위젯 영속화 + 드래그 대시보드 빌더 (Track C 완성)
**현재 상태**: UIBuilderPage 1~2단계 스캐폴딩만 존재. Step 3 (위젯 저장) 미구현.

**필요 작업**:
- `react-grid-layout` 라이브러리 설치
- `Widget` 컴포넌트 — 차트 + 제목 + 삭제 버튼
- `WidgetCanvas` — 드래그/리사이즈 가능한 그리드
- `useWidgetStore` 훅 — localStorage에 위젯 저장
  ```typescript
  Widget = {
    id, title, sql, vizHint, xAxis, yAxis,
    position: {x, y, w, h},
    createdAt
  }
  ```
- 대시보드 다중 지원: 여러 대시보드 전환 UI
- 위젯 새로고침 (SQL 재실행)
- 위젯 Export/Import (JSON)

**예상 규모**: 중

---

### B. Domain UI (전통 CRUD 메뉴-페이지, Track A)
**현재 상태**: 미구현.

**필요 작업**:

**백엔드**:
- `GET /api/domain/{domain}/tables` — 도메인 테이블 목록 + 컬럼 메타
- `GET /api/domain/{domain}/table/{table}/rows?limit=50&offset=0&filter={col}={val}&sort={col}` — 페이징/필터/정렬
- `GET /api/domain/{domain}/table/{table}/related/{pk_value}` — joins 기반 연관 조회
- (향후) `POST/PUT/DELETE` — HITL 승인 필수

**프론트엔드**:
- `DomainExplorerPage.tsx` — 도메인 트리 (sidebar) + 테이블 그리드
- `TableBrowser.tsx` — @tanstack/react-table 기반 페이징/필터/정렬
- `RecordForm.tsx` — 단일 레코드 상세 뷰 (읽기 전용)
- `RelatedRecords.tsx` — `joins` 정의 기반 1-N/N-1 렌더링
- `AppShell` 메뉴 추가: "도메인 탐색"

**예상 규모**: 중~대 (쿼리 빌더 수준 가느냐에 따라)

---

### C. 데이터 조작 + HITL 재도입 (Phase 3에서 제거했던 것)
**현재 상태**: `db_query`, `sp_call` 모두 읽기 전용. `_assert_read_only` regex 차단.

**필요 작업**:

**백엔드**:
- `db_write` 도구 신규 추가 — INSERT/UPDATE/DELETE 허용
- `tools/base.py`에 `requires_approval` 속성 재도입
- `agent/events.py`에 `ApprovalRequestEvent` 재추가
- `agent/loop.py`에서 `requires_approval=True` 도구 호출 시 approval_callback 대기
- `main.py`:
  - `_approvals` dict + `asyncio.Event` 재도입
  - `POST /api/approve/{stream_key}` 엔드포인트
- **영향 범위 미리 확인**: UPDATE/DELETE 쿼리에서 `WHERE`절이 없으면 거부, 있으면 `SELECT COUNT(*) WHERE ...`로 영향 행 수 미리 계산

**프론트엔드**:
- `ApprovalPrompt.tsx` 재작성 — 영향 행 수 표시
- `useAgentStream`에 `pendingApproval`, `respondToApproval` 재추가
- SQL 실행 전 "3행이 수정됩니다. 승인하시겠습니까?" 모달

**예상 규모**: 중 (과거에 구현한 이력 있음, 복원 수준)

---

### D. 에이전트 챗봇 개선
**현재 상태**: 대화 관리 완료. 명시적 도구 선택 UI / 대화 분기 없음.

**필요 작업**:
- 도구 힌트 버튼 — ChatInput 위에 "테이블 조회" / "SP 실행" / "스키마 탐색" 칩
- 대화 분기(branching) — 특정 메시지에서 가지치기
- 대화 제목 LLM 자동 생성 (현재는 첫 질문 40자 slice)
- 대화 폴더 분류
- 대화 공유 링크 (백엔드 영속화 필요)

**예상 규모**: 소~중 (개별 기능별로 쪼갤 수 있음)

---

### E. 도메인 레지스트리 확장
**현재 상태**: `groupware/` 폴더 형식만 등록 (Phase 7 적용).

**필요 작업**:
- MES 도메인 폴더 추가 (`production/` 등 — 처음부터 신규 폴더 형식으로 작성)
- 스킬 `LosszeroDB_3Z_MES`의 meta.py로 테이블/컬럼 조회 → meta/tables/joins/stored_procedures.json 수동 작성
- SP 목록 화이트리스트 등록 (LLM_* 계열 등)
- 여러 도메인 테스트 (키워드 충돌, 도메인 간 조인 등)

**예상 규모**: 소 (작업량은 데이터 조사에 따라 다름)

---

## 🐛 알려진 이슈 / 개선 필요사항

### 1. ResultsBoard 컴포넌트 미사용
- 현재 `ResultsBoard.tsx`는 존재하지만 App에서 사용 안 함
- Phase 4에서 AgentChatPage에서 제거 (좌우분할 제거 시)
- **결정 필요**: 삭제할지 UI Builder Step 3에서 재활용할지

### 2. backend/llm/lm_studio.py의 fallback
- HTTP 400 시 `<execute_sql>` 태그 추출로 fallback
- 실제 사용성 검증 부족 (LM Studio에서 tool_use 미지원 모델 테스트 필요)

### 3. 대화 히스토리 크기 제한
- MAX_CONVERSATION_HISTORY=20 (메시지 수)
- 토큰 단위가 아니라 **메시지 수 기준** — 긴 대화에서 컨텍스트 초과 가능성
- 개선: 토큰 카운트 기반 트리밍 (tiktoken 등)

### 4. domain matching 정확도
- 현재: 키워드 단순 포함 검사
- 여러 도메인이 비슷한 키워드 공유 시 혼란 가능
- 개선: 임베딩 기반 의미 매칭 (선택)

### 5. 에이전트 사이드바가 도메인 선택 화면에서 숨김
- 현재 구조: 도메인 카드 화면 → 선택 시 사이드바 포함 화면
- 개선: 상시 사이드바 표시 (도메인 선택도 사이드바 내부에서)

### 6. DataQueryPage에 도메인 컨텍스트 없음
- `/api/sql`은 LLM을 사용 안 하므로 도메인 정보가 표시되지 않음
- 사용자가 어떤 테이블이 있는지 모르면 SQL 못 씀
- 개선: 사이드에 도메인별 테이블 목록 패널 추가

---

## 📦 기술 부채

### 백엔드
- `requirements.txt` 없음 (uv만 사용) — Docker 빌드 시 호환성 확인 필요
- `__pycache__/` 일부 git history에 남아있음 (`.gitignore` 추가됨)
- 세션 저장소가 모두 메모리 → 재시작 시 손실
  - 옵션: SQLite / Redis / PostgreSQL로 영속화

### 프론트엔드
- `@tanstack/react-table` 설치됐지만 미사용 (Phase 4에서 제거)
- `ResultsBoard.tsx` 사용처 없음 (6번 이슈와 연관)
- TypeScript strict 모드지만 `as` 캐스팅 일부 존재
- 에러 바운더리 없음 → 런타임 에러 시 앱 전체 crash 가능

### 문서
- DESIGN.md, DESIGN-phase*.md 는 Phase 1~3 시절 문서 — 현재와 불일치 가능
- **결정 필요**: 삭제 or 참고용으로 "legacy" 표기

---

## 🔧 인프라 / 배포

### 현재
- Docker 파일 제거됨 (Phase 2 locallm_launch 커밋)
- 로컬 직접 실행만 가능
- 프로덕션 배포 고려 없음

### 다음 단계 후보
- FastAPI를 Gunicorn/Uvicorn worker로 배포
- 프론트엔드 `pnpm build` → 정적 호스팅 (nginx)
- 환경변수 시크릿 관리 (현재는 `.env`)
- LM Studio는 원격 접속 불가 (로컬 머신 전용) — 배포 시 Claude로 전환

---

## 📚 문서화 TODO

- API 자동 문서 (FastAPI `/docs` 있지만 SSE 이벤트 구조는 별도 설명 필요)
- 프론트엔드 컴포넌트 카탈로그 (Storybook 등)
- 새 도메인 JSON 작성 가이드 (실제 예시 + 스킬 활용법)
- 트러블슈팅 가이드 (ODBC 드라이버 오류, 인코딩, CORS 등)

---

## 🎬 다음 세션 시작 가이드

1. **이 프로젝트를 처음 보는 Claude에게**:
   - `SPEC.md` — 시스템 전체 명세 (현재 상태)
   - `ARCHITECTURE.md` — 데이터 흐름 상세
   - `ROADMAP.md` (이 문서) — 미이행 작업

2. **git log**로 최근 구현 확인:
   ```bash
   git log --oneline -15
   ```

3. **실행 확인**:
   ```bash
   # 백엔드
   cd backend && uv run python main.py

   # 프론트엔드
   cd frontend && pnpm dev
   ```

4. **현재 동작 확인**:
   - 대시보드 → 도메인 수 표시되는지
   - 데이터 조회 → 직접 SQL 실행 가능한지
   - 에이전트 챗봇 → 그룹웨어 도메인 선택 → 대화 저장/복원 확인
   - UI 빌더 → 자연어 → SQL 생성 → 차트 제안 확인

5. **사용자에게 확인**:
   - 어떤 트랙을 우선으로 진행할지 (A/B/C/D/E)
   - 알려진 이슈 중 먼저 해결할 게 있는지
   - 새 도메인 추가 필요한지

---

## 📌 커밋 이력 스냅샷 (2026-04-17 기준)

```
[Phase 6 후속 커밋들 — 아래 분할 커밋 참조]
52763db Update SPEC.md + ROADMAP.md for Phase 5 handoff
4a083e8 Phase 5: Conversation management + UI Builder scaffold
79e7e21 Add /api/sql direct endpoint, remove LLM from DataQuery
493fbf4 Separate DataQuery (direct SQL) from AgentChat (conversation)
5440a90 Update docs + fix tab session persistence
5189ebc chore: __pycache__ git 추적 제거 및 .gitignore 정리
82e2393 fix: 스트리밍 중 유저 스크롤 방해 문제 수정
0749070 Unify domain registry to schema_registry/domains/*.json
28d980c Add modular dashboard shell with sidebar navigation
8041383 Add dashboard layout with results history
9998fe8 Add visualization guidance to system prompts
b96c6af Add continue_prompt HITL for max_turns extension
4684a18 Split domain registry + fix intermediate result bug
... (이전)
```
