# Phase 9 — Deep Agent Loop / Report Pipeline

## Context

사용자의 데이터 질의가 단순 답변(현 ReAct로 충분)에서 그치지 않고, **분석 + 시각화 + 정성적 요약을 포함한 보고서 형태**의 출력을 자동으로 만들어야 하는 시나리오가 늘어났다. 출퇴근 현황·상담 요약 같은 사례가 대표.

기존 단일 ReAct 루프로는 (1) 시각화 자동 추천이 별도 엔드포인트(`/api/suggest_viz`)로 분리되어 챗봇 안에 통합되지 않고, (2) 정성적 요약·인사이트 추출이 LLM의 final 답변 텍스트에만 의존, (3) view 컴포넌트가 viz_hint 5종으로 한정되어 시계열·heatmap 등이 부재.

본 phase는 **3-stage sub-agent pipeline**(retriever → report schema builder → view builder)을 도입해 이를 해소한다. 단, **신규 sub-agent을 도구처럼 노출**해 현 AgentLoop이 그대로 outer 역할을 하도록 한다 — 단순 질의는 기존과 동일하게 ReAct만 돌고, 보고서 의도 질의에서만 sub-agent chain이 LLM의 도구 호출로 자동 활성.

---

## 아키텍처 개요

```
User Query
  ↓
AgentLoop (ReAct, outer 역할)
  ├─ list_tables / db_query / sp_call            (SubAgent1 = 기존 도구로 데이터 조회)
  ├─ build_report  ⟵ 신규 도구. 내부에 LLM agent loop
  └─ build_view    ⟵ 신규 도구. deterministic + 보조 LLM
  ↓
final (인라인 ReportContainer 또는 일반 답변)
```

라우팅은 LLM 자율: 시스템 프롬프트에 두 신규 도구를 노출하고 "보고서 의도가 명시적일 때만 호출" 가이드. 단순 질의는 자연스럽게 db_query 후 종료.

---

## Sub-agent 명세

각각 **별도 LLM agent loop 또는 deterministic 도구**. 외부에서는 모두 `Tool` 인터페이스로 보임.

### SubAgent1 — 데이터 조회 (변경 없음)
현 ReAct + 기존 도구(list_tables/db_query/sp_call). DataResult = query 출력 그대로(rows + columns).

### SubAgent2 — Report Schema Builder (`backend/tools/build_report/`)
- 입력: `data_results: DataResult[]`, `user_intent: str`
- 내부: LLM 1~2회 호출 (외부 도구 없음, 순수 분석/요약)
- 출력: `ReportSchema` JSON (아래 §스키마)
- 책임: 데이터 → 의미 추출. headline / insights / metric / highlight / chart spec / markdown 본문.

### SubAgent3 — View Builder (`backend/tools/build_view/`)
- 입력: `report_schema: ReportSchema`
- 내부: deterministic block→component 매핑 + 보조 LLM 호출 (chart 축 미지정 시 컬럼에서 추론, table 핵심 컬럼 선정 등 1회 정도)
- 출력: `ViewBundle` (각 block마다 컴포넌트 인스턴스 spec)
- 책임: schema → 렌더 가능한 view 명세.

---

## ReportSchema 정의 (확정 골격 — 옵션 B + insights/highlight 포함)

```typescript
interface ReportSchema {
  title: string;
  generated_from: string;             // 원 질의 echo
  summary: {
    headline: string;                  // 한 줄 핵심 메시지
    insights: string[];                // 2~5개 분석 포인트
  };
  blocks: ReportBlock[];               // 순서대로 렌더링
  data_refs: DataRef[];                // SubAgent1 결과 — embed or ref (hybrid, §데이터 흐름)
}

type ReportBlock =
  | { type: "markdown"; content: string }
  | { type: "metric"; label: string; value: number|string; delta?: string; trend?: "up"|"down"|"flat"; unit?: string }
  | { type: "chart"; viz_hint: VizHint; data_ref: number; x?: string; y?: string|string[]; group_by?: string; title?: string }
  | { type: "highlight"; level: "info"|"warning"|"alert"; message: string; related_data?: number };

// 점진 추가 후보: table — 실 수요 발생 시
```

---

## View 카탈로그 (`frontend/src/design/components/report/`)

