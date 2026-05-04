# Supervisor Snapshot

> 최종 갱신: 2026-05-04 (Demo 종료 + Microskill 사이클 close)
> 본 파일은 supervisor 세션 cold-start 시 최우선 정독 대상. **결정 박제소** + active operational context. 코드 변경 0.
> 압축 정책: 완료된 phase / commit log는 ROADMAP `§"✅ Phase X 처리됨"` + git log가 진실 소스. snapshot은 결정 + 잠금 + 진행 중 사이클만.
> 이전 본문 회수: `git show 943ab23:supervisorSnapshot.md` (Phase 6.5~11 전체) / `git show 3c3a1e1:` (Cycle 2 진행 중) / `git show e51b664:` (Cycle 2 종료 직후).

---

## 1. 현재 상태 한 줄

main HEAD `2d6b0f2`. **Demo 종료** (PT 시연 완료). **Cycle 2 (Report Catalog Expansion + Archive) + Microskill 사이클 둘 다 close**. 다음 세션 진입 시 활성 사이클 X — Phase 12 / dead-code 정리 / B4·C1·B1~B3 P0 잔재 / Cycle 5 Export 중 사용자 우선순위 결정 후 진입.

---

## 2. Locks Registry — 현재 활성 잠금

| Scope | 위치 | 잠금 사유 | 만료 |
|---|---|---|---|
| `AgentEvent` union + `*Event` + `VizHint` (7종 — bar/line/pie/table/number/gantt/radar) | `frontend/src/design/types/events.ts` | backend SSE 미러 무결성 | 영구 |
| `ReportSchema` 본체 + 7 블록 union (markdown/metric/chart/highlight + bubble_breakdown/kpi_grid/ranked_list) + DataRef union | `frontend/src/design/types/report.ts` | 9.x 인터페이스 계약 (frontend ↔ backend pydantic mirror) | 9.x 종료 시 |
| `ViewBundle` / `ViewBlockSpec.component` 9종 | `frontend/src/design/types/view.ts` | 9.x 인터페이스 계약 | 9.x 종료 시 |
| `BuildSchemaTool` / `BuildViewTool` / `ReportGenerateTool` 인터페이스 | `backend/tools/{build_schema,build_view,report_generate}/` | 9.x 인터페이스 계약 | 9.x 종료 시 |
| `LLMProvider.complete` keyword-only signature (`max_tokens` / `thinking_*` / **`system_base`**) | `backend/llm/base.py` + lm_studio.py + claude.py | per-request tuning 계약 + microskill detector/enrich 의존 | 영구 |
| SKILL.md frontmatter 표준 (name/type/version/applies_to/required_rules/sub_agent_system) | `backend/tools/*/SKILL.md` + `prompts/loader.py` | Phase 10 Step 3 합성 흐름 | 영구 |
| `MicroskillBase` + `MicroskillResult` + dispatch contract | `backend/microskills/{base,registry}.py` | microskill 사이클 close 후 잠금 — 신 skill 추가는 본 ABC 따라 디렉토리 1개로 끝 | 영구 |
| `_run_microskill` 이벤트 시퀀스 (subagent_start/progress/complete + fake build_schema/build_view tool_result + report_proposed + final + history inject) | `backend/main.py::_run_microskill` | frontend useAgentStream 캡처 경로 의존 — 시퀀스 변경 시 inline ReportContainer 미렌더 위험 | 영구 |
| ReportProposalCard / ReportArchivePage / useReportProposal·useReportArchive 인터페이스 | `frontend/src/design/components/report/ReportProposalCard.tsx` + `frontend/src/framework/{pages,hooks}/Report*` | Cycle 2 Phase A/B/C close 후 frozen | 영구 (UX 보강은 보존) |

### 영역 권한 (영구 — agent-prompts에 박제됨)
- design/ ↔ framework/ 의존: framework → design import OK / design → framework import 금지 (TweaksPanel 1 예외)
- per-role: `backend/` (BackEnd Infra / DB Domain), `frontend/src/framework/` (Front/View), `frontend/src/design/` (Claude Design 또는 supervisor 직접)
- microskills: supervisor 직접 — base ABC 따라 신 skill 디렉토리 추가 + SP DDL 동봉 + whitelist 등록

