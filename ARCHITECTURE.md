# LLM Harness — Architecture

> 최종 갱신: 2026-05-04 (Cycle 2 + Microskill close)

## 개요

MSSQL ERP/MES/그룹웨어 데이터를 자연어로 조회하고 디자인된 보고서로 응답하는 에이전트 시스템.
Claude/LM Studio를 LLM으로, 도메인 레지스트리로 스키마를 관리한다.

**철학 — 4 Pillars**:
1. **자연어 → 의사결정 가능한 보고서** — SQL/BI 격차 해소. 8 블록 카탈로그(KPI · Gantt · Bubble · Radar · Ranked · Markdown · Metric · Highlight)로 의도 자동 매핑.
2. **Sub-agent chain + HITL** — `db_query → build_schema → build_view → report_generate`. 환각을 ProposalCard 보관 게이트에서 차단.
3. **도메인 격리 + 디자인 잠금** — schema_registry JSON 다중 도메인 + OKLCH 토큰 + severity 4단계 + dark/light.
4. **Provider Agnostic + Deterministic Microskills** — Claude / LM Studio 양쪽 + per-request 옵션 (max_tokens / thinking / max_turns / system_base). High-frequency intent 3종은 결정론적 SP 파이프라인(microskill)으로 LLM 비용/지연 ↓ + 시연 안정성 ↑.

---

## 파일 구조

