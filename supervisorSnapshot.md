# Supervisor Snapshot — 세션 인계용 일시 상태

> 작성: 2026-04-29 (Phase 8 종료 직후, Phase 9 plan 승인 시점)
> 갱신: 2026-04-29 (Debug 평가 결과 흡수 — §6 추가)
> 본 파일은 직전 supervisor 세션이 다음 supervisor 세션에 넘기는 **transient 상태 스냅샷**.
> cold-start 절차(HANDOFF.md)와는 분리되며, Phase 9 착수 시점에는 이 파일을 우선 읽는다.

---

## 1. 직전 사이클 요약

### Phase 8 클로즈 (2026-04-29)
- joins 스키마 가독성 개선: 4 키 → 2 키(`tables`/`columns`), dbo prefix 제거
- groupware joins 22개 (20 변환 + 2 신규: `workBoard2taskPlan`, `attendExceptT2attendExcept`)
- parser/loader 신 스키마 마이그레이션, `build_select` dbo 자동 prepend
- SPEC §5.2 / ARCHITECTURE / ROADMAP Phase 8 갱신
- agent-prompts/README에 동시 세션 워크트리 충돌 가드 추가

### 워크트리 / git 상태 (스냅샷 시점)
- 브랜치: `main`, origin/main과 동기화 완료 (push 완료)
- 워킹트리 클린, feature 브랜치 모두 정리됨
- 추가로 본 스냅샷 + Phase 9 plan 사본을 커밋 예정 (이 파일 직후)

---

## 2. 다음 작업 — Phase 9 (Deep Agent Loop / Report Pipeline)

**plan 사본**: `plans/PHASE9-deep-agent-loop.md` (이번 사이클에서 함께 커밋).
새 supervisor 세션이 이 plan을 읽고 sub-phase 단위로 위임을 진행하면 됨.

### Phase 9 골격
3-stage sub-agent pipeline을 도입하되, 신규 sub-agent을 **도구처럼 노출**해 현 AgentLoop이 outer 역할을 그대로 유지:

```
User Query
  ↓
AgentLoop (ReAct, outer)
  ├─ list_tables / db_query / sp_call           (SubAgent1 = 기존 도구)
  ├─ build_report  ⟵ 신규 도구 (LLM agent loop)
  └─ build_view    ⟵ 신규 도구 (deterministic + 보조 LLM)
  ↓
final (인라인 ReportContainer 또는 일반 답변)
```

라우팅은 LLM 자율(시스템 프롬프트 가이드만 추가). 단순 질의는 현 동작 유지, 보고서 의도일 때만 sub-agent chain 활성.

### Sub-phase 분해 (plan §"구현 단계 (sub-phase 권장)")

| Sub-phase | 범위 | 위임 |
|---|---|---|
| 9.1 | View 카탈로그 5종 + ReportContainer (정적 데이터 단독 검증) | Front/View |
| 9.2 | `tools/build_report/` + ReportSchema 타입 | BackEnd Infra |
| 9.3 | `tools/build_view/` (deterministic + 보조 LLM) | BackEnd Infra |
| 9.4 | 시스템 프롬프트 가이드 + AgentLoop 도구 등록 + SSE subagent_* 이벤트 | BackEnd Infra |
| 9.5 | 프론트 인라인 ReportContainer + persistence | Front/View |
| 9.6 | SSE subagent_* 핸들러 + UI 진행 표시 | Front/View |

### 진행 권장 (새 supervisor에 전달)
- **9.1 / 9.2 부터 병렬** — Front/View와 BackEnd Infra가 ReportSchema 인터페이스만 공유. 단 **반드시 git worktree 분리** 또는 **순차 실행** (Phase 8 동시 worktree 충돌 사고 재발 방지).
- 그 후 9.3 / 9.4 / 9.5 / 9.6 점진.

