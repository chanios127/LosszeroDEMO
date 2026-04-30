# LLM Harness — 미이행 로드맵

> 최종 갱신: 2026-04-30 (Phase 11 + Phase 10 Step 3 종료 시점)

현재 SPEC.md에 정의된 기능은 Phase 11까지 완료. 이 문서는 **다음 세션에서 이어서 할 작업**을 정리합니다.

## ✅ Phase 12 prep — Cycle 1 (2026-04-30): `build_report` → `build_schema` 리네임

명칭 정확화 — 현 sub-agent의 실제 역할은 **ReportSchema 생성 (view 전처리)**. 별도 신설 예정 `report_generate` sub-agent가 "보고서 산출물 + 영속" 담당.

- backend (commit `4dc8d9e`): `tools/build_report/` → `tools/build_schema/` git mv, 클래스 / SKILL frontmatter / loop / main / system_base 등 14 파일 / +39 / -39
- frontend sync (commit `218ff67`): SSE event `event.tool === "build_schema"` 비교 + SubAgentProgress 한글 라벨 dict + 주석 3건
- 자료구조명 `ReportSchema` 그대로. `build_view` 그대로.
- 환경변수명 `BUILD_REPORT_MAX_CELL_CHARS` / `BUILD_REPORT_MAX_ROWS`는 미갱신 — 별도 사이클 후보 (Phase 12 정리 묶음).

## ✅ Phase 11에서 처리됨 (build_schema 안정화 + Provider 인터페이스 가변화)

**Backend (`7a45c17`)**:
- `LLMProvider.complete` keyword-only 옵션 확장 — `max_tokens` / `thinking_enabled` / `thinking_budget`. claude는 모델 capability 검사 + extended thinking 자동 첨부, lm_studio는 thinking_enabled=True 시 warning + 무시
- `claude max_retries=0` (A6) — SDK auto-retry storm 차단, agent loop가 backoff 결정
- `lm_studio httpx.Timeout` per-phase 환경변수화 — `LM_STUDIO_TIMEOUT_CONNECT=10`, `LM_STUDIO_TIMEOUT_READ=600` (reasoning 모델의 첫 토큰 지연 대비)
- AgentLoop sub-agent 옵션 propagate — 매 turn 시작 시 sub-agent tool 인스턴스에 `set_llm_options()` inject
- build_schema `_truncate_data_results` — `BUILD_REPORT_MAX_CELL_CHARS=200`, `BUILD_REPORT_MAX_ROWS=30` (C2)
- `/api/defaults` GET endpoint — provider-aware default + thinking_supported flag
- SSE `event_generator` 15s heartbeat — reverse proxy idle-close 방지 (G7), `LM_STUDIO_TIMEOUT_READ`과 짝

**Frontend (`4a529d1`)**:
- TweaksPanel "LLM" 섹션 — Slider primitive(framework) + Thinking Toggle + budget Slider, claude일 때만 thinking 컨트롤 활성화
- `useTweaks` 확장 + localStorage backward-compat (v1 key, spread default 자동 채움)
- `useServerDefaults` hook — startup에 `/api/defaults` fetch + tweaks hydration
- AssistantBubble F7 null guard — 정밀 조건 (content empty + tools 없음 + report 없음 + think 없음 + inline viz 없음 + trace 없음 + streaming 아님 동시)
- vite SSE-safe proxy — `timeout: 0, proxyTimeout: 0` (backend G7 heartbeat과 짝)

## ✅ Phase 10에서 처리됨 (SKILL Architecture)

**Step 1+2** (`8366824`/`ffababa`):
- `prompts/rules/` 신설 5개 — `korean-sql.md` / `result-size.md` / `error-recovery.md` / `report-block-types.md` / `json-output.md`. cross-cutting rule frontmatter (`applies_to: [system_prompt]`)
- db_query 한글 가드 fix (D7)
- sub-agent system prompt 외부화 — `tools/build_schema/system.md` / `tools/build_view/system.md`

**Step 3** (`f9c1e39`):
- `prompts/loader.py` — frontmatter parser (PyYAML 의존 회피, minimal regex) + `build_system_prompt()` (lru_cache, system_base + rules + tool addenda 합성) + `get_tool_description(name)` + `get_subagent_system(name)`
- 5 도구에 SKILL.md 표준 적용 — frontmatter (name / type / version / applies_to / required_rules / sub_agent_system?) + Description / Rules / Guards / Errors / Examples 섹션
- `Tool.description` ABC default — 자동으로 `loader.get_tool_description(self.name)` 호출, 도구별 override 불필요
- system_base.md 다이어트 — rules/로 이전된 3 섹션 제거
- description.md 5개 폐기

**구조적 효과**: error-case Theme 1·2·3·5 root 해소 (프롬프트 파편화 / sub-agent 인라인 / 가드 분리 / 미래 SubAgent debt). 새 도구 추가 = 디렉토리 1개 + SKILL.md 1개 + tool.py로 끝.