```
LosszeroDEMO/
├── backend/
│   ├── main.py
│   ├── pyproject.toml
│   ├── prompts/
│   │   ├── system_base.md               # core (anti-hallucination / 응답 언어 / name resolution / 시각화 / report pipeline)
│   │   ├── loader.py                    # SKILL/rules loader + frontmatter parser (Phase 10 Step 3)
│   │   └── rules/                       # cross-cutting rule (applies_to: [system_prompt])
│   ├── agent/
│   │   ├── loop.py                      # AgentLoop (ReAct, 10턴 + continue, sub-agent 옵션 전파)
│   │   └── events.py                    # SSE 이벤트 타입 9종 (subagent_* 포함)
│   ├── llm/
│   │   ├── base.py                      # LLMProvider ABC (max_tokens / thinking_*) + load_base_system_prompt()
│   │   ├── __init__.py                  # Provider 팩토리
│   │   ├── claude.py                    # Anthropic 스트리밍 (max_retries=0)
│   │   └── lm_studio.py                 # OpenAI 호환 + Harmony 정규화 + httpx.Timeout per-phase
│   ├── tools/                           # 각 도구는 패키지 (tool.py + SKILL.md, sub_agent는 + system.md)
│   │   ├── base.py                      # Tool ABC (description = loader.get_tool_description default)
│   │   ├── db_query/
│   │   ├── list_tables/
│   │   ├── sp_call/
│   │   ├── build_schema/                # sub_agent: data_results → ReportSchema (Cycle 1 rename, build_report → build_schema)
│   │   ├── build_view/                  # sub_agent: ReportSchema → ViewBundle (component routing)
│   │   └── report_generate/             # sub_agent: ReportSchema → meta(title/summary/domain/tags) + report_proposed SSE
│   ├── microskills/                     # Cycle 2 후속 — 결정론적 백본 (LLM 분류만 + SP + 고정 템플릿)
│   │   ├── base.py                      # MicroskillBase ABC + MicroskillResult dataclass
│   │   ├── registry.py                  # register/dispatch + _looks_like_followup() 게이트
│   │   ├── detector.py                  # llm_classify_and_extract (intent + entities, system_base=False)
│   │   ├── _helpers.py                  # call_sp(multi-resultset), parse_target_date/period, normalize_hhmm, enrich_microskill_report
│   │   ├── attendance_gantt/            # 출근현황 간트 + sp_attendance_by_date.sql
│   │   ├── task_diary_report/           # 업무일지 보고서 + sp_task_diary_summary.sql
│   │   └── customer_as_pattern/         # 거래처 AS 패턴 + sp_customer_as_pattern.sql
│   ├── storage/                         # Cycle 2 Phase B
│   │   ├── __init__.py
│   │   └── reports.py                   # Report Pydantic + save/list/get/delete (JSON 파일, REPORTS_DATA_DIR override)
│   ├── db/
│   │   └── connection.py                # pyodbc 풀 + run_in_executor
│   ├── domains/
│   │   ├── loader.py                    # 단일 *.json + 폴더 도메인 로딩, 매칭
│   │   ├── parser.py                    # build_select() — joins → SELECT SQL
│   │   └── __init__.py
│   └── schema_registry/
│       └── domains/
│           └── <name>/                  # 폴더 형식 (Phase 7) — meta/tables/joins/stored_procedures.json
│               # 또는 <name>.json 단일 파일 (하위호환)
│
├── frontend/
│   ├── src/
│   │   ├── design/                      # 디자인 시스템
│   │   │   ├── components/
│   │   │   │   ├── primitives.tsx       # Button, Dot, cls, Slider
│   │   │   │   ├── icons.tsx            # SVG 아이콘
│   │   │   │   ├── TweaksPanel.tsx      # 테마/density/팔레트 + LLM 섹션 (max_tokens / thinking / max_turns)
│   │   │   │   ├── AppShell.tsx         # 5 페이지 라우팅 (보고서 보관함 = Cycle 2)
│   │   │   │   ├── ChatInput.tsx, MessageThread.tsx, AgentTrace.tsx
│   │   │   │   ├── VizPanel.tsx (DataTable: fillHeight prop, sticky header, drilldown wrap)
│   │   │   │   ├── ConversationList.tsx, ResultsBoard.tsx
│   │   │   │   └── report/              # Cycle 2 — 8 블록 카탈로그 + ReportContainer + ProposalCard
│   │   │   │       ├── _atoms.tsx       # BlockHeader / ColorDot / Tag (shared helpers)
│   │   │   │       ├── ReportContainer.tsx       # renderByType + renderByComponent dispatch
│   │   │   │       ├── MarkdownBlock.tsx, MetricCard.tsx, ChartBlock.tsx, HighlightCard.tsx  # 기존 4
│   │   │   │       ├── BubbleBreakdownBlock.tsx, KpiGridBlock.tsx, RankedListBlock.tsx       # Cycle 2 신규 3
│   │   │   │       ├── GanttBlock.tsx            # chart{viz_hint:gantt} 라우팅 (anchor + span 모드)
│   │   │   │       ├── RadarBlock.tsx            # chart{viz_hint:radar} 라우팅 (long format)
│   │   │   │       └── ReportProposalCard.tsx    # HITL 보관 게이트 (보관/수정후보관/버리기)
│   │   │   ├── index.css                # OKLCH 컬러 + density + dark/light + severity 4
│   │   │   └── types/
│   │   │       ├── events.ts            # AgentEvent union (10 variants 포함 ReportProposedEvent)
│   │   │       ├── report.ts            # ReportSchema + 7 블록 union + KpiMetric/BubbleField/RankedField
│   │   │       └── view.ts              # ViewBundle / ViewBlockSpec (component 9종)
│   │   │
│   │   └── framework/                   # 비즈니스 로직 + 페이지
│   │       ├── App.tsx
│   │       ├── main.tsx                 # → import "../design/index.css"
│   │       ├── pages/
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── DataQueryPage.tsx    # /api/sql 직접
│   │       │   ├── AgentChatPage.tsx    # 대화 + 인라인 차트 + ProposalCard sticky bar
│   │       │   ├── UIBuilderPage.tsx
│   │       │   └── ReportArchivePage.tsx  # Cycle 2 Phase C — list + detail + 검색/필터/Drilldown/2-step delete
│   │       ├── components/
│   │       │   └── builder/
│   │       │       ├── DataSourceStep.tsx
│   │       │       └── VizSuggestionStep.tsx
│   │       └── hooks/
│   │           ├── useAgentStream.ts        # SSE + 재연결 + 취소 + reportSchema/viewBundle 캡처
│   │           ├── useConversationStore.ts
│   │           ├── useTweaks.ts             # 테마/팔레트 + LLM 옵션 (max_tokens/thinking/max_turns)
│   │           ├── useServerDefaults.ts     # /api/defaults 응답 (max_tokens/thinking_budget/max_turns)
│   │           ├── useQuickPrompts.ts       # 도메인별 quick chip + localStorage
│   │           ├── useReportArchive.ts      # GET list/{id}, DELETE — localStorage cache fail-soft
│   │           └── useReportProposal.ts     # 별도 EventSource → report_proposed → POST confirm / DELETE proposal
│   ├── package.json
│   ├── vite.config.ts                   # /api → 127.0.0.1:8000
│   └── tailwind.config.ts               # design/ + framework/ 경로
│
├── seed/                                # PT 시연용 골드 보고서 + microskill SP DDL inventory
│   ├── reports/                         # gold-*.json (5건 commit)
│   ├── build_gold_reports.py            # 5 시드 빌더 (재생성 가능)
│   └── load_reports.py                  # cli — seed/reports/ → storage/reports/ 복사 (--reset 지원)
│
├── storage/                             # 런타임 보관 (gitignore)
│   └── reports/<id>.json                # ProposalCard 보관 시 영속화
│
├── docs/                                # 본 사이클 산출물
│   └── pitch/
│       ├── concept-overview.md          # PT 컨셉 1페이지 (4 Pillars)
│       └── gold-scenarios.md            # 시연 매뉴얼 5종
│
├── plans/                               # 진행 중·박제 plan
│   ├── CYCLE2-design-integration.md
│   └── PHASE12-main-split.md
│
├── .claude/skills/                      # Claude Code 세션 전용 (런타임 미사용)
│   ├── LosszeroDB_3Z_MES/
│   └── LosszeroDB_GW/
│
├── .env.example
├── README.md
└── ARCHITECTURE.md                      # ← 이 문서
```