### 확정 결정 사항 (plan에 박제됨)
- Sub-agent 인터페이스: 각각 별도 LLM agent loop (외부엔 Tool로 보임)
- 라우팅: LLM 자율 (별도 classifier 없음)
- 재시도: 단방향 (사용자 후속 질의로 보강)
- HITL 게이트: 본 phase 미도입. ROADMAP 메모 — provider 분기 (local 없음 / API면 단계 사이)
- Persistence: 챗 메시지 메타데이터에 ReportSchema + ViewBundle 첨부 (현 인라인 차트 패턴 확장)
- 데이터 흐름: hybrid embed/ref (기본 임베드, 임계치 초과 시 ref + hydrate)
- 도메인 컨텍스트: lazy 주입 (SubAgent1만 받음)
- SSE: `subagent_start/progress/complete` 신규 이벤트
- 에러 처리: LLM 복구 위임 (시스템 프롬프트로 가이드)
- ReportSchema 풍부도: `markdown` / `metric` / `chart` / `highlight` 4종 + `summary{headline, insights[]}`. `table` 등은 점진 추가
- View 생성: 옵션 A (카탈로그 + props 채우기). B/C는 별도 "UI 빌더" 기능으로 분리 (ROADMAP §A)
- View 카탈로그: UI 빌더 위젯과 컴포넌트 라이브러리 공유

### ROADMAP 후보 (Phase 9 종료 후 또는 그 전에 별도 사이클)
- HITL 게이트 도입 (provider 분기)
- ReportSchema 점진 블록 (`table`, `comparison`, `kpi_grid`)
- View 카탈로그 확장 (`TimeSeriesPanel`, `HeatmapCalendar` — 시계열 특화)
- AUTO_MODE LLM judge 게이트
- Sub-agent 카탈로그화 (향후 anomaly_detector 등)

---

## 3. 본 세션이 분기된 이유

직전 supervisor 세션은 별도 **Debug 작업**으로 분기됨. 새 supervisor 세션은 이 스냅샷 + plan 사본만 참조하면 Phase 9를 컨텍스트 손실 없이 이어받을 수 있음.

---

## 4. 새 supervisor 세션에 권장하는 첫 흐름

1. `HANDOFF.md` (cold-start)
2. `supervisorSnapshot.md` (이 파일 — 현재 상태)
3. `plans/PHASE9-deep-agent-loop.md` (Phase 9 본 plan)
4. `SPEC.md` §5 (도메인 레지스트리 / joins schema 신 형식)
5. `ROADMAP.md` (장기 후보)
6. `git log --oneline -10` (최근 커밋 흐름)
7. 사용자에게 "9.1부터 시작?" 확인 → sub-phase 위임 명세 작성

---

## 5. 주의 / 알려진 함정

- **동시 worktree 충돌** — Phase 8 사이클에서 db-domain ↔ backend-infra 세션이 같은 worktree에서 동시 분기·커밋하다가 reflog 꼬임 발생. agent-prompts/README §동시 세션 작업 시 워크트리 충돌 주의 참조. 권장 완화책: git worktree 분리 또는 순차 실행.
- **sub-phase 9.1 / 9.2 병렬 시 같은 워크트리 사용 금지** — 위 사고 재발 방지.
- **컴포넌트 카탈로그 부족** — 시계열·heatmap은 plan 9.1 범위 밖. ROADMAP 후속 항목으로 둠.
- **multi-stage 응답 지연** — 스트리밍 점진 표시(subagent_* 이벤트 + 단계별 UI) 필수.

---

## 6. Phase 9 위임 시 흡수할 Debug 분석 결과 (2026-04-29 추가)

직전 Debug 사이클에서 LM Studio 4턴 시나리오(AS현안 다중턴) 정합도 평가 완료. 본질 원인 2종 규명:

