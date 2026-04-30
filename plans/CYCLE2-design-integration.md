# Cycle 2 — Report Catalog Expansion + Archive 통합 plan

> 박제: 2026-04-30 supervisor 세션 종료 직전. Cycle 2 외부 Claude Design 산출물 회수 후 검수 완료, 통합은 다음 supervisor 세션 시작.

## 산출물 위치

- 외부 Claude Design 산출물 압축본 + 풀린 파일: `design-export/cycle2-output/losszerodemo-2/`
- 핵심 디렉토리: `design-export/cycle2-output/losszerodemo-2/project/`
- chat 로그: `design-export/cycle2-output/losszerodemo-2/chats/chat1.md`
- 진입 캔버스: `index.html` (정적 canvas 9 섹션) + `interactive.html` (working prototype)
- 신규 4 토큰: `tokens.css` line 66-71

## 분할 = Phase A / B / C

### Phase A — supervisor 직접 (design/ territory)

본 세션 주도 작업. 기존 design 잠금 단위(기존 4 블록 시그니처) 보호하며 신블록 5종 + 디스패치 + ProposalCard 추가.

**대상 파일**:

| # | 파일 | 변경 |
|---|---|---|
| 1 | `frontend/src/design/types/report.ts` | `ReportBlock` discriminated union에 `bubble_breakdown / kpi_grid / ranked_list` 3종 추가. 기존 4 시그니처 그대로. |
| 2 | `frontend/src/design/types/events.ts` | `VizHint` enum에 `"gantt" | "radar"` 2종 추가. (chart 블록 시그니처는 그대로 — viz_hint 값만 확장.) |
| 3 | `frontend/src/design/index.css` | `:root[data-theme="dark"]`와 `:root[data-theme="light"]` **각각**에 4 severity 토큰 (`--severity-good / -neutral / -warn / -alert`) 추가. (산출물의 light variant 그대로 + dark variant는 산출물 hue 유지하며 lightness 0.55→0.65 정도로 보정) |
| 4 | `frontend/src/design/components/report/BubbleBreakdownBlock.tsx` | 신규. `BubbleBreakdownBlock.jsx` 산출물 본문 포팅 + props interface 명시. data는 `data_ref` 인덱스 receive. |
| 5 | `frontend/src/design/components/report/KpiGridBlock.tsx` | 신규. KpiGridBlock.jsx 포팅. severity enum과 `--severity-*` 토큰 짝. |
| 6 | `frontend/src/design/components/report/RankedListBlock.tsx` | 신규. RankedListBlock.jsx 포팅. data_ref 매핑 (현 mock은 hardcoded rows — 실 구현은 fields prop으로 컬럼 매핑 + dataRef 해석). |
| 7 | `frontend/src/design/components/report/GanttBlock.tsx` (또는 `ChartBlock.tsx` 분기 추가) | 신규 또는 기존 ChartBlock.tsx에 `viz_hint === "gantt"` 분기. mock은 SVG 직접 — 실 구현은 Recharts BarChart horizontal로 단일 segment per row. data shape `{label, color_group?, start, end}`. |
| 8 | `frontend/src/design/components/report/RadarBlock.tsx` (또는 `ChartBlock.tsx` 분기) | 신규 또는 분기. Recharts RadarChart with multi-series via group_by. |
| 9 | `frontend/src/design/components/report/ReportContainer.tsx` | `renderByType` + `renderByComponent` 양쪽에 신블록 3종(bubble_breakdown / kpi_grid / ranked_list) case 추가. ChartBlock 분기 신 viz_hint 처리. |
| 10 | `frontend/src/design/components/report/ReportProposalCard.tsx` | 신규. HITL 카드 — title preview / summary / [보관] / [수정 — 인라인 title/tags 편집] / [버리기]. Cycle 2 동안은 props만 수신 (실 SSE/POST는 Phase C/B에서 wiring). |

**verification**:
- `pnpm exec tsc --noEmit` 0 error
- 기존 4 블록 prop 시그니처 변경 0 (잠금 보호)
- ReportContainer dispatch 5 신 case 추가 검증 (TypeScript discriminated union이 누락 시 컴파일 에러)
- 토큰 변경 후 dashboard preview screenshot 1회 (severity 토큰은 Phase B/C 통합 후 시각 확인)

**커밋 분할 권장** (atomic feature지만 logical unit):
- A1: types + index.css severity tokens
- A2: 5 신블록 .tsx
- A3: ReportContainer dispatch + ReportProposalCard

또는 단일 commit `feat(design): report catalog expansion — 5 new blocks + viz_hints + severity tokens + HITL card` 도 OK (~600줄).

### Phase B — BackEnd Infra 위임

**의존**: Phase A 머지 완료 (TypeScript interface가 ready여야 Pydantic이 1:1 미러).

**위임 명세 작성 시 본 plan 인용**.

**대상 파일**:

| # | 파일 | 변경 |
|---|---|---|
| 1 | `backend/tools/build_schema/schema.py` | 신블록 3종 Pydantic 추가 — `BubbleBreakdownBlock` / `KpiGridBlock` / `RankedListBlock`. `ReportBlock = Annotated[Union[..., BubbleBreakdownBlock, KpiGridBlock, RankedListBlock], Field(discriminator="type")]`. data_ref index validator 신블록도 적용. |
| 2 | `backend/tools/build_schema/system.md` | 블록 카탈로그 enum 갱신 (8종 — 기존 4 + 신규 3 + chart는 viz_hint 7종으로 확장). 시나리오 1·2 LLM 가이드 작성 (산출물의 Scenario1/2Report.jsx 본문 참조). 블록 선정 가이드 (HANDOFF-context.md §3.3 1~2줄 가이드 박제). |
| 3 | `backend/prompts/rules/report-block-types.md` | 카탈로그 갱신. |
| 4 | `backend/agent/events.py` | `report_proposed` SSE 이벤트 신설 — `{id_temp, meta, schema, summary}`. Pydantic + AgentEvent union 추가. |
| 5 | `backend/main.py` | `/api/reports` CRUD (GET list / GET {id} / DELETE {id}) + `/api/reports/confirm/{id_temp}` HITL endpoint (asyncio.Event 기반, continue_prompt 미러). 세션 저장소에 `_report_proposals: dict[id_temp -> Report]` 추가 (10분 TTL). |
| 6 | `backend/storage/reports/` (신규 디렉토리) + `backend/storage/__init__.py` | JSON 파일 영속화. `save_report(report) / list_reports() / get_report(id) / delete_report(id)`. Phase 12에서 SQLite 마이그레이션 cheap. |
| 7 | `backend/tools/report_generate/` (신규 디렉토리) | sub_agent. tool.py + SKILL.md (frontmatter `type: sub_agent` + `sub_agent_system: ./system.md`) + system.md (LLM 가이드 — 사용자 의도 "보고서 만들어줘" / "저장해" 감지 시 호출, ReportSchema input + ReportMeta 출력) + Report Pydantic 모델. |
| 8 | `backend/tools/build_view/tool.py` | ViewBundle 매핑 분기 — 신블록 3종 component name 추가 (BubbleBreakdownBlock / KpiGridBlock / RankedListBlock). 기존 4 블록은 그대로. |

**verification**: `from main import app` import OK + load_all_tool_skills() 6 도구 (build_schema/build_view/db_query/list_tables/sp_call/report_generate) + Pydantic schema_dump 합본이 frontend interface와 1:1 미러 + /api/reports 라우터 등록 + SSE event union에 report_proposed 등재.

### Phase C — Front/View 위임

**의존**: Phase B 머지 완료 (`/api/reports` + `report_proposed` SSE 이벤트가 ready).

**대상 파일**:

| # | 파일 | 변경 |
|---|---|---|
| 1 | `frontend/src/framework/pages/ReportArchivePage.tsx` (신규, 현 ReportDemoPage 자리) | 산출물의 ArchivePage.jsx + InteractiveArchive.jsx 본문 포팅 — 사이드바(검색 + 필터 + 그룹화) + 상세(ReportContainer 재사용). 좌측 탭 진입은 그대로. |
| 2 | `frontend/src/framework/hooks/useReportArchive.ts` | 신규. `/api/reports` GET list + GET {id} + DELETE 를 fetch + cache + mutate. localStorage cache layer 선택 (네트워크 fail-soft). |
| 3 | `frontend/src/framework/hooks/useReportProposal.ts` | 신규. SSE `report_proposed` 이벤트 수신 → `proposal: Report \| null` state 관리. POST `/api/reports/confirm/{id_temp}` (보관) / DELETE `/api/reports/proposal/{id_temp}` (버리기). useAgentStream과 paired (현재 stream의 report_proposed 이벤트 listen). |
| 4 | `frontend/src/framework/pages/AgentChatPage.tsx` | useReportProposal hook 호출 + `<ReportProposalCard>` 인라인 ReportContainer 위/하단에 sticky 또는 inline 렌더 (디자인 산출물 위치 결정 인용). |
| 5 | `frontend/src/framework/App.tsx` | `ReportDemoPage` import → `ReportArchivePage` 변경. 라우팅 식별자만 갱신 (좌측 탭 위치 그대로). |
| 6 | (선택) `frontend/src/design/components/report/__fixtures__/sample.json` | 폐기 또는 demo seed로 보존. ReportArchivePage가 빈 상태 시 demo 표시 옵션은 후속. |

**verification**: pnpm exec tsc --noEmit + ReportArchivePage 라우팅 도착 + 빈 상태 / 1+ 보고서 / 검색 / 필터 / 삭제 / HITL 보관 흐름 1바퀴.

## 통합 회귀 (Phase A/B/C 모두 머지 후)

- 본 시나리오 1 ("오늘 직원별 출근 현황을 간트차트로 만들어줘"): build_schema가 신 viz_hint:gantt + ranked_list 자율 채택 + 인라인 ReportContainer 렌더 → 사용자 보관 결정 (HITL) → ReportArchivePage 갱신 확인
- 본 시나리오 2 ("거래처별 AS 요청 현안..."): bubble_breakdown + radar + ranked_list 채택 chain
- error-case D6/D5/D1/A6/F7 라이브 회귀 함께 (Phase 11 폴리시 + 리네임 + 본 사이클 모두 main 안착 시점)

## Cycle 5 — Export 기능 (별도 사이클)

본 plan 외. canonical=JSON 저장 후 derivative export (Markdown / HTML / PDF / 공유 링크) — 사이클 5에서 결정.

## 보류 / 후속

- `tabbed_section` 신블록 — Cycle 2에서 보류. 시나리오 1의 금일/금주/금월 토글은 별도 보고서 3개로 분리하는 대안이 단순. 토글 도입 결정은 Phase A/B/C 머지 + 라이브 평가 후.
- BUILD_REPORT_MAX_* env var 명 갱신 — 별도 사이클.
- VizDebugInfo dead Tweaks toggle / `.viz-debug` CSS 정리 — 별도 정리 사이클.

## 본 plan 갱신 이력

- 2026-04-30: 초안. supervisor 세션 종료 직전 박제. 다음 supervisor 세션이 cold-start 후 Phase A 진입.