---

## 데이터 흐름

### Standard 경로 (자유 분석 — AgentLoop chain)

```
사용자 입력
  │
  ▼
[ChatInput] ──POST /api/query──▶ [main.py::_run]
                                    │
                                    ├─ 세션 히스토리 로드 (최대 20개)
                                    ├─ 도메인 키워드 매칭 (sticky 폴백)
                                    │
                                    ├─ ① microskill_classify() LLM 1회 (system_base=False)
                                    │     intent + entities 추출
                                    │     매치 → microskill 경로 (아래)
                                    │     none / 실패 → AgentLoop chain 진입 ↓
                                    │
                                    └─ AgentLoop.run() 비동기 시작
                                         │
  ┌──SSE /api/stream/{key}──────────────┘
  │
  ▼
[AgentLoop] ◀────────────── 반복 (max_turns 단위, runtime Slider) ────┐
  │                                                                     │
  ├─ LLM.complete(messages, tools)                                      │
  │   ├─ TEXT_DELTA → LLMChunkEvent                                     │
  │   ├─ TOOL_CALL → 도구 선택                                            │
  │   └─ DONE → 루프 탈출                                                │
  │                                                                     │
  ├─ 도구 실행                                                            │
  │   ├─ tool.execute(input)                                             │
  │   ├─ ToolResultEvent → SSE 전송                                       │
  │   ├─ build_schema 결과 → frontend pendingReportSchemaRef 캡처          │
  │   ├─ build_view 결과 → frontend pendingViewBundleRef 캡처              │
  │   └─ report_generate 결과 → main.py 캡처 → ReportProposedEvent 합성     │
  │                                                                     │
  ├─ max_turns 도달 + tool_call 진행 중                                    │
  │   ├─ ContinuePromptEvent → 프론트엔드에 계속/중단 버튼                  │
  │   ├─ 사용자 "계속" → turn_limit += max_turns                           │
  │   └─ 사용자 "중단" → FinalEvent 반환                                   │
  │                                                                     │
  └─ tool_call 없으면 → FinalEvent ─────────────────────────────────────┘
                              │
                              ▼
                        [MessageThread]
                          ├─ 마크다운 답변 (react-markdown)
                          ├─ <think> 블록 (접이식)
                          ├─ CollapsibleTrace (도구 호출 + Executed SQL 토글)
                          ├─ SwitchableViz (Bar/Line/Pie/Table 전환 + Drilldown 모달)
                          └─ ReportContainer (reportSchema + viewBundle 있을 때) — 8 블록 inline
```

### Microskill 경로 (high-frequency intent — 결정론적 백본)

```
사용자 입력
  │
  ▼
[main.py::_run]
  │
  ├─ ① microskill_classify() LLM 1회 (system_base=False, ~1.5k input)
  │      intent ∈ {attendance_gantt, task_diary_report, customer_as_pattern, none}
  │      + entities {keywords[], vendor}
  │
  ├─ ② _looks_like_followup() 게이트
  │      action verb (만들어/작성/보고서/분석/시각화/차트) 없고 interrogative
  │      또는 12자 이하 → 룰/LLM 결과 무시 → AgentLoop fallback
  │
  ├─ ③ skill.detect() — 룰 기반 params 추출 (date / period / days)
  │      LLM 분류 + LLM 엔티티 + 룰 params 병합
  │
  └─ _run_microskill() 호출 ──────────▶ AgentLoop 우회
        │
        ├─ SubAgentStartEvent
        ├─ skill.run(params, llm)
        │     ├─ call_sp(SP명, params) — single 또는 multi-resultset
        │     ├─ 결과 hydrate → ReportSchema 템플릿 (kpi_grid + chart{gantt|radar|pie} + bubble + ranked …)
        │     └─ keywords 룰 hit 시 LLM 0회, 미스 시 LLM 1회
        │
        ├─ ④ enrich_microskill_report() LLM 1회 (system_base=False, max_tokens 1200)
        │      headline 재작성 + insights 5~7 + markdown 분석 narrative 350단어
        │      report_schema.summary + blocks(append) + view_blocks 갱신
        │
        ├─ Fake ToolStart/Result(build_schema) — frontend reportSchema 캡처용
        ├─ Fake ToolStart/Result(build_view) — frontend viewBundle 캡처용
        ├─ ReportProposedEvent — id_temp + meta + schema + summary
        ├─ FinalEvent — 헤드라인 + summary + 안내 ack
        └─ history inject — _conversations에 <microskill_data> 태그 + rows sample(50/data_ref)
              → follow-up 질의 시 SP 재호출 0회
```