### 진단 요약
- **후속턴 도메인 스키마 누락** (`backend/main.py:314-315`, `backend/domains/loader.py:182-210`): `/api/query`가 매 호출마다 `match_domain(body.query)`를 새로 실행. follow-up 질의에는 groupware keywords 미포함 → score=0 → `domain_ctx=""` → 시스템 프롬프트에 도메인 schema 누락. `system_total_len` Q1=9785 → Q2~Q4=0.
- **도구 실행 history 폐기** (`backend/main.py:500`): `_conversations[session_id]`에 final 텍스트만 저장. AgentLoop 내부의 `assistant(tool_use)` + `tool(result)` 메시지는 턴 종료 시 폐기. → LLM은 markdown 표 헤더(거래처명/현안제목/접수일시)만 보고 컬럼명 환각 → SQL `[현안제목] LIKE ...` 같은 hallucination 2회 후 포기.

### 처리 분배

**Debug 세션이 자율 C로 처리** (Phase 9 영역 무충돌):
- **Fix 1 — 세션 점착 도메인** (`main.py` 신규 dict + `match_domain` fallback). 본질 절반 해결. 효과 즉각. **머지 완료 (e4bf49a → main b36f735)**.
- ~~**Fix 5 — groupware keywords 보강**~~ — **revert됨 (0772900)**. 추가한 9개 generic 토큰(거래처/업체/고객/요청/요청자/담당자/긴급/작업유형/처리상태)이 향후 MES 도메인 추가 시 score 누적 오매칭 위험 큼 + Fix 1이 follow-up을 sticky로 처리하므로 marginal value 0. 본 사이클에서 Debug 자체 revert 권고 → supervisor 수용.
- AS현안 case-test 1 평가 보고서(`case-test 1.md`)는 ground-truth로 유지.
- 회귀 명세: 동일 시나리오 4턴 재현 → Q3 SQL이 `wb_*` 실제 컬럼명 사용 + Q2~Q4 system_total_len > 0 유지.

**Phase 9 위임 시 흡수해야 할 것** (새 supervisor가 sub-phase 9.4·9.5 위임 명세 작성 시 반드시 포함):

| Debug Fix | 흡수 위치 | 통합 이유 |
|---|---|---|
| **Fix 2** (Tool history 보존) — `main.py:500` `_conversations` 저장 형식 풍부화. AgentLoop가 사용한 messages 리스트(시스템 제외)를 복사해 다음 턴이 `assistant(tool_use)` + `tool(result)` 페어를 그대로 보도록. **주의**: MAX_HISTORY 트리밍이 `tool_use`/`tool_result` 페어를 깨면 OpenAI 400 에러 → 페어 단위로 자르는 가드 필수. | **9.5 (persistence)** | 9.5는 ReportSchema+ViewBundle 메시지 메타데이터 첨부. Fix 2와 동일 저장소(`_conversations`) 재설계 영역. 두 변경을 함께 해야 충돌 회피. |
| **Fix 3** (도구 결과에 행수 meta prepend) — `loop.py:199-202` 도구 결과 wrapping에 `[meta] rows={N}` prepend. LLM이 자체 truncation할 때 명시적 단서 제공. | **9.4 (AgentLoop 도구 등록 + SSE subagent_*)** | 9.4가 loop.py 도구 wrapping 영역 직접 수정. 같은 함수 부근. 함께 처리해야 효율적. |
| **Fix 4** (system_base.md 회복 가이드) — "쿼리가 'Invalid column name' 에러를 반환하면 컬럼명을 추측하지 말고 도메인 스키마 또는 list_tables 재참조" 한 줄 추가. | **9.4 (시스템 프롬프트 가이드)** | 9.4가 신 도구(build_report/build_view) 호출 가이드 추가하는 시점. system_base.md를 어차피 만짐. 함께 다듬는 게 합리적. |

### 새 supervisor 액션 (위임 명세 작성 시)
- 9.4 위임 명세에 Fix 3 + Fix 4 명시 (도구 결과 wrapping에 행수 meta + system_base.md 회복 가이드).
- 9.5 위임 명세에 Fix 2 명시 (ReportSchema+ViewBundle 첨부 + tool_use/tool_result history 보존을 동일 저장 형식으로 통합 설계).
- 회귀 점검에 위 Debug 시나리오(4턴 AS현안) 재현 케이스 포함.

