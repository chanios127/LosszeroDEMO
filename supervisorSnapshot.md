# Supervisor Snapshot

> 최종 갱신: 2026-04-30 (Cycle 2 Phase B 머지)
> 본 파일은 supervisor 세션 cold-start 시 최우선 정독 대상. **결정 박제소** + active operational context. 코드 변경 0.
> 압축 정책: 완료된 phase / commit log는 ROADMAP `§"✅ Phase X 처리됨"` + git log가 진실 소스. 본 snapshot은 결정 + 잠금 + 진행 중 사이클만.
> 진행 중 사이클이 종료되면 후속 supervisor가 본 snapshot의 active 섹션을 historical로 강등 + 압축.
> 본 snapshot 이전 본문 (§1~§17 전체) = `git show 943ab23:supervisorSnapshot.md`. 추가 압축 직전 본문 = `git show 3c3a1e1:supervisorSnapshot.md`.

---

## 1. 현재 상태 한 줄

main HEAD `d5939a9` (Phase B merge). origin 동기화. **Cycle 2 Phase A+B 머지 완료** (A=`3f3b6b0` design/+types / B=`53eafe9`+merge `d5939a9` backend+events.ts mirror). 진입 plan: `plans/CYCLE2-design-integration.md`. 다음 액션 = Phase C 위임 (Front/View) — ReportArchivePage + useReportArchive + useReportProposal + AgentChatPage wiring + App.tsx 라우팅.

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
| **A. supervisor 직접 (design/)** | 병렬 세션 처리 | ✅ 머지 완료 (`3f3b6b0`) |
| **B. BackEnd Infra 위임** — Pydantic 미러 + build_schema/system.md + rules + build_view 매핑 + report_generate sub_agent + storage + /api/reports + report_proposed SSE | `agent/backend-infra` | ✅ 머지 완료 (`53eafe9` + merge `d5939a9`). frontend `events.ts` 미러 atomic sync 포함 |
| **C. Front/View 위임** — ReportArchivePage + useReportArchive + useReportProposal + AgentChatPage wiring + App.tsx 라우팅 | 별도 세션 | 다음 액션 — 위임 명세 출력 후 Front/View cold-start |

### Phase A 정합 점검 결과 박제

- plan 10건 정확 실행 + extras 3건 (`_atoms.tsx` shared helpers / `view.ts` ViewBlockComponent enum / `VizPanel.tsx` VIZ_MAP exhaustiveness for new VizHint)
- `bubble_breakdown.bubble.{size,x,color}` = data_ref 컬럼명 string (LLM 추론 부담 ↓)
- `kpi_grid.metrics: KpiMetric[]` 인라인 (data_ref 미사용)
- `ranked_list / bubble_breakdown / chart-gantt / chart-radar` = block + dataRef props
- `ReportProposalCard` = props-only (SSE/POST wiring은 Phase C)
- `VIZ_MAP[gantt|radar]` = ChartBarViz fallback (실 라우팅은 ReportContainer, entry는 `Record<VizHint,_>` exhaustiveness용)
- 신블록 5종 = main에 dead-code (LLM이 신블록 emit 안 하므로 실 영향 0). Phase B가 ReportSchema 신 union을 emit + Phase C가 ReportArchivePage wiring하면 활성화.

### Phase B 정합 점검 결과 박제 (2026-04-30, merge `d5939a9`)