## ✅ Phase 9에서 처리됨 (Deep Agent Loop / Report Pipeline)

- 3-stage sub-agent pipeline — AgentLoop ⊃ db_query·list_tables·sp_call (SubAgent1) + `build_schema` (SubAgent2) + `build_view` (SubAgent3)
- LLM 자율 라우팅 — Claude/LM Studio가 데이터 수집 후 build_schema 호출 → ReportSchema (블록 구조) 생성 → build_view 호출 → ViewBundle 변환 → 인라인 ReportContainer 렌더
- SSE `subagent_start` / `subagent_progress` / `subagent_complete` 이벤트 + UI multi-stage progress (`SubAgentProgress` 컴포넌트 + 한글 stage 라벨)
- localStorage 메시지 메타데이터 영속화 — reportSchema + viewBundle을 메시지에 첨부, 페이지 reload 시 ReportContainer 재구성
- `_session_domains` sticky (Fix 1) — 첫 turn에서 매칭된 도메인을 session에 박제, 후속 turn에서 키워드 누락 시 fallback
- hotfix(`e2197d1`) — `<think>` 블록 strip (LM Studio reasoning 모델) + SubAgentProgress error UI

## ✅ Phase 8에서 처리됨 (joins 스키마 가독성 개선 + groupware 보강)

**스키마 단순화** (Phase 7 → Phase 8):
- 키 4개(`from_table`/`to_table`/`from_columns`/`to_columns`) → 키 2개(`tables`/`columns`)로 압축. 길이 2 외부 배열로 from/to 인덱스 표현.
- dbo 스키마 prefix 제거 (본 프로젝트는 dbo 고정 — 직렬화 시점에 자동 prepend).
- `name`은 camelCase 축약 + `<from>2<to>` 패턴. T**_ prefix 소거 후 첫 글자 lower (LZXP310T처럼 prefix 없는 마스터는 원형).

**groupware joins 보강** (20 → 22):
- `workBoard2taskPlan` — 현안 → 연결된 업무계획 (역방향 추가, parser 도달성 개선).
- `attendExceptT2attendExcept` — 임시 휴가/기안 ↔ 본 휴가/기안 매칭.

**백엔드 코드**:
- `backend/domains/parser.py:build_select()` — 신 스키마 키 (`j["tables"]`, `j["columns"]`) 사용. dbo 자동 prepend. 구 스키마는 KeyError로 거부.
- `backend/domains/loader.py:domain_to_context()` — top-level joins 직렬화 신 스키마 키 참조.
- self-test 7 cases (구 스키마 rejection 포함).

## ✅ Phase 7에서 처리됨 (도메인 레지스트리 폴더화 + join 1급화)

**도메인 데이터 구조 개편**:
- 도메인 폴더 형식 도입 — `groupware.json` → `groupware/{meta,tables,joins,stored_procedures}.json` 분리. 단일 `*.json` 형식은 하위호환 유지
- joins 1급 스키마 — 테이블 하위 `joins[*]` (target/on string) → top-level `joins[*]` 객체 (`from_table`/`to_table`/`from_columns`/`to_columns`/`operators`/`join_type`). composite key + `=`/`<>`/`>`/`<`/`>=`/`<=` 연산자 지원

**백엔드 코드**:
- `backend/domains/loader.py` — `_load_directory_domain()` 헬퍼 + `load_all_domains()` 디렉토리 순회. `domain_to_context()`가 top-level joins를 `### Join Relationships` 섹션으로 직렬화. `get_domains_summary()`에 `join_count` 추가
- `backend/domains/parser.py` 신설 — `build_select(joins, select_cols, use_alias)` joins 부분집합 → `SELECT ... FROM A LEFT JOIN B ON ...` SQL 자동 재조립. alias / composite ON / CROSS JOIN / 체인 검증

**협업 인프라 부산물**:
- 위임 검증 가드 — 각 agent cold-start §1에 추가. 잘못 라우팅된 위임을 작업 시작 전 차단·재확인하도록 강제. supervisor 측 HANDOFF 체크리스트도 동기화

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

## 🚦 P0 잔재 (별도 사이클 — Phase 12 또는 직전)

Phase 11 라이브 회귀 결과와 무관하게 우선 처리해야 할 안정성 항목.

- **B4 — AgentLoop circuit breaker**: 동일 에러 N회 연속 시 loop abort + LLM에 명시적 우회 메시지. claude `max_retries=0` (Phase 11)으로 SDK auto-retry는 차단됐지만 agent-level backoff는 별도.
- **C1 — db_query 코드-level 1000행 cap**: LLM 프롬프트만 의존하는 row cap을 backend에서 강제. 메모리/네트워크 폭주 안전망.
- **B1 / B2 / B3 — tool input validation + error wrapping**: build_schema/build_view 빈 dict 방어, AgentLoop의 tool error를 `{type}: {msg}` 표준 포맷으로 wrap (LLM 회복 단서 강화).
- **D2 — 영문 컬럼 환각 방어**: 도메인 schema 화이트리스트 검증으로 LLM이 존재하지 않는 컬럼명을 생성하는 것을 backend에서 reject (보강 C 후보).