LLM 호출 합산: **2~3회** (분류 + enrich [+ keywords 룰 미스 시])
vs Standard chain: ~5회 (db_query → build_schema → build_view → report_generate → final)

---

## SSE 이벤트 타입 (10 variants)

| 이벤트 | 발생 시점 | 데이터 |
|--------|----------|--------|
| `tool_start` | 도구 호출 시작 (microskill은 fake build_schema/build_view 포함) | tool, input, turn |
| `tool_result` | 도구 실행 완료 | tool, output, rows, error, turn |
| `llm_chunk` | LLM 텍스트 스트리밍 | delta |
| `continue_prompt` | max_turns 도달 | turn, message |
| `subagent_start` | sub_agent / microskill 진입 | name |
| `subagent_progress` | 단계 진행 (예: "스키마 빌드 중", "분석 중") | name, stage |
| `subagent_complete` | sub_agent / microskill 종료 | name, output_summary |
| `report_proposed` | HITL 게이트 — 보관 대기 (Cycle 2 Phase B) | id_temp, meta {blocks, dataRefs, domain, schemaVersion}, schema, summary |
| `final` | 에이전트 완료 | answer, viz_hint, data |
| `error` | 에러 발생 | message |

### `report_proposed` 흐름 (HITL)

```
build_schema → build_view → report_generate (또는 microskill) 통과
   ↓
ReportProposedEvent emit (main.py::_build_report_proposed 또는 _run_microskill)
   ↓ id_temp 키로 main.py::_report_proposals dict에 10분 TTL 저장
   ↓
프론트 useReportProposal — 별도 EventSource로 stream_key 구독
   ↓ proposal state 갱신
[ReportProposalCard] sticky bar — AgentChatPage 하단
   ├─ 📥 보관       → POST /api/reports/confirm/{id_temp} (title? tags? 수정 가능) → save_report → archive 영속
   ├─ ✎ 수정 후 보관 → 인라인 title + tags 편집 후 보관
   └─ 🗑 버리기      → DELETE /api/reports/proposal/{id_temp} → _report_proposals.pop
```

### SSE heartbeat (Phase 11 G7)

reasoning 모델의 긴 silence 동안 reverse proxy idle-close를 방지하기 위해 `event_generator`가 `SSE_HEARTBEAT_SEC` 간격(default 15s)으로 SSE comment 라인(`: heartbeat\n\n`)을 흘린다. 프론트는 이를 무시 (이벤트 X) — EventSource가 connection alive로 인식만 하면 충분. vite proxy는 짝으로 `timeout: 0, proxyTimeout: 0` 설정 필요.

---

## 도구 목록 (Phase 10 Step 3 SKILL.md 표준 + Cycle 2 확장)

각 도구는 **패키지** 구조 (`tools/{name}/{tool.py, SKILL.md, __init__.py}`). sub_agent는 `system.md`(내부 LLM system 메시지) + `schema.py`(Pydantic 모델) 추가.

| 도구 | type | 용도 |
|------|------|------|
| `list_tables` | tool | 테이블명 조회 + 도메인 자동 분류 |
| `db_query` | tool | SELECT 쿼리 실행 (DML/DDL regex 차단) |
| `sp_call` | tool | 화이트리스트 SP 실행 (도메인 JSON에서 추출) |
| `build_schema` | sub_agent | 데이터 결과 → ReportSchema (Cycle 1 rename, build_report→build_schema) |
| `build_view` | sub_agent | ReportSchema → ViewBundle (component 9종 매핑) |
| `report_generate` | sub_agent | ReportSchema → meta(title/summary/domain/tags) + report_proposed SSE (Cycle 2 Phase B) |

## ReportSchema 7 블록 카탈로그

(`backend/tools/build_schema/schema.py` Pydantic + `frontend/src/design/types/report.ts` TypeScript 1:1 미러)