### 참조
- Debug 세션의 평가 보고는 본 사이클 종료 후 별도 보존되지 않음 (인수인계는 본 §6에 압축됨). 필요 시 git log에서 Debug 사이클 commit 메시지 또는 본 §6을 ground truth로.

---

## 7. Phase 9 진척 — Sub-phase 완료 기록

### 9.1 — View 카탈로그 5종 + ReportContainer (완료, 2026-04-29)

- 머지 커밋: `--no-ff` merge of `agent/front-view` into main
- 신설 파일:
  - `frontend/src/design/types/report.ts` — **locked schema** (9.x 동결)
  - `frontend/src/design/components/report/{MetricCard,ChartBlock,MarkdownBlock,HighlightCard,ReportContainer}.tsx`
  - `frontend/src/design/components/report/__fixtures__/sample.json`
  - `frontend/src/framework/pages/ReportDemoPage.tsx` (NAV 노출, `/report-demo` 라우트)
- 함께 수정: `design/components/AppShell.tsx` (Page union + NAV_ITEMS)
- 부수 fix: `design/components/primitives.tsx:148` StatDelta down→`--danger` (별도 커밋)

#### 박제된 결정 (9.2/9.3/9.5 위임 시 인용)

1. **ReportSchema / DataRef 동결** — `frontend/src/design/types/report.ts` 형식이 9.x 인터페이스 계약. 9.2 BackEnd Infra가 pydantic 모델로 mirror하되 형식 변경 금지. 변경 필요 시 supervisor가 모든 9.x in-flight 위임 정지 후 재합의.
2. **영역 권한 — Front/View 한시 권한** — 9.x 기간 동안 `frontend/src/design/components/report/` 컴포넌트의 props/스타일 변경은 Front/View 위임으로 처리. (Claude Design은 optional agent. 9.x 종료 후 권한 정책 재검토.)
3. **데모 페이지 유지** — `/report-demo` NAV 노출 유지. 9.5에서 실제 ReportContainer가 AgentChat에 인라인 들어간 후, 데모 페이지를 fixture 카탈로그/QA 페이지로 정식 운영.
4. **DataRef ref-mode hydration 책임** — 9.5 위임 시 결정 (persistence가 ref→embed 변환을 수행 vs ChartBlock이 ref_id로 fetch). 본 단계에선 placeholder만 렌더.
5. **chart hint props (`x` / `y` / `group_by`)** — 박제만 됨, 미사용. SwitchableViz API에 xField / yFields / groupBy 추가는 9.4 후속 (ROADMAP 또는 9.4 위임 명세에 추가 검토).

#### 9.2 위임 시 헤드업
- `frontend/src/design/types/report.ts` 그대로 첨부 → `backend/tools/build_report/schema.py` pydantic 모델로 1:1 mirror
- DataRef 두 모드 직렬화 형식 그대로
- `chart.data_ref`는 `data_refs[]` 인덱스(int)
- worktree 분리 강제 (`git worktree add ../LosszeroDEMO-backend-infra -b agent/backend-infra origin/main`)

### 9.2 — `build_report` 도구 + ReportSchema pydantic mirror (완료, 2026-04-29)

- 머지 커밋: `--no-ff` merge of `agent/backend-infra` into main
- 신설 파일:
  - `backend/tools/build_report/schema.py` — ReportSchema/ReportBlock/DataRef pydantic 1:1 mirror, `_validate_data_ref_indices` model_validator로 chart.data_ref / highlight.related_data 인덱스 범위 체크
  - `backend/tools/build_report/tool.py` — BuildReportTool (Tool ABC), LLMProvider injectable (`None` 시 RuntimeError), 1회 retry with validation error context, markdown fence strip
  - `backend/tools/build_report/description.md` — LLM-facing 호출 가이드
  - `backend/tools/build_report/__init__.py` — re-export