### 잠금 정책
- 위임 명세에 잠금 단위 명시 ("X 파일 안의 Y symbol/section"). 파일 통째 잠금 회피.
- 충돌 시 우회 우선. 구조적 리팩터(events.ts 도메인 분리 등)는 미래 충돌 예방용.

---

## 3. 직전 사이클 박제 (2026-05-03 ~ 05-04)

### Microskill 사이클 (Demo 일정에 맞춘 결정론적 백본)

**진입 동기**: Cycle 2 라이브 회귀 중 LM Studio 경량 모델(D11 / D11-b / A5)로 chain 완주 불가. PT 일정 임박 + 운영 비용 ↓ + 시연 안정성 ↑ 위해 high-frequency intent 3종을 결정론적 SP 파이프라인으로 분리.

**구조** (`backend/microskills/`):
- `base.py` — `MicroskillBase` ABC + `MicroskillMatch` / `MicroskillResult` dataclass
- `registry.py` — register / dispatch + `_looks_like_followup()` heuristic (action verb 부재 + interrogative → AgentLoop fallback)
- `detector.py` — `llm_classify_and_extract()`: 단일 LLM 호출 (`system_base=False`)로 intent + entities (keywords/vendor) 추출
- `_helpers.py` — `call_sp` (multi-resultset cursor.nextset()) + `parse_target_date` / `parse_period` / `normalize_hhmm` + **`enrich_microskill_report()`**

**3 microskills**:
| skill | domain | 트리거 | LLM 호출 | SP |
|---|---|---|---|---|
| `attendance_gantt` | groupware | 출근/근태/간트/출퇴근 | 0 (룰만) | `sp_attendance_by_date(@date)` |
| `task_diary_report` | groupware | 업무일지/일지/업무보고 | 0~1 (preset 키워드 추출) | `sp_task_diary_summary(@start, @end, @keywords_csv)` 다중 |
| `customer_as_pattern` | groupware | AS/거래처/현안/패턴 | 0~1 (vendor + 키워드) | `sp_customer_as_pattern(@days, @vendor, @keywords_csv)` 다중 5 |

**SP DDL** — 각 skill 디렉토리에 `sp_*.sql` 동봉 (DROP+CREATE 자동, 사용자 환경 적용 완료). 도메인 메타 검증 후 v3 재작성:
- TGW_AttendList(at_AttDt/at_UserID/at_DeptCd/at_AttTm·at_LeavTm varchar(10))
- TCD_DeptCode(dc_DeptCd PK / dc_DeptNm1)
- LZXP310T(Uid PK / uName)
- TGW_TaskDailyLog(td_TDNo/td_myUid/td_writeDt/td_Title/td_Today varchar(8000))
- TGW_WorkBoard(wb_revNo+wb_WBNO PK / wb_curFg / wb_CustCD / wb_workTy 1~5 enum / wb_reqDt / wb_Title / wb_recvText)
- TCD_Customer(cu_custCd PK / cu_custNm)