## 🛠 Phase 12 후보 (사전 plan 박제됨 — `plans/PHASE12-main-split.md`)

- **`backend/main.py` 3-split** — 638줄 monolith → `app.py` (FastAPI 라우터) + `session.py` (SessionManager 객체화) + `orchestration.py` (AgentLoop 구동/스트리밍). 기능 추가 시 main.py 비대화 병목 해소.
- **LLM helper 추출** — build_schema / build_view tool.py에 산재한 fence/think strip + JSON parse + retry 로직 (~80줄 중복) → `backend/llm/helpers.py:call_llm_for_json()`. 다음 sub_agent (`comparison_agent` / `anomaly_detector` 등) 추가 직전에 우선 처리.

## 🧱 Phase 10 Step 4 (잔여)

- `backend/agents/` 디렉토리 + SubAgent 카탈로그 README. SKILL.md 표준 위에서 신규 sub_agent 추가 절차 박제.

## 🎯 다음 트랙 후보 (사용자 논의로 결정)

아래는 규모/가치 추정.

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

### F. HITL 게이트 재도입 (sub_agent 단위)
**현재 상태**: build_schema 출력 직후 검수 게이트 없음. Phase 9 sub-agent pipeline 완성 후 자연스러운 후보.

**필요 작업**:
- provider별 분기 (claude는 thinking 결과 + ReportSchema 미리보기, lm_studio는 ReportSchema만)
- `agent/events.py`에 `ApprovalRequestEvent` (Phase 3에서 제거된 것 재도입, sub_agent 단위로 범위 축소)
- `agent/loop.py` build_schema 직후 approval_callback 대기 → 사용자 승인 후 build_view로 진행
- 프론트 `ApprovalPrompt` 컴포넌트 + `useAgentStream` `pendingApproval` 재추가

**예상 규모**: 중 (Phase 3 구현 이력 있음)

---

### G. SubAgent 카탈로그 확장
**현재 상태**: build_schema / build_view 두 개. SKILL.md 표준 위에서 신규 추가 비용 1 디렉토리.

**후보**:
- `comparison_agent` — 두 데이터셋 차이 분석 + 차이 블록 생성
- `anomaly_detector` — 시계열 데이터 이상치 탐지 + KPI 카드
- `summary_agent` — 멀티-도메인 결과 요약

**선결**: Phase 12 LLM helper 추출 (build_schema/build_view 중복 80줄). 그래야 신규 sub_agent가 fence/think strip + JSON parse + retry 로직을 재구현하지 않음.

**예상 규모**: 소 per sub_agent (helper 추출 후)

---

### H. ReportSchema 점진 블록 확장
**현재 상태**: `narrative` / `data_table` 블록 위주. 풍부한 시각화 부족.

**후보 블록**:
- `comparison` — 두 데이터셋 좌우 비교 (지난주 vs 이번주 등)
- `kpi_grid` — 핵심 지표 카드 그리드
- `table` (rich) — 정렬/필터/하이라이트 컬럼
- `timeseries` — 시간축 라인 차트 + Brush

각 블록은 `prompts/rules/report-block-types.md`에 LLM 가이드 추가 + `tools/build_view`의 ViewBundle 변환 매핑 + 프론트 `framework/components/report/` 컴포넌트 추가가 짝.

**예상 규모**: 블록당 소~중

---

## 🧪 라이브 검증 대기 (사용자 환경)

Phase 11 close 시점 미수행. 통과 결과 받으면 `error-case.md` 갱신 + Phase 12 진입 결정.

- **Phase 11 통합 회귀** — TweaksPanel "LLM" 섹션 + max_tokens=12000 + thinking ON으로 본 회귀 시나리오 ("직원별 최근 업무 일지... 시각화") chain 끝까지. 통과 시 D6/D5/D1/A6/F7 → 🟢
- **AS현안 4턴 통합 회귀** — Phase 9 close 시점부터 미실행
- **F7 라이브 검증** — reasoning 모델 환경에서 빈 assistant bubble 미표시 확인

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
- 세션 저장소가 모두 메모리 (`_sessions` / `_conversations` / `_session_domains` / `_continue_*`) → 재시작 시 손실
  - 옵션: SQLite / Redis / PostgreSQL로 영속화. SessionManager 객체화 (Phase 12 main.py 3-split) 후가 cheap.
- 토큰 카운트 기반 히스토리 트리밍 — 현재 `MAX_CONVERSATION_HISTORY=20` 메시지 수 기준만 (긴 대화에서 컨텍스트 초과 가능)
- Sonnet 다운그레이드 정식 적용 — Phase 9.6 파일럿 평가 기반 결정 보류 중

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

> 이전 커밋 이력 스냅샷은 `git log`로 직접 확인 (장기 누적되어 ROADMAP에 박제할 가치가 낮음).