#### 박제된 결정 / 9.4·9.5 위임 시 인용

1. **Embed-only 모드** — 9.2의 `_build_data_refs`는 모든 `data_results`를 embed로 변환. 임계 100KB / 1000 row는 logging만. **ref 모드 hookup은 9.4(orchestrator 메모리) + 9.5(persistence 시 ref→embed hydrate 후 저장) 영역**.
2. **Provider inject 시점** — `BuildReportTool(llm=provider)`. 9.4 AgentLoop 등록 시 provider 전달 필수. provider 미전달로 등록되면 execute 시 RuntimeError.
3. **LLM 호출 횟수** — 현재 1회 + 검증 실패 시 1회 재시도 = 최대 2회. 분석/요약 분리 여부는 9.4 운영 관찰 후 결정.
4. **markdown fence strip** — LLM이 ```json ... ``` 형태로 감싸는 케이스 방어. 9.3 build_view에도 동일 패턴 권장.
5. **Summary.insights 길이** — pydantic 레벨 제약 없음(`Field(default_factory=list)`). 프롬프트만 "2~5 권장". 운영 관찰 후 strict 필요 시 `Field(min_length=2, max_length=5)` 추가 검토.

#### 9.4 위임 시 헤드업
- `BuildReportTool(llm=<provider>)` 형태로 AgentLoop에 등록 — provider 전달 누락 금지
- `system_base.md` 가이드에 "build_report 호출 조건" 추가 (description.md 본문과 일관)
- Debug Fix 3 (`loop.py:199-202` 도구 결과 wrapping에 `[meta] rows={N}` prepend) 함께 흡수
- Debug Fix 4 (system_base.md "Invalid column name 시 컬럼 추측 금지" 한 줄) 함께 흡수
- SSE `subagent_start` / `subagent_progress` / `subagent_complete` 이벤트 신설
- worktree 분리 강제 (`git worktree add ../LosszeroDEMO-backend-infra -b agent/backend-infra origin/main`)

### 9.3 + 9.4 + 보강 A·B — build_view + AgentLoop 등록 + SSE subagent_* + Debug Fix 3·4 + anti-hallucination guards (완료, 2026-04-29)

- 머지 커밋: `--no-ff` merge of `agent/backend-infra` (6 commits)
- 9.3: `backend/tools/build_view/` 신설 — ViewBundle = enriched ReportSchema + ViewBlockSpec routing, chart 축 보조 LLM(1회) + viz_hint별 deterministic fallback, LLMProvider injectable
- 9.4: `backend/agent/events.py` (SubAgent 3종 + AgentEvent union), `backend/main.py` (provider singleton 그대로 sub-agent 주입), `backend/agent/loop.py` (subagent_* emit + Fix 3 `[meta] rows={N}` prepend), `backend/prompts/system_base.md` (Fix 4 + report pipeline 가이드), `frontend/src/design/types/events.ts` 미러
- 보강 A: `system_base.md` Fix 4 강화 — 3단계 우선순위 (도메인 schema > list_tables > 사용자 질문) + Korean guard 메시지 인지 + Alias 가이드
- 보강 B: `backend/tools/db_query/tool.py` — `_assert_no_korean_in_select` regex 가드 (Hangul + Jamo, AS alias 4가지 패턴 strip 후 SELECT~FROM 구간 검사). 환각 컬럼 SQL을 ValueError로 차단

#### 박제된 결정 / 9.5·9.6 위임 시 인용