- plan 8건 정확 실행. tsc + `from main import app` + `load_all_tool_skills()` 6 tools(`build_schema/build_view/db_query/list_tables/report_generate/sp_call`) + AgentEvent 10 variants(`+ReportProposedEvent`) + `/api/reports*` 5 routes + Report storage round-trip OK
- `report_proposed` emission = `main.py::_run`에서 capture-emit 패턴 (TOOL_START에 input 캡처 → 다음 TOOL_RESULT(report_generate, no error)에서 ReportProposedEvent 합성·append). agent/loop.py 무변경 (잠금 단위 보호)
- `_REPORT_SCHEMA_VERSION = "2"` 모듈 상수로 main.py에 정의 (cycle 5 export 작업과 함께 분리 정리 검토)
- TTL 처리 = `_purge_stale_proposals` access-time check (10분, confirm/proposal endpoint 진입 직후 호출). 데모 스케일 충분, Phase 12 SQLite 마이그레이션 시 cron 컬럼 + sweep
- Storage 경로 = `<repo_root>/storage/reports/<id>.json` (env override `REPORTS_DATA_DIR`). 본 머지에서 `.gitignore`에 `storage/reports/*.json` 추가
- `ReportProposedEvent.schema` Pydantic field name = `schema_` (Pydantic reserved 회피), SSE 직렬화 `model_dump(by_alias=True)` (event_generator 전체 적용 — 기존 이벤트 무영향)
- `report_generate` 호출 트리거 = SKILL.md/system.md에서 "보존/저장" 의도(저장해/보관해/만들어 저장 등) 한정. 단순 분석은 build_schema→build_view→final로 종료. 라이브 검수 후 phrase 미세조정 가능
- frontend `events.ts` 미러 atomic sync (ReportProposedMeta + ReportProposedEvent + AgentEvent union 등재) — agent territory 위반 아님 (위임 §4 명시)
- Phase B 미완 → Phase C 의존: ProposalCard wiring (useReportProposal hook + AgentChatPage inline render + /api/reports 호출). 본 Phase B는 contract만 완성

---

## 4. 직전 사이클 박제 (2026-04-30)

본 sect는 **결정 박제소**. commit 단위 변경 내역은 `git log --oneline 4dc8d9e..3f3b6b0` 회수.

### Cycle 1 — `build_report` → `build_schema` 리네임
범위: backend rename + frontend mechanical sync + docs sync. 4 commits (`4dc8d9e..2c1c15d`).

- 명칭 정확화 — sub_agent의 실제 역할은 ReportSchema 생성 (view 전처리). `report_generate` 신설 예정 (Cycle 2 Phase B).
- 보존: `ReportSchema` 자료구조명 + `build_view` 명칭 + historical 박제 (`supervisorSnapshot/error-case/plans/* / debugHotfixerSnapshot / reports/error-analysis`).
- 미갱신: `BUILD_REPORT_MAX_*` 환경변수명 — 별도 정리 사이클 후보 (Phase 12 묶음).

### UI 폴리시 7 hotfix
범위: 사용자 시각 회귀하면서 발견한 디자인/UX 폴리시. 7 commits (`ece5965..3d71549`).