| 블록 | 신규? | 컴포넌트 | data_ref | 핵심 필드 |
|---|---|---|---|---|
| `markdown` | 기존 | MarkdownBlock | X | content |
| `metric` | 기존 | MetricCard | X | label/value/delta/trend/unit |
| `chart` | 기존 | ChartBlock 또는 GanttBlock/RadarBlock 분기 | data_ref | viz_hint(7종 — bar/line/pie/table/number/gantt/radar) + x/y/group_by |
| `highlight` | 기존 | HighlightCard | optional related_data | level(info/warning/alert) + message |
| `bubble_breakdown` | Cycle 2 | BubbleBreakdownBlock | data_ref | bubble{label/size/x/color?} + cards? + layout |
| `kpi_grid` | Cycle 2 | KpiGridBlock | X | columns(2/3/4) + metrics[KpiMetric{label/value/delta/trend/unit/severity}] |
| `ranked_list` | Cycle 2 | RankedListBlock | data_ref | fields{name/primary/secondary?/tags?/color_dot?} + limit + highlight_top |

`viz_hint: "gantt"` chart 두 모드:
- **span**: `y: ["start_col", "end_col"]` (배열) → 직원당 1 row, start–end 막대
- **anchor**: `y: "single_col"` (단일) → group_by별 row + 이름 chip 시간 분포 (lane 자동 분리)

`viz_hint: "radar"` chart는 long format (`category` / `value` / `series`) 권장. group_by로 multi-series.

severity 4단계 (`good` / `neutral` / `warning` / `alert`) — `--severity-good/-neutral/-warn/-alert` OKLCH 토큰 dark/light 양쪽 정의.

---

## Microskill 시스템 (Cycle 2 후속, 2026-05-04 close)

**의도**: high-frequency intent 3종을 결정론적 SP 파이프라인 + 고정 ReportSchema 템플릿으로 처리. LLM 비용/지연 ↓ + LM Studio 경량 모델로도 안정 시연.

**컨트랙트** (`backend/microskills/base.py`):

```python
class MicroskillBase(ABC):
    name: str           # registry key
    domain: str         # "" 면 universal, "groupware" 면 sticky 매치 필요
    description: str

    @abstractmethod
    def detect(self, query: str, session_domain: str) -> MicroskillMatch:
        """룰 기반 1차 매치 + params 추출 (date / period / days). LLM 미사용."""

    @abstractmethod
    async def run(self, params, *, llm=None, original_query="") -> MicroskillResult:
        """SP 호출 + 템플릿 hydrate. keywords/vendor 사전 주입 시 LLM 호출 0."""
```

**dispatch 흐름** (`microskills/registry.py` + `main.py::_run`):

1. **LLM 분류 (1회)** — `llm_classify_and_extract()` (`detector.py`). intent + entities 추출. `system_base=False`로 13k 시스템 프롬프트 미prepend → 작은 모델도 통과.
2. **`_looks_like_followup()` 게이트** — action verb (만들어/작성/보고서/분석/시각화/차트) 없고 interrogative ("누구야?", "왜?", "인원은?") 또는 12자 이하 → 룰/LLM 결과 무시 → **AgentLoop fallback** (이전 turn 컨텍스트로 단답).
3. **skill.detect()** — 룰 params 추출 (date / period / days).
4. **skill.run()** — SP 호출 + 템플릿 hydrate.
5. **enrich_microskill_report() (1회)** — LLM이 풍성한 headline + 5~7 insights + 350단어 markdown 분석 narrative 생성. `report_schema` 갱신.
6. **fake build_schema/build_view tool_result emit** — frontend `useAgentStream` 캡처 경로 재활용 → inline ReportContainer 렌더 (frontend 변경 0).
7. **history inject** — `<microskill_data>` 태그 + rows sample(50/data_ref) 인라인. follow-up 질의가 SP 재호출 0회로 답변.

**현재 등록된 3 skill** (모두 `domain=groupware`):

| skill | 트리거 후보 | params | LLM 호출 | SP |
|---|---|---|---|---|
| `attendance_gantt` | "출근/근태/간트/출퇴근" | target_date | 0 (룰만) | sp_attendance_by_date(@date) |
| `task_diary_report` | "업무일지/일지/업무보고" | period_start, period_end, keywords | 0~1 | sp_task_diary_summary(@start, @end, @keywords_csv) 다중 |
| `customer_as_pattern` | "AS/거래처/현안/패턴" | days, vendor, keywords | 0~1 | sp_customer_as_pattern(@days, @vendor, @keywords_csv) 다중 5 |

**preset 키워드** (skill 2/3): `재고 / 생산 / 키오스크 / BOM / 품질 / 원가 / 급여`. 룰 hit 우선, 미스 시 detector LLM 결과 사용.

**SP whitelist**: `backend/schema_registry/domains/groupware/stored_procedures.json`에 3 SP 등재. SP DDL은 `backend/microskills/<skill>/sp_*.sql` 동봉 (DROP+CREATE 자동, 사용자 환경 적용 필요).