| 컴포넌트 | block 매핑 | 비고 |
|---|---|---|
| `MetricCard` | metric | 단일 수치 + 변화율 + 트렌드 화살표 |
| `ChartBlock` | chart | Recharts 래퍼. viz_hint 5종 + (점진) timeline/heatmap |
| `MarkdownBlock` | markdown | react-markdown 재사용 |
| `HighlightCard` | highlight | level별 색상 (info/warning/alert) |
| `ReportContainer` | — | 전체 layout 셸 (title + summary + blocks 순) |

ROADMAP §A UI 빌더 위젯과 컴포넌트 라이브러리 공유 — 한 번 만들면 양쪽에 쓰임.

---

## Orchestration

### 라우팅 — LLM 자율 (별도 classifier 없음)
시스템 프롬프트에 두 신규 도구 가이드 추가:
> `build_report` — DB 조회 결과를 받아 분석 보고서 schema 생성. **명시적으로 "분석/보고서/요약/현황 정리"** 같은 의도일 때만 호출.
> `build_view` — `build_report` 출력 직후에만 호출해 view bundle 생성.

단순 질의 → db_query만 쓰고 final.
보고서 의도 → db_query → build_report → build_view → final.

### 재시도 — 단방향
SubAgent2/3가 데이터 부족 발견 시 → narrative_summary에 명시 → 사용자 후속 질문으로 보강. orchestrator 자동 재시도 없음.

### HITL 게이트 — 현 phase 미도입
- 일단 없이 구성.
- ROADMAP 메모: provider별 분기 방안 — local LM Studio면 게이트 없음 / API(Claude)면 각 sub-agent 단계 사이 게이트 슬롯 도입 검토.

### Persistence — 챗 기반
- ReportSchema + ViewBundle을 final 메시지의 메타데이터로 첨부.
- 현 인라인 차트 패턴(`tool_result`의 `data` + final의 `viz_hint`) 확장.
- 대화 다시 열면 ReportContainer 자동 재현. localStorage(현 useConversationStore) 그대로.

### 데이터 흐름 — hybrid embed/ref
- 기본: data_refs에 raw rows 임베드 (작은 결과).
- 임계치(권장 100KB 또는 row count 1000) 초과 시: orchestrator 메모리에 보유, schema에는 ref id만. SubAgent3 호출 시 hydrate.

### 도메인 컨텍스트 — lazy 주입
- SubAgent1만 도메인 schema 받음 (현 동작 유지).
- SubAgent2/3는 결과 + 의도만 받음 (도메인 schema 불필요 — 토큰 절감).

### SSE 신규 이벤트
```typescript
| { type: "subagent_start"; name: "build_report" | "build_view" }
| { type: "subagent_progress"; name: string; stage: string }    // 선택
| { type: "subagent_complete"; name: string; output_summary: string }
```
기존 `tool_start`/`tool_result`도 사용 가능하지만, sub-agent는 내부 LLM 호출 + 다단계라 별도 이벤트로 분리해 UI 진행 표시 명확화.

### 에러 처리 — LLM 복구 위임
- 시스템 프롬프트: "도구 실패 시 다른 접근 시도. 회복 불가하면 final로 사용자에게 명시."
- 백엔드는 도구 예외를 `tool_result.error`로 표면화. LLM이 보고 다음 액션 결정.
- 마지막 안전망: AgentLoop max_turns(10) 도달 시 continue_prompt(기존).

---

## 구현 단계 (sub-phase 권장)

| Sub-phase | 범위 | 위임 |
|---|---|---|
| 9.1 | View 카탈로그 5종 + ReportContainer 컴포넌트 (정적 데이터로 단독 검증) | Front/View |
| 9.2 | SubAgent2 도구(`tools/build_report/`) + ReportSchema 타입/검증 | BackEnd Infra |
| 9.3 | SubAgent3 도구(`tools/build_view/`) — deterministic + 보조 LLM | BackEnd Infra |
| 9.4 | 시스템 프롬프트 가이드 + AgentLoop 도구 등록 + SSE subagent_* 이벤트 | BackEnd Infra |
| 9.5 | 프론트 인라인 ReportContainer 렌더링 + persistence(메시지 메타데이터) | Front/View |
| 9.6 | SSE subagent_* 핸들러 + UI 진행 표시 | Front/View |