1. **subagent_* ↔ tool_start/result 정책** — 본 phase는 양쪽 모두 emit. 9.6 Front/View가 sub-agent를 별도 progress 위젯으로, tool_start/result는 AgentTrace 기존 표시로 분리 운영. (사용자 결정 1.b)
2. **ref-mode hydration** — 본 phase 미적용 (embed-only). 9.5 persistence 시점에 ref → embed hydrate 후 저장. (사용자 결정 2.b)
3. **ViewBundle component routing** — 9.5 frontend 인라인 렌더링은 ViewBundle.blocks의 `component` 필드 신뢰. block.type fallback 제거. (사용자 결정 4)
4. **provider 전역** — `main.py`의 `llm = get_provider()` singleton이 BuildReportTool/BuildViewTool 생성자에 inject. dual provider 동적 전환 시 자동 동기화. (사용자 결정 5)
5. **AS현안 4턴 통합 회귀 — 미실행** — agent worktree에서 LM Studio 라이브 호출 환경 부족. **supervisor/사용자 수동 운영 관찰 필요** — Q3 SQL이 `wb_Title`/`wb_reqDt`/`wb_emFg` 사용 + 환각 시 한글 가드가 차단해 LLM이 도메인 schema 재참조하는지. 미통과 시 Fix 4 추가 강화 또는 별도 Debug 사이클.
6. **`subagent_progress` emit 미사용** — build_report/build_view 내부에서 stage 보고 hookup은 9.5+에서 결정. 현재 start/complete만 발사.

#### 9.5 위임 시 헤드업
- ReportContainer 인라인 렌더링: ViewBundle 신뢰. block.type fallback 제거.
- Persistence: 메시지 메타데이터에 ReportSchema + ViewBundle 첨부. ref → embed hydrate 후 저장 (대화 재현 보장).
- Debug Fix 2 흡수: `_conversations[session_id]`에 AgentLoop messages(시스템 제외) 복사. **MAX_HISTORY 트리밍이 tool_use/tool_result 페어를 깨면 OpenAI/Anthropic 400 에러 → 페어 단위 자르는 가드 필수**.
- Front/View + BackEnd Infra 양 영역 위임 → worktree 2개 분리 또는 순차 실행.
- AS현안 4턴 회귀 통합 검증을 9.5 cycle에 흡수 권장 (Fix 2가 history 보존하면 회귀 통과 가능성 ↑).

#### 9.6 위임 시 헤드업
- subagent_* SSE 핸들러 + UI multi-stage progress 위젯
- tool_start/tool_result는 기존 AgentTrace 그대로 (양 가시성 동시 노출)
- 9.5 머지 후 시작
- subagent_* 이벤트는 9.5-front에서 이미 traceEvents에 capture됨 (`useAgentStream.ts`) — 9.6은 UI 핸들링만 추가

### 9.5 — 인라인 ReportContainer + persistence + Fix 2 (완료, 2026-04-29)

- 머지 커밋 2개 (--no-ff): `agent/front-view` (9.5-front) + `agent/backend-infra` (9.5-back)
- **9.5-front**:
  - `frontend/src/design/types/view.ts` 신설 — ViewBundle / ViewBlockSpec mirror
  - `frontend/src/design/components/report/ReportContainer.tsx` — 옵션 `blockSpecs` prop, ViewBlockSpec.component 신뢰 라우팅 + block.type fallback 보존
  - `frontend/src/framework/hooks/useAgentStream.ts` — build_report/build_view tool_result capture, final 시점에 message attach
  - `frontend/src/framework/hooks/useConversationStore.ts` — localStorage 라운드트립
  - `frontend/src/framework/pages/AgentChatPage.tsx` — splitMessagesForReports + 인라인 ReportContainer
- **9.5-back (Fix 2 흡수)**:
  - `backend/agent/history.py` 신설 — `trim_history_safely` (페어 가드) + `normalize_for_persistence` (system 필터, ref→embed stub)
  - `backend/agent/loop.py` — `_final_messages` 속성 + `get_final_messages()` (3개 종료 경로 모두에서 messages 보관)
  - `backend/main.py` — 성공 시 `_conversations[session_id]` 전체 교체, 에러 시 fallback. AgentLoop tool_use/tool_result 페어 보존. MAX_HISTORY 트리밍 페어 가드 적용