**신 skill 추가 워크플로우**:
1. `backend/microskills/<name>/` 디렉토리
2. `skill.py` (MicroskillBase 상속, `detect` + `run` 구현)
3. `__init__.py` (registry.register 호출)
4. `microskills/__init__.py` import 추가
5. `sp_<name>.sql` DDL 동봉 → 사용자 DB 적용
6. 도메인 JSON whitelist 등록
7. `MICROSKILLS` 자동 dispatch에 노출

**LLM 호출 비교**:
- Standard chain: ~5회 / 보고서 1건 (~130k input total at Tier 1 = ~3분/건)
- Microskill: 2~3회 / 보고서 1건 (~10k input total = ~분당 3~5건)

---

## 도메인 레지스트리

**위치**: `backend/schema_registry/domains/`

도메인은 **폴더 형식**(권장, Phase 7) 또는 **단일 `*.json` 파일**(하위호환) 두 형식을 모두 지원.

### 폴더 형식 (groupware 사용)

```
domains/groupware/
├── meta.json              # domain / display_name / db / keywords / table_groups
├── tables.json            # {"tables": [...]} — 컬럼 스키마, 내부 joins 없음
├── joins.json             # {"joins": [...]} — 1급 join 스키마 (top-level 평탄화)
└── stored_procedures.json # {"stored_procedures": [...]}
```

`meta.json` + `tables.json` 필수, 나머지는 선택. 로더가 4 파일을 단일 DomainSpec으로 병합.

### joins 스키마 (Phase 8 — compact)

```json
{
  "name":      "attendList2LZXP310T",            // <from>2<to> camelCase, optional
  "tables":   ["TGW_AttendList", "LZXP310T"],   // 길이 2, dbo prefix 미포함
  "join_type": "L",                              // L/R/I/C (대소문자 무시)
  "columns":  [["at_UserID"], ["Uid"]],          // [from_cols, to_cols], composite 지원
  "operators": ["="],                            // = / <> / > / < / >= / <=
  "description": "사용자 이름 해석 (at_UserID → uName)"
}
```

dbo 스키마는 본 프로젝트 고정 — 직렬화 / SQL 생성 시점에 코드가 자동 prepend.

### 작동 방식

1. 서버 시작 시 `*.json` 글로빙(구) + 디렉토리 순회(신, `meta.json` 검사) → 메모리 캐시
2. 사용자 질문 → keywords 매칭 → 최적 도메인 선택
3. 테이블/컬럼/SP/joins 정보를 시스템 프롬프트에 주입 (top-level joins는 `### Join Relationships` 섹션으로 직렬화)
4. SP 화이트리스트는 각 도메인의 `stored_procedures`에서 자동 추출

### join → SQL 파서

`backend/domains/parser.py:build_select(joins, select_cols=None, use_alias=True) -> str` — 신 joins 스키마를 입력받아 `SELECT ... FROM A LEFT JOIN B ON ... LEFT JOIN C ON ...` SQL 문자열을 재조립. alias 자동 부여, composite ON, CROSS JOIN, 체인 검증 지원.

**프론트엔드 연동**: `GET /api/domains` → 요약 dict(`table_count`, `join_count`, `sp_count`, `table_groups`, `keywords[:5]`) → 에이전트 카드 동적 생성 (AgentChatPage).

---

## 프론트엔드 구조

### 페이지 라우팅
- `App.tsx` — CSS hidden 방식으로 전 페이지 상시 마운트 (탭 전환 시 세션 유지)
- `AppShell` — 접이식 사이드바(208px ↔ 56px) + 헤더

### 시각화
- `VizPanel.tsx` — recharts 기반
  - `SwitchableViz` — 차트 타입 수동 전환 (Bar/Line/Pie/Table/Number)
  - `getApplicableHints()` — 데이터 형태에 따라 적용 가능 차트만 표시
  - `Brush` — Bar/Line 차트 드래그 줌
  - 클릭 포커스 — Bar/Pie 개별 항목 강조

### 상태 관리
- `useAgentStream` — useReducer 기반 (messages, results, sessionId, pendingContinue)
- `useConversationStore` — localStorage 영속화 (대화 목록/저장/불러오기/export)
- 탭 전환 시 CSS hidden으로 DOM 유지 → 세션 유지
- localStorage key: `llm-harness-conversations`

### 인라인 시각화
- `MessageThread` 내 `CollapsibleTrace` → `ToolResultInlineViz`
  - `db_query` / `sp_call` 결과 데이터를 각 턴마다 접이식 차트 카드로 표시
  - 기본 접힘, 클릭 시 `InlineViz` 렌더
- `FinalEvent.data`는 메시지 하단에 `InlineViz`로 별도 표시

---

## UI 빌더 (3단계 위저드)