권장: 9.1 / 9.2 병렬 → 9.3 / 9.4 / 9.5 / 9.6 점진. 동시 worktree 충돌 회피를 위해 git worktree 분리 또는 순차 실행 (Phase 8 교훈).

---

## 핵심 파일

### 신규
- `backend/tools/build_report/{tool.py, description.md, schema.py, __init__.py}` — ReportSchema 타입 + builder
- `backend/tools/build_view/{tool.py, description.md, __init__.py}` — ViewBundle 매핑
- `frontend/src/design/components/report/{MetricCard,ChartBlock,MarkdownBlock,HighlightCard,ReportContainer}.tsx`

### 수정
- `backend/agent/loop.py` — sub-agent 도구 등록
- `backend/agent/events.py` — `subagent_start/progress/complete` 이벤트 타입
- `backend/prompts/system_base.md` — 신 도구 호출 가이드
- `backend/main.py` — SSE 라우팅 (신 이벤트)
- `frontend/src/design/types/events.ts` — 이벤트 타입 추가
- `frontend/src/framework/hooks/useAgentStream.ts` — subagent_* 핸들러
- `frontend/src/framework/pages/AgentChatPage.tsx` — 인라인 ReportContainer
- `frontend/src/framework/hooks/useConversationStore.ts` — 메시지 메타데이터 보존 확인

---

## 검증

- **회귀 없음**: 단순 질의("어제 출근자 몇 명?") 현재 동작 동일.
- **보고서 의도**: "1월 출근 분석" → AgentLoop이 db_query → build_report → build_view → final 자동 체이닝. ReportContainer 인라인 렌더.
- **persistence**: 동일 대화 다시 열기 → ReportContainer 복원.
- **SSE**: subagent_* 이벤트 정상 노출, UI에 단계별 진행 표시.
- **에러 복구**: build_report 강제 실패 fixture → LLM이 대체 경로 시도 또는 사용자에 명시.
- **도메인 컨텍스트 lazy**: SubAgent2/3 호출 시 도메인 schema 미주입 확인 (토큰 카운트 비교).
- **데이터 hybrid**: 작은 결과 임베드, 큰 결과 ref + hydrate 동작 확인.

---

## ROADMAP 메모 (Phase 9 종료 후 또는 그 이전 단계에서 별도 사이클 후보)

- **HITL 게이트**: provider별 분기 — local 없음 / API면 sub-agent 단계 사이 게이트.
- **ReportSchema 점진 블록**: `table`, `comparison`, `kpi_grid` 등 — 실 수요 발생 시.
- **View 카탈로그 확장**: `TimeSeriesPanel`, `HeatmapCalendar` — 출퇴근/근태 같은 시계열 의도.
- **Quality auto-judge**: AUTO_MODE LLM judge로 게이트 자동화 — UX/비용 trade-off 검증 후.
- **Sub-agent 카탈로그화**: 향후 다른 sub-agent(예: comparison_agent, anomaly_detector) 추가 시 등록 패턴 표준화.

---

## 위험 / 알려진 함정

- **응답 지연**: multi-stage = LLM 호출 3~5회 → 사용자 대기 시간 증가. 스트리밍으로 점진 표시 필수 (subagent_* 이벤트 + 단계별 UI).
- **LLM 라우팅 오판**: 단순 질의를 보고서로 잘못 분류해 sub-agent 체이닝 트리거. 시스템 프롬프트 가이드(명시적 의도) + 사용자 후속 정정으로 완화. 패턴 누적되면 별도 라우팅 검증 추가.
- **토큰 비용**: SubAgent2/3 각각 LLM 호출 → API provider 사용 시 비용 증가. ROADMAP HITL 게이트와 함께 비용 모니터링 필요.
- **컴포넌트 카탈로그 부족**: 출퇴근 같은 시계열은 현 viz_hint 5종으로 표현력 한계. 9.1 단계에서 우선 5종 카탈로그로 시작 + ROADMAP에 시계열 특화 컴포넌트 후속 추가.
- **동시 worktree 충돌**: Phase 8 교훈. sub-phase 동시 진행 시 git worktree 분리 또는 순차 실행.