**박제 결정 (12개)**:
1. **LLM 분류 우선 + 룰 fallback** — `_run` 진입 직후 `microskill_classify()` LLM 1회 → 빈 응답/JSON 미스 시 `microskill_dispatch()` 룰
2. **`_looks_like_followup()` 게이트** — LLM/룰 두 경로 모두 적용. action verb (만들어/작성/보고서/분석/시각화/간트/차트) 없고 interrogative (누구/언제/왜/인원은?/있어?) 또는 12자 이하 → AgentLoop로 위임
3. **`system_base=False` 옵션** — LLMProvider.complete()에 추가. 작은 모델 13k 시스템 프롬프트 컨텍스트 초과 / 400 회피. detector / enrich 둘 다 사용
4. **fake build_schema/build_view tool_result emit** — frontend `useAgentStream`의 Phase 9.5 캡처 경로 재활용 → microskill 결과도 inline ReportContainer 렌더 (변경 0 frontend)
5. **history inject** — `_conversations`에 final ack + `<microskill_data>` 태그 + 결과셋 sample(50행/data_ref) 인라인. follow-up 질의가 SP 재호출 0회로 답변
6. **enrich 단계** — `enrich_microskill_report()`: 풍성한 headline + 5~7 insights + 350단어 markdown 분석 narrative. `report_schema.summary` 갱신 + markdown 블록 append + `view_blocks`에 MarkdownBlock 매핑
7. **GanttBlock anchor 모드** — y가 단일 string일 때 (출근시각만) 부서별 row 1개 + 이름 chip 시간 분포 (시각 라벨 X, 충돌 시 다음 lane). y가 배열일 때 기존 span 모드
8. **GanttBlock parseT 보강** — DATETIME 영시간(`YYYY-MM-DD 00:00:00`) skip + HHMMSS 6자리 / HHMM 4자리 무콜론 인식
9. **TweaksPanel max_turns Slider** — `/api/defaults`에 max_turns 노출 + frontend Slider 1~50, body.max_turns로 per-request 전달
10. **DataTable** — 인라인 363px maxHeight + sticky thead, drilldown은 `fillHeight` prop으로 cap 해제 + cell wrap (`whiteSpace: pre-wrap`, `wordBreak`)
11. **Executed SQL** — `<details>` 토글 + 라이트 SQL formatter (정규식 기반 키워드 줄바꿈 + 들여쓰기) + Copy 버튼 (formatted 본문 클립보드)
12. **microskill domain 통일** — 사용자 환경 단일 도메인(groupware)에 3 skill 모두 등록. AS현안 = TGW_WorkBoard도 groupware의 `workboard` 그룹

**미완 / 후속**:
- `tool.uv.dev-dependencies` deprecation warning (chore commit 후보)
- `archive refresh 즉시 트리거` — AgentChatPage 보관 시 useReportArchive.refresh() 직접 호출 (현재는 탭 전환 시 refresh)
- VizDebugInfo dead toggle + `.viz-debug` CSS / BUILD_REPORT_MAX_* env var (Phase 12 묶음 정리 후보)
- ReportDemoPage.tsx + sample.json fixture 정리

### Cycle 2 (Phase A/B/C — Report Catalog Expansion + Archive) — close

A `3f3b6b0` (design/ types + 5 신블록 + ReportContainer + ReportProposalCard) / B merge `d5939a9` (Pydantic 미러 + report_generate sub_agent + storage + /api/reports + report_proposed SSE + frontend events.ts mirror) / C merge `f751cca` (ReportArchivePage + useReportArchive + useReportProposal + AgentChatPage HITL wiring) / docs+rename `e51b664` (AppShell `report-demo` → `report-archive`).

박제 결정 (요약 — 본문 회수 `git show e51b664:supervisorSnapshot.md`):
- 7 블록 카탈로그 land + dark/light severity 4 토큰 + 2 viz_hint 추가 (gantt/radar) + 5 신블록 컴포넌트 land
- HITL flow: report_proposed SSE → ProposalCard sticky bar → POST /api/reports/confirm/{id_temp} (보관) / DELETE /api/reports/proposal/{id_temp} (버리기)
- Storage: `<repo>/storage/reports/<id>.json` (env override `REPORTS_DATA_DIR`). `.gitignore` 등재. Phase 12에서 SQLite 마이그레이션
- ReportProposedEvent.schema_ alias trick (Pydantic reserved 회피) + SSE 직렬화 `model_dump(by_alias=True)`
- useReportProposal 별도 EventSource (useAgentStream 미통합)
- ReportArchivePage refresh = isVisible 탭 전환 트리거 (Phase 12 후 useReportArchive hook 공유 검토)

### Cycle 1 (build_report → build_schema 리네임) — close
4 commits `4dc8d9e..2c1c15d`. ReportSchema 자료구조명 + build_view 명칭 보존. BUILD_REPORT_MAX_* env var는 Phase 12 묶음 정리 후보로 잔재.