```
Step 1: DataSourceStep
  ├─ SQL 직접 입력 → POST /api/sql
  └─ 자연어 → POST /api/generate_aggregation_sql → SQL 생성 → 자동 실행

Step 2: VizSuggestionStep
  └─ POST /api/suggest_viz (샘플 5행)
      → viz_hint + x_axis/y_axis 추천 (현재는 휴리스틱)
      → SwitchableViz로 즉시 미리보기

Step 3: 위젯 저장 (Phase 6 예정)
  └─ react-grid-layout 기반 드래그 그리드 + localStorage 영속화
```

---

## /api 엔드포인트 맵

| Method | Path | 용도 |
|---|---|---|
| GET | `/health` | provider/domains 헬스체크 |
| GET | `/api/domains` | 등록 도메인 summary |
| GET | `/api/defaults` | provider-aware tunings (max_tokens, thinking_budget, thinking_supported, max_turns) |
| POST | `/api/sql` | DataQueryPage 전용 raw SELECT |
| POST | `/api/generate_aggregation_sql` | UI Builder Step 1 — JSON column 가설 → aggregation SQL (Phase 8) |
| POST | `/api/query` | 메인 챗 진입 — body: query/session_id/max_tokens?/thinking_*?/max_turns? |
| GET | `/api/stream/{stream_key}` | SSE 이벤트 스트리밍 (heartbeat 15s) |
| POST | `/api/continue/{stream_key}` | continue_prompt 응답 (true/false) |
| GET | `/api/stream_status/{stream_key}` | reconnect 시 미수신 이벤트 replay 인덱스 |
| POST | `/api/cancel/{session_id}` | 진행 중 task cancel |
| POST | `/api/suggest_viz` | UI Builder Step 2 — 데이터 → viz_hint 추천 |
| GET | `/api/reports` | 보관된 리포트 list (Cycle 2 Phase B) |
| GET | `/api/reports/{report_id}` | 단건 Report (schema + meta) |
| DELETE | `/api/reports/{report_id}` | 보관 삭제 |
| POST | `/api/reports/confirm/{id_temp}` | HITL 보관 확정 (body: title?, tags?) → save_report |
| DELETE | `/api/reports/proposal/{id_temp}` | HITL 버리기 → _report_proposals.pop |

---

## LLM Provider

| Provider | 연결 | Tool Calling | Retry / Timeout |
|----------|------|-------------|------------------|
| Claude | Anthropic SDK 스트리밍 | 네이티브 tool_use | `max_retries=0` — SDK auto-retry storm 차단, agent loop가 backoff 결정 |
| LM Studio | httpx OpenAI 호환 | 네이티브 (모델 의존) | `httpx.Timeout(connect=10, read=600, write=30, pool=30)` — read 환경변수화 |

### 시스템 프롬프트 합성 흐름 (Phase 10 Step 3)

```
[system_base.md]                              ← prompts/system_base.md (core, 다이어트됨)
+ [rules/*.md applies_to: system_prompt]      ← prompts/rules/*.md (cross-cutting)
+ [tool addenda — ## Tool: <name>]            ← tools/<name>/SKILL.md (Rules/Guards/Errors)
+ [domain schema]                             ← domains/loader.domain_to_context()
```

`backend/prompts/loader.py:build_system_prompt()`이 startup에 1회 합성 (lru_cache). 각 도구의 SKILL.md frontmatter `applies_to` 키가 `system_prompt_addendum`을 포함하면 해당 도구의 Rules/Guards/Errors 섹션이 추출되어 system prompt 끝에 `## Tool: <name>` 섹션으로 concat. `Tool.description` property는 `loader.get_tool_description(self.name)` ABC default를 사용 → SKILL.md `## Description` 섹션이 OpenAI tool schema description으로 직행.

sub_agent의 내부 LLM system 메시지는 `tools/<name>/system.md`에 외부화. SKILL.md frontmatter `sub_agent_system: ./system.md`가 경로 박제. `loader.get_subagent_system(name)`이 read.

새 도구 추가 워크플로우: `tools/<name>/` 디렉토리 1개 + `tool.py`(Tool ABC 상속) + `SKILL.md`(frontmatter + 섹션) → main.py에 등록만 하면 끝. description.md 작성 / 시스템 프롬프트 직접 read / `Tool.description` override 모두 불필요.

### Per-request LLM tuning (Phase 11 + Microskill 사이클)

`LLMProvider.complete`는 4개 keyword-only 옵션을 받는다:
- `max_tokens` — provider별 default fallback
- `thinking_enabled` / `thinking_budget` — Claude extended thinking
- **`system_base: bool = True`** — False 시 harness base system prompt(~13k) 미prepend. microskill detector / enrich에서 사용 — 작은 모델 컨텍스트 초과 / LM Studio 400 회피.

data flow:

```
TweaksPanel UI → useTweaks (localStorage) → useAgentStream POST /api/query body
   → QueryRequest.{max_tokens, thinking_enabled, thinking_budget, max_turns}
   → AgentLoop(__init__ 보관) → 매 turn provider.complete(..., max_tokens=..., thinking_*=...)
   → sub_agent tool 인스턴스에는 set_llm_options()로 매 turn inject

microskill 경로:
   → microskill_classify(query, llm) — system_base=False
   → enrich_microskill_report(result, llm) — system_base=False
```

옵션 None 시 provider별 환경변수 default fallback (`CLAUDE_MAX_TOKENS`/`LM_STUDIO_MAX_TOKENS` 10000, `CLAUDE_THINKING_BUDGET` 4096, `AGENT_MAX_TURNS` 10). max_turns은 [1, 50] clamp. claude는 모델이 extended thinking을 지원하지 않으면 silent ignore + warning 1줄. lm_studio는 thinking_enabled=True 시 항상 warning + 무시. `/api/defaults` GET이 provider-aware default + thinking_supported flag를 노출 → 프론트 `useServerDefaults` hook이 startup에 fetch하여 TweaksPanel 컨트롤 활성화 결정.

### Harmony 마커 정규화 (LM Studio)

일부 모델이 출력하는 `<|channel|>thought` / `<|channel|>analysis` / `<|channel|>final` / `<|end|>` 토큰을 `<think>...</think>` 표준 형식으로 **스트리밍 안전하게** 변환 (`_HarmonyTransformer`). 토큰 경계가 청크 사이에 걸쳐도 정상 처리.

---

## 디자인 시스템 (Phase 6 신규)

### 토큰 구조 (`design/index.css`)
- **OKLCH 컬러** — 지각적 균일 색공간 사용
- 6단계 차트 팔레트: `teal`, `ember`, `violet`, `mono`
- 의미 색상: `--success`, `--warning`, `--danger`, `--info`
- 밀도 변수: `--density-scale` (compact 0.85x / comfortable 1.0x / spacious 1.18x)
- 사이드바 스타일: `minimal`, `elevated`

### 적용 메커니즘 (`framework/hooks/useTweaks.ts`)
- localStorage(`losszero.tweaks.v1`) 영속화
- `data-theme`, `data-density`, `data-sidebar` 속성을 `<html>`에 주입
- `--brand-{300-700}` CSS 변수를 OKLCH 보간으로 동적 계산
- 차트 팔레트도 CSS 변수(`--chart-default-{1-6}`)로 노출 → recharts에서 참조

### TweaksPanel
- 우측 슬라이드 패널, 세그먼티드 컨트롤
- 테마/density/사이드바 스타일/팔레트/디버그 viz 토글
- 즉시 반영 (CSS 변수 변경)

---

## DB 연결

- pyodbc + `asyncio.run_in_executor` (동기 → 비동기 래핑)
- `PyodbcPool` — `queue.Queue` 기반, max_size=5, `SELECT 1` 유효성 검증
- ODBC Driver 자동 감지 (18 → 17 → Native Client → SQL Server)
- DML/DDL 차단: `db_query` 도구에서 regex로 INSERT/UPDATE/DELETE 등 차단

---

## 세션 관리

| 저장소 | 키 | 내용 | 수명 |
|--------|-----|------|------|
| `_sessions` | stream_key | SSE 이벤트 버퍼 | 쿼리 단위 |
| `_conversations` | session_id | 대화 메시지 히스토리 | 세션 단위 (메모리) |
| `_session_domains` | session_id | sticky 도메인 코드 (Phase 9 Fix 1) | 세션 단위 |
| `_continue_gates` | stream_key | asyncio.Event (계속 대기) | 승인 완료까지 |

**`_session_domains` sticky**: 첫 turn에서 `match_domain(query)`이 도메인을 발견하면 session_id에 박제. 후속 turn에서 키워드 매칭이 실패하면 sticky 도메인을 fallback으로 사용 → 사용자가 후속 질문에서 도메인 키워드를 생략해도 컨텍스트가 유지된다.

---

## 스킬 시스템 (.claude/skills/)

Claude Code 세션 전용. **런타임 백엔드와 분리**.

| 스킬 | 역할 |
|------|------|
| LosszeroDB_3Z_MES | MES DB 채널 구조, meta.py (테이블/컬럼/SP 조회), Query.py |
| LosszeroDB_GW | GW DB 메타 조회 |

스킬의 meta.py로 DB를 탐색 → 도메인 JSON 수동 작성 → `schema_registry/domains/`에 배치.

---

## 실행

```bash
# 백엔드
cd backend
uv run python main.py

# 프론트엔드 (별도 터미널)
cd frontend
pnpm dev
```