- **자율 hotfix push 권한 발효** — 메모리 [feedback_autonomous_hotfix.md](file:///C:/Users/chanios127/.claude/projects/C--ParkwooDevProjects-LosszeroDEMO/memory/feedback_autonomous_hotfix.md). 작은 수정(파일 1~3 / +50줄 미만 / 단일 관심사) → 즉시 commit+push+사후보고.

박제된 결정 + 한계:
- VizDebugInfo 제거 — 디버그 정보 일반 사용자 노출 X. **dead-but-harmless 잔존**: Tweaks `data-debug-viz` toggle + `.viz-debug` CSS class (별도 정리 사이클 후보).
- Executed SQL = 항상 visible 코드 블록 + Copy 버튼 (`tool_start.input.sql` turn+tool key map pairing).
- 대화 목록 자동 정렬 off — `useConversationStore.updateConversation` 순서 유지 + `ConversationList.filtered` sort 제거. 그룹화(today/yesterday/earlier)는 그대로.
- `useQuickPrompts` hook 신설 — `localStorage v1` + per-domain DEFAULTS. groupware 신 프리셋 3종. **CRUD UI는 별도 사이클** — 데이터 shape + 영속화는 ready.
- streaming indicator: `Dot(tone="brand")` 점등 (currently selected 대화만). **한계**: useAgentStream 단일 hook 구조라 멀티 백그라운드 stream 추적 불가 — SessionManager 리팩토링(Phase 12) 후속.
- CSS 보강: dark bg lightness +0.04 (4 tokens) / `.prose code` brand-cyan → text-strong / `.prose pre` 신규 / `.prose h1~h6` `--text-strong` 표준.

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

## 6. Phase 6.5 ~ 11 historical archive

본 sect는 **포인터 위주**. phase별 본문 + 결정 + 미완 항목은 ROADMAP `§"✅ Phase X 처리됨"`이 진실 소스. 본 snapshot 이전 본문은 `git show 943ab23:supervisorSnapshot.md` 회수 (§1~§17 전체).

| Phase | 키워드 | 본문 회수 |
|---|---|---|
| 6.5 | 협업 인프라 — HANDOFF + agent-prompts 5역할 + per-agent worktree + Debug A+C 가드레일 + Claude Design 재주입 규격 | ROADMAP `✅ Phase 6.5` |
| 7 | 도메인 폴더 + joins 1급화 + parser.build_select | ROADMAP `✅ Phase 7` |
| 8 | joins 스키마 압축 (4 키→2 키) + dbo prefix 자동 + groupware 22 joins | ROADMAP `✅ Phase 8` |
| 9 | Deep Agent Loop — sub-agent pipeline (build_schema + build_view) + ReportSchema/ViewBundle 잠금 + SSE subagent_* + _session_domains sticky (Fix 1) | ROADMAP `✅ Phase 9` + §2 Locks |
| 10 | SKILL Architecture — prompts/rules + sub-agent system.md 외부화(Step 1+2) + loader.py + SKILL.md 표준(Step 3). 새 도구 = 디렉토리 1개 | ROADMAP `✅ Phase 10` + §2 Locks |
| 11 | LLMProvider 가변화 — keyword-only options + claude max_retries=0 + lm_studio httpx.Timeout per-phase + /api/defaults + SSE heartbeat + TweaksPanel LLM 섹션 + F7 guard | ROADMAP `✅ Phase 11` + §2 Locks |

이전 supervisor 세션 §17 위임(SPEC/ARCHITECTURE/ROADMAP/agent-prompts 일괄 갱신) — `fe8fc05`/`b902817`/`6ea27d6`/`28de340`로 머지 완료, 미완 0.

---

## 7. 다음 세션 큐

### 즉시

- **Phase B 위임 명세 출력** — `plans/CYCLE2-design-integration.md` §"Phase B" 본문 → BackEnd Infra cold-start.
- **라이브 통합 회귀 (사용자 환경)** — 시나리오 "직원별 최근 업무 일지... 시각화" chain. 통과 시 error-case `D6/D5/D1/A6/F7` → 🟢 일괄 진입.

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

## 9. 본 snapshot 갱신 이력 + 후속 supervisor 압축 가이드

### 갱신 이력
- **2026-04-30 (1차)**: 820 → ~250줄. §1~§17(Phase 6.5~11 historical) → §6 1 섹션. §18~§20 + Phase A 보존. 본문 회수 = `git show 943ab23:supervisorSnapshot.md`.
- **2026-04-30 (2차)**: ~250 → ~190줄. §4(직전 사이클) commit log → 결정 박제로 추상화. §6(historical) → ROADMAP `✅ Phase X` 포인터 표로 응축. §3 Phase A 머지 반영. 본문 회수 = `git show 3c3a1e1:supervisorSnapshot.md`.

### 후속 supervisor 압축 가이드 (사용자 운영 정책)

진행 중 사이클이 종료되면 다음 supervisor 세션이 본 snapshot을 추가 보강:

1. **§3 진행 중 사이클 → §6 historical로 강등**: 결정 박제(잠금 갱신 / lock 만료 / 제약 후속) 추출하여 §2 Locks Registry에 흡수. phase 본문은 1줄로 응축, ROADMAP `✅ Phase X` 포인터로 위임.
2. **§4 직전 사이클 → §6 historical로 강등**: §6 표에 새 행 추가 + 결정 박제만 유지.
3. **§5 Cycle N 산출물 → 사이클 종료 시 삭제**: 산출물 인용은 `design-export/` (로컬) 또는 git에 박제됨. snapshot에 산출물 inventory 보존 가치 X.
4. **§7 다음 세션 큐 → 갱신**: 처리 완료 항목 제거 / 신규 항목 추가.
5. **§2 Locks Registry → 잠금 만료 검토**: 9.x 만료 / 10.x 만료 등 phase boundary에서 잠금 해제.

**원칙**: snapshot은 결정 박제소 + active operational context만. 완료된 phase / commit log / 산출물 inventory는 ROADMAP / git / `design-export/`가 진실 소스.

본 압축 직전 본문 = `git show <prev>:supervisorSnapshot.md` 회수 가능 (위 갱신 이력의 hash 인용).