- **Cleanup commit (supervisor 직접)**:
  - `design/types/events.ts` 도메인 분리 → `chat.ts` (ChatMessage + Conversation, reportSchema/viewBundle 옵션 통합), `result.ts` (ResultEntry), `events.ts` (SSE 미러만)
  - `framework/hooks/types.ts` 제거 — EnrichedChatMessage 우회 해소
  - import 경로 갱신 9 파일 (5 design/, 4 framework/)
  - `pnpm exec tsc --noEmit` 0 error

#### 박제된 결정

1. **ChatMessage 단일 진실원** — `design/types/chat.ts`에 통합. EnrichedChatMessage 패턴 폐기.
2. **잠금 단위 미세화** — 파일 단위 X, **section/symbol 단위로 명시**. 위임 명세 작성 시 단위 명시 박제.
3. **events.ts 단일 책임** — backend SSE 미러만 담당 (AgentEvent + *Event + VizHint). 코드 내 `// LOCKED:` 주석으로 박제됨.
4. **AS현안 4턴 회귀** — 본 phase 미수행. **Phase 9 종료 후 supervisor/사용자 수동 검증** (Fix 1 sticky + Fix 2 history + Fix 3 row meta + Fix 4 prompt + 한글 가드 종합 효과).

---

## 8. Locks — 현재 활성 잠금 (Locks Registry)

위임 명세 작성 시 본 표를 인용. 잠금 단위는 **파일 통째 X — section/symbol 명시**.

| Scope | 위치 | 잠금 사유 | 만료 |
|---|---|---|---|
| `AgentEvent` union + `*Event` 클래스 + `VizHint` | `frontend/src/design/types/events.ts` | backend SSE 미러 무결성 | 영구 (backend SSE 변경 시 동기화) |
| `ReportSchema` / `ReportBlock` / `DataRef` | `frontend/src/design/types/report.ts` (전체) | 9.x 인터페이스 계약 (frontend ↔ backend pydantic mirror) | 9.x 종료 시 |
| `ViewBundle` / `ViewBlockSpec` | `frontend/src/design/types/view.ts` (전체) | 9.x 인터페이스 계약 | 9.x 종료 시 |
| `BuildReportTool` 인터페이스 (input/output) | `backend/tools/build_report/{tool.py, schema.py}` | 9.x 인터페이스 계약 | 9.x 종료 시 |
| `BuildViewTool` 인터페이스 (input/output) | `backend/tools/build_view/{tool.py, schema.py}` | 9.x 인터페이스 계약 | 9.x 종료 시 |
| design/components/report/* props | `frontend/src/design/components/report/` | 9.x 동안 Front/View 한시 권한 (props 변경은 supervisor 합의) | 9.x 종료 시 |

### 영역 권한 (영구 — agent-prompts에 박제됨)

- design/ ↔ framework/ 의존: framework는 design import 가능, design은 framework import 금지 (TweaksPanel 1 예외)
- per-role 영역: `backend/` (BackEnd Infra / DB Domain Manager), `frontend/src/framework/` (Front/View), `frontend/src/design/` (Claude Design — optional, 본 9.x는 Front/View 한시 권한)

### 잠금 정책 (운영 메모)

- **위임 명세에 잠금 단위 명시**: "X 파일 통째 변경 금지" 회피. "X 파일 안의 Y symbol/section만 변경 금지" 또는 "X 파일의 일반 영역은 자유".
- **충돌 발생 시 해결 우선순위**: 1) 우회 (EnrichedChatMessage 같은 framework 측 확장) → 머지 가능. 2) 충돌 자체를 구조적 리팩터로 해소 (events.ts 도메인 분리 같은) → 미래 충돌도 예방.
- **잠금 추가/만료 시점**: supervisor가 본 §8 표를 갱신.