### UI 폴리시 7 hotfix (2026-04-30 자율 push)
`ece5965..3d71549`. VizDebugInfo 제거 / Executed SQL 토글 / 대화 목록 정렬 off / `useQuickPrompts` hook + groupware preset 3종 / streaming Dot indicator / dark bg lightness +0.04 / `.prose h1~h6` 표준.

---

## 4. PT Demo 종료 박제 (2026-05-04)

PT 시연 완료. 골드 시드 5건 + microskill 3종 + Cycle 2 ProposalCard / ReportArchivePage 모두 라이브 검증 통과.

**시연 시퀀스 (실 사용)**:
1. `26년 4월 30일 출퇴근 현황을 알려줘` → microskill `attendance_gantt` → 부서별 출근 chip 분포 + KPI + ProposalCard
2. `오늘 가장 일찍 출근한 인원은?` → follow-up 게이트 → AgentLoop이 history 데이터에서 단답
3. (다른 시나리오 follow-ups)
4. ReportArchivePage 둘러보기

**라이브에서 발견 → fix 누적 (이번 세션)**:
- LM Studio detector 400 (system_base=False 옵션 추가로 해결)
- "오늘" 판단 정상 (rule fallback 통과)
- SP `dbo.TGW_Department` 미존재 → `LosszeroDB_GW` skill로 메타 검증 후 v3 재작성
- 데이터 매핑 결함 (LLM 환각으로 신블록 빈 시각화) → microskill 도입으로 영구 회피
- follow-up 재호출 → history inject로 0회 절감
- 보고서 요약 짧음 → enrich 단계 도입

**모델 한계 박제 (D11/D11-b/A5)**: LM Studio 경량 instruct (Gemma 4 e4b / phi-4-mini-reasoning / qwen2.5-7b)는 도구 호출 + JSON 출력 결함. **microskill 우회 + AgentLoop fallback으로 운영 안정**. 정식 chain 회귀는 Claude Sonnet API 필요 (Tier 2 권장 — Tier 1 = 30k ITPM은 chain 1회 ~130k input 필요).

**시드 5건 + 라이브 보관본**: `seed/reports/gold-*.json` (commit) + `storage/reports/*.json` (gitignore — 실 시연 보관본). 시연 직전 `python seed/load_reports.py --reset`으로 archive 초기화.

---

## 5. Phase 6.5 ~ 11 + Cycle 1 historical archive

| Phase | 키워드 | 본문 회수 |
|---|---|---|
| 6.5 | 협업 인프라 — HANDOFF + agent-prompts 5역할 + per-agent worktree + Debug 가드레일 + Claude Design 재주입 | ROADMAP `✅ Phase 6.5` |
| 7 | 도메인 폴더 + joins 1급화 + parser.build_select | ROADMAP `✅ Phase 7` |
| 8 | joins 스키마 압축 + dbo prefix 자동 + groupware 22 joins | ROADMAP `✅ Phase 8` |
| 9 | Deep Agent Loop — sub-agent pipeline + ReportSchema/ViewBundle 잠금 + SSE subagent_* + sticky domain | ROADMAP `✅ Phase 9` |
| 10 | SKILL Architecture — prompts/rules + sub-agent system.md 외부화 + loader.py + SKILL.md 표준 | ROADMAP `✅ Phase 10` |
| 11 | LLMProvider 가변화 — keyword-only options + claude max_retries=0 + lm_studio httpx.Timeout + /api/defaults + SSE heartbeat + TweaksPanel LLM 섹션 + F7 guard | ROADMAP `✅ Phase 11` |
| Cycle 1 | build_report → build_schema 리네임 | ROADMAP `✅ Cycle 1` (Cycle 2 Phase B에서 report_generate 신설) |
| Cycle 2 | Report Catalog (7 블록) + ProposalCard + Archive — Phase A/B/C | ROADMAP `✅ Cycle 2` |
| Microskill | 3 결정론적 skill + LLM enrich + history inject + follow-up 게이트 | ROADMAP `✅ Microskill` |

---

## 6. 다음 세션 큐

### 활성 사이클 X — 사용자 우선순위 결정 필요

선택지 (사용자 결정 후 진입):

