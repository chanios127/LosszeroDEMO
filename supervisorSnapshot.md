# Supervisor Snapshot

> 최종 갱신: 2026-04-30 (Cycle 2 Phase A 정합 통과 시점)
> 본 파일은 supervisor 세션 cold-start 시 최우선 정독 대상. 코드 변경 0인 운영 메타.
> Phase 6.5 ~ 11의 전체 박제 본문은 git `943ab23:supervisorSnapshot.md`에 영구 보존됨 — 필요 시 `git show 943ab23:supervisorSnapshot.md`로 회수.

---

## 1. 현재 상태 한 줄

main HEAD `943ab23`. 워킹트리: **Cycle 2 Phase A 미커밋** (병렬 supervisor 세션이 작업 후 검수 대기). origin 동기화. plans/CYCLE2-design-integration.md가 진입 plan.

---

## 2. Locks Registry — 현재 활성 잠금

위임 명세 작성 시 본 표 인용. 잠금 단위는 **파일 통째 X — section/symbol 명시**.

| Scope | 위치 | 잠금 사유 | 만료 |
|---|---|---|---|
| `AgentEvent` union + `*Event` 클래스 + `VizHint` (gantt/radar 확장 후 mainline) | `frontend/src/design/types/events.ts` | backend SSE 미러 무결성 | 영구 (backend SSE 변경 시 동기화) |
| `ReportSchema` 본체 + 기존 4 블록 시그니처 (markdown / metric / chart / highlight) + DataRef union | `frontend/src/design/types/report.ts` | 9.x 인터페이스 계약 (frontend ↔ backend pydantic mirror) — Phase A에서 **신규 3 블록 union 추가는 forward-compat additive로 잠금 정합** | 9.x 종료 시 |
| `ViewBundle` / `ViewBlockSpec` (component union 확장은 additive) | `frontend/src/design/types/view.ts` | 9.x 인터페이스 계약 | 9.x 종료 시 |
| `BuildSchemaTool` 인터페이스 (Cycle 1 rename 후) | `backend/tools/build_schema/{tool.py, schema.py}` | 9.x 인터페이스 계약 | 9.x 종료 시 |
| `BuildViewTool` 인터페이스 | `backend/tools/build_view/{tool.py, schema.py}` | 9.x 인터페이스 계약 | 9.x 종료 시 |
| design/components/report/* 기존 4 블록 props | `frontend/src/design/components/report/{MarkdownBlock,MetricCard,ChartBlock,HighlightCard}.tsx` | 9.x 동안 Front/View 한시 권한 (변경은 supervisor 합의). 신규 5 블록(.tsx)은 본 잠금 외 — Phase B Pydantic 미러 짝지을 때 프리즈. | 9.x 종료 시 |
| `LLMProvider.complete` keyword-only signature (`max_tokens`/`thinking_*`) | `backend/llm/base.py` | per-request tuning 계약 + 모든 provider 미러 의무 | 영구 |
| SKILL.md frontmatter 표준 (name/type/version/applies_to/required_rules/sub_agent_system) | `backend/tools/*/SKILL.md` + `prompts/loader.py` | Phase 10 Step 3 합성 흐름 안정성 | 영구 |

### 영역 권한 (영구 — agent-prompts에 박제됨)

- design/ ↔ framework/ 의존: framework → design import OK / design → framework import 금지 (TweaksPanel 1 예외)
- per-role: `backend/` (BackEnd Infra / DB Domain), `frontend/src/framework/` (Front/View), `frontend/src/design/` (Claude Design 또는 supervisor 직접)

### 잠금 정책

- 위임 명세에 잠금 단위 명시 ("X 파일 안의 Y symbol/section"). 파일 통째 잠금 회피.
- 충돌 시 우회 우선 (framework 측 EnrichedChatMessage 같은 확장) → 머지 가능. 구조적 리팩터(events.ts 도메인 분리)는 미래 충돌 예방용.

---

## 3. 진행 중 사이클 — Cycle 2 (Report Catalog Expansion + Archive)

진입 plan: [plans/CYCLE2-design-integration.md](plans/CYCLE2-design-integration.md). 외부 Claude Design 산출물: `design-export/cycle2-output/losszerodemo-2/` (.gitignore 로컬 전용).

| Phase | 위임 | 상태 |
|---|---|---|
| **A. supervisor 직접 (design/)** — types + 5 신블록 + ReportContainer 디스패치 + ReportProposalCard + severity 토큰 | 본 세션 | ✅ **정합 통과, 미커밋** (병렬 세션 작업, +600줄, 6 modified + 7 new) |
| **B. BackEnd Infra 위임** — Pydantic 미러 + system.md + rules + build_view 매핑 + report_generate sub_agent + storage + /api/reports + report_proposed SSE | 별도 세션 | 미시작 (A 머지 후 진입) |
| **C. Front/View 위임** — ReportArchivePage + useReportArchive + useReportProposal + App.tsx 라우팅 | 별도 세션 | 미시작 (B 머지 후 진입) |

### Phase A 정합 점검 결과 (2026-04-30)

병렬 세션이 plan 정확히 실행. tsc exit 0. plan 명시 10건 + sensible extras 3건 (`_atoms.tsx` shared helpers / `view.ts` ViewBlockComponent enum / `VizPanel.tsx` VIZ_MAP exhaustiveness for new VizHint).

박제할 결정:
- `bubble_breakdown.bubble.{size,x,color}` = data_ref 컬럼명 string (LLM 추론 부담 ↓)
- `kpi_grid.metrics: KpiMetric[]` 인라인 배열 (data_ref 미사용)
- `ranked_list` + `bubble_breakdown` + chart-with-gantt/radar는 block + dataRef props
- `ReportProposalCard`는 props-only — SSE/POST wiring은 Phase C
- VizPanel `VIZ_MAP[gantt]` / `VIZ_MAP[radar]` = ChartBarViz fallback (실 라우팅은 ReportContainer 레벨, entry는 type guard용)

### 다음 액션 (이 세션이 진입 가능)

1. Phase A commit + push (+600줄 atomic feature 단일 commit OK)
2. plans/CYCLE2-design-integration.md Phase A "✅ DONE" 박제
3. Phase B 위임 명세 출력 (사용자가 backend-infra 세션에 paste)

---

## 4. 직전 사이클 박제 (2026-04-30)

### Cycle 1 — `build_report` → `build_schema` 리네임 (4 commits + 머지)

명칭 정확화 — sub_agent의 실제 역할은 ReportSchema 생성 (view 전처리). `report_generate` 신설 예정 (Cycle 2 Phase B).

- `4dc8d9e` rename(tool) — agent/backend-infra: 14 파일 / +39 / -39. git mv + 클래스 + SKILL.md + main + loop + system_base + rules
- `c5c2f07` merge(cycle-1) — supervisor `--no-ff` 머지
- `218ff67` rename(frontend-sync) — useAgentStream `event.tool === "build_schema"` + SubAgentProgress 한글 라벨 키 + 주석 3건
- `2c1c15d` docs(rename-sync) — SPEC/ARCHITECTURE/ROADMAP/HANDOFF/agent-prompts 일괄 치환 + ROADMAP 상단 Cycle 1 close + SPEC §11 BUILD_REPORT_MAX_* 미갱신 인라인 주석

미갱신: `BUILD_REPORT_MAX_*` 환경변수명 (별도 사이클). historical 박제 (snapshot/error-case/plans/* 등) 미수정.

### UI 폴리시 7 hotfix — 자율 push 권한 발효

메모리 [feedback_autonomous_hotfix.md](file:///C:/Users/chanios127/.claude/projects/C--ParkwooDevProjects-LosszeroDEMO/memory/feedback_autonomous_hotfix.md). 작은 수정(파일 1~3 / +50줄 미만 / 단일 관심사) → 즉시 commit+push+사후보고.

- `ece5965` polish(design): dark bg lightness +0.04 (4 tokens) + `.prose code/pre` 보강
- `87592f1` polish(framework+design): 대화 목록 자동 정렬 off (useConversationStore 순서 유지 + ConversationList sort 제거)
- `cba0fc4` polish(design): db_query Executed SQL `<details>` 토글 (tool_start.input.sql turn+tool key map pairing)
- `f496fe0` polish(design): `.prose h1~h6` `--text-strong` 표준
- `6c7e9be` hotfix(design): VizDebugInfo 제거 + Executed SQL → 항상 visible 코드 블록 + Copy 버튼
- `74ab847` hotfix(framework): `useQuickPrompts` hook 신설 (localStorage v1 + per-domain DEFAULTS) + groupware 신 프리셋 3종
- `567c508` + `3d71549` hotfix(design+framework): ConversationList streaming `Dot(tone="brand")` 점등 (currently selected만 — 멀티 백그라운드는 SessionManager 리팩토링 후속)

박제된 결정:
- VizDebugInfo dead Tweaks toggle / `.viz-debug` CSS는 dead-but-harmless (별도 정리)
- streaming indicator는 currently selected 한정 (useAgentStream 단일 hook 한계)
- CRUD UI는 별도 사이클 — useQuickPrompts 데이터 shape ready

---

## 5. Cycle 2 디자인 산출물 (외부 Claude Design)

회수 시점 2026-04-30 19:14 KST. 압축본 `losszerodemo-2.tar.gz` (177KB → 29 파일).

| 영역 | 내용 |
|---|---|
| 토큰 | 신규 4 severity 토큰 (`--severity-good / -neutral / -warn / -alert`). light theme 기본이라 dark variant 동기화 (Phase A에서 처리됨) |
| 신블록 5종 mock | BubbleBreakdown / KpiGrid / RankedList / Gantt / Radar — 스크린샷 1·2 정합. Phase A에서 .tsx 포팅 완료 |
| Composition | Scenario1Report / Scenario2Report — LLM가이드용 system.md 시드 (Phase B에서 흡수) |
| Archive UX | ArchivePage(1280×820) + InteractiveArchive (working prototype) — Phase C에서 framework 포팅 |
| HITL | ReportProposalCard — Phase A에서 props-only 포팅, Phase C에서 SSE/POST wiring |
| Spec docs | SpecCard (props + LLM 가이드 + data_ref shape) — Phase B/C 위임 명세 작성 시 인용 |
| 보류 | tabbed_section (금일/금주/금월 토글) — 별도 보고서 분리가 단순 |

추가 보정 (Phase B/C로 이월): gantt/radar는 mock에서 SVG 직접 → 실 구현은 Recharts (BarChart horizontal / RadarChart). bubble_breakdown은 ScatterChart + circle radius mapping 가능.

---

## 6. Phase 6.5 ~ 11 historical archive (압축)

세부 본문은 `git show 943ab23:supervisorSnapshot.md` 회수. 핵심 결정만 인용.

### Phase 6.5 (2026-04-28) — 협업 인프라
HANDOFF.md / `agent-prompts/` 5역할 + per-agent feature 브랜치(`agent/<role>`) + Debug A+C 가드레일 + Claude Design 재주입 패키지 규격.

### Phase 7 (2026-04-29) — 도메인 폴더 + joins 1급화
`<name>/{meta,tables,joins,stored_procedures}.json` + top-level joins (composite + operators). `domains/parser.py:build_select()` SQL 자동 재조립.

### Phase 8 (2026-04-29) — joins 스키마 압축
키 4개 → 2개 (`tables`/`columns`). dbo prefix 자동 prepend. groupware 22 joins.

### Phase 9 (2026-04-29) — Deep Agent Loop / Report Pipeline
3-stage sub-agent (`build_schema`(원래 build_report) + `build_view`) + ReportSchema → ViewBundle → ReportContainer chain. SSE `subagent_*` 이벤트. `_session_domains` sticky (Fix 1). 메시지 메타데이터 localStorage 영속화. 본 phase에서 §8 lock 표 박제.

### Phase 10 (2026-04-30) — SKILL Architecture
- Step 1+2 (`8366824`/`ffababa`): `prompts/rules/` 5 신설 + sub-agent system.md 외부화 + db_query 한글 가드 fix
- Step 3 (`f9c1e39`): `prompts/loader.py` (frontmatter parser) + 5 도구 SKILL.md 표준 + `Tool.description` ABC default + system_base.md 다이어트
- 결과: error-case 구조적 테마 1·2·3·5 root 해소. 새 도구 추가 = 디렉토리 1개로 끝.

### Phase 11 (2026-04-30) — build_schema 안정화 + Provider 가변화
- Backend (`7a45c17`): `LLMProvider.complete` keyword-only (max_tokens/thinking_*) + claude `max_retries=0` + lm_studio `httpx.Timeout` per-phase + `_truncate_data_results` (BUILD_REPORT_MAX_CELL_CHARS=200, MAX_ROWS=30) + `/api/defaults` + SSE 15s heartbeat
- Frontend (`4a529d1`): TweaksPanel "LLM" 섹션 + Slider primitive + `useServerDefaults` + AssistantBubble F7 null guard + vite SSE-safe proxy

### 처리 완료 (이전 supervisor 세션 §17 위임 → 본 세션이 처리)
SPEC §1·§4·§6·§7·§10 갱신 + ARCHITECTURE 합성 흐름 + ROADMAP Phase 7~11 close + agent-prompts SKILL 표준 — 전부 fe8fc05/b902817/6ea27d6/28de340으로 머지. 더이상 미완 X.

---

## 7. 다음 세션 큐

### 즉시 (사용자 환경 의존)

- **라이브 통합 회귀** — Cycle 1 + 폴리시 7 + Phase A 모두 main 안착 후. 본 회귀 시나리오 ("직원별 최근 업무 일지... 시각화") chain. 통과 시 error-case D6/D5/D1/A6/F7 → 🟢 일괄 진입 가능
- **Phase A commit + push** (본 세션 가능)
- **Phase B 위임 명세 출력** (BackEnd Infra cold-start)

### 단기 (Cycle 2 종료 후 P0 잔재)

1. B4 — AgentLoop circuit breaker (동일 에러 N회 abort)
2. C1 — db_query 코드-level 1000행 cap
3. B1·B2·B3 — tool input validation + error wrapping
4. D2 — 영문 컬럼 환각 방어 (도메인 schema 화이트리스트)

### 중기 — Phase 12

- main.py 3-split + LLM helper 추출 ([plans/PHASE12-main-split.md](plans/PHASE12-main-split.md))
- Phase 10 Step 4 — `backend/agents/` + SubAgent 카탈로그
- BUILD_REPORT_MAX_* env var 명 갱신 (Cycle 1 잔재)
- VizDebugInfo dead Tweaks toggle / `.viz-debug` CSS 정리

### 장기 / 운영

- Cycle 5 — Export 기능 (Markdown / HTML / PDF / 공유 링크)
- 세션 영속화 (in-memory → SQLite/Redis)
- Sonnet 다운그레이드 정식 적용 (9.6 파일럿 평가 기반)
- 도메인 추가 (MES production)
- 토큰 카운트 기반 히스토리 트리밍 / 임베딩 도메인 매칭
- HITL 게이트 일반화 (sub_agent 단위)

---

## 8. /clear 체크리스트 (supervisor 측 helper)

cold-start 첫 진입 시:
1. HANDOFF.md 정독
2. 본 supervisorSnapshot.md §1~§3 정독 (현 상태 + Locks + 진행 중 사이클)
3. plans/CYCLE2-design-integration.md (현 진행 중)
4. git log --oneline -15
5. error-case.md 잔재 항목 확인

세션 종료 직전:
1. git status 클린 (커밋 + push 완료)
2. 핵심 결정사항 본 snapshot §1~§3 또는 plans/에 박제
3. 사용자 답변 대기 0
4. 진행 중 위임 의도 박제
5. 미해결 사용자 결정사항 0

통과 못 하면 clear 자제, 컨텍스트 한도까지 사용. 본 체크리스트는 사이클 자연 종료 시점 기준.

---

## 9. 본 snapshot 갱신 이력

- **2026-04-30**: 압축 (820 → ~250줄). Phase 6.5~11 historical 1 섹션으로 응축. §17 위임 처리완료 1줄. §18~§20 + Phase A complete 보존. 원본 본문은 git `943ab23:supervisorSnapshot.md`에 영구.