**A. dead-code 정리 사이클** (1 cycle, supervisor 직접 가능)
- ReportDemoPage.tsx + design/components/report/__fixtures__/sample.json 폐기 (App.tsx import 이미 제거)
- VizDebugInfo Tweaks `data-debug-viz` toggle + `.viz-debug` CSS class 제거
- BUILD_REPORT_MAX_* env var 명 갱신 (Cycle 1 잔재)
- `tool.uv.dev-dependencies` → `dependency-groups.dev` 이전
- 단일 commit으로 묶을 수 있음

**B. Phase 12 — main.py 3-split + LLM helper 추출** (BackEnd Infra 위임)
- plan: `plans/PHASE12-main-split.md` 박제됨
- main.py 638→ now ~900줄 (microskill 통합 후 추가). 분리 가치 ↑
- session.py / orchestration.py / app.py 분리 + `call_llm_for_json` helper
- microskill `_run_microskill` 도 orchestration.py로 이동 (현재 main.py 직접)

**C. P0 잔재** (별 cycle)
- B4 — AgentLoop circuit breaker (동일 에러 N회 abort)
- C1 — db_query 코드-level 1000행 cap
- B1·B2·B3 — tool input validation + error wrapping
- D2 — 영문 컬럼 환각 방어 (도메인 schema 화이트리스트)

**D. 운영 / 인프라 (장기)**
- 세션 영속화 (in-memory → SQLite/Redis)
- HITL 게이트 일반화 (sub_agent 단위)
- 도메인 추가 (3z MES production / 회계 / HR)
- 토큰 카운트 기반 history 트리밍 / 임베딩 도메인 매칭
- Cycle 5 — Export 기능 (Markdown / HTML / PDF / 공유 링크)
- Microskill 추가 카탈로그 (가능한 것: 휴가신청 추이 / 회의실 예약 분포 / 결재 대기 현황)

### archive refresh 즉시 트리거 (소형, 어디든 묶기 가능)
AgentChatPage가 archive 보관 시 `useReportArchive.refresh()` 직접 호출 — hook 공유 검토. UX 폴리시급.

---

## 7. /clear 체크리스트 (supervisor 측 helper)

cold-start 첫 진입 시:
1. HANDOFF.md 정독
2. 본 supervisorSnapshot.md §1~§3 (현 상태 + Locks + 직전 사이클)
3. ARCHITECTURE.md (전체 아키텍처)
4. ROADMAP.md `✅` 처리됨 라인 + 미완 항목
5. error-case.md 잔재 항목 (D11/A5는 운영 영구 잔재 — LM Studio 경량 모델 미지원)
6. git log --oneline -15

세션 종료 직전:
1. git status 클린
2. 핵심 결정 본 snapshot에 박제
3. 사용자 답변 대기 0
4. 진행 중 위임 의도 박제
5. 미해결 사용자 결정 0

---

## 8. 본 snapshot 갱신 이력

- **2026-04-30 (1차)**: 820 → ~250줄. Phase 6.5~11 historical → §6 1 섹션
- **2026-04-30 (2차)**: ~250 → ~190줄. 직전 사이클 commit log → 결정 박제
- **2026-04-30 (3차)**: Cycle 2 종료 + Phase C close 박제
- **2026-05-04 (4차)**: Demo 종료 + Microskill 사이클 close. §3 직전 사이클에 microskill 12 결정 박제. §4 Demo 박제 신설. §5 historical에 Cycle 2 + Microskill 추가. §6 다음 세션 큐 — 활성 사이클 없음, 4 옵션 (A/B/C/D) 사용자 결정 필요

### 후속 supervisor 압축 가이드 (변경 없음)

진행 중 사이클 종료 시 다음 supervisor 세션이:
1. §3 직전 사이클 → §5 historical로 강등 (결정만 §2 Locks로 흡수)
2. §4 Demo 박제 → 다음 demo 발생 시 갱신 또는 별도 분리
3. §6 다음 세션 큐 → 처리 완료 항목 제거 / 신규 추가

**원칙**: snapshot은 결정 박제소 + active context만. commit log / 산출물 inventory는 ROADMAP / git / `design-export/`가 진실 소스.
