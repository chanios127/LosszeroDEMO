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

---

## 9. Phase 9 클로즈 (2026-04-29)

### 9.6 — SubAgentProgress 위젯 (완료, Sonnet 4.5 파일럿)

- 머지 커밋: `--no-ff` merge of `agent/front-view` (1 commit)
- 신설: `frontend/src/design/components/SubAgentProgress.tsx` — `deriveStages` (events → ordered Stage[]), 스트리밍 중 vertical card with IconSpinner + Dot pulse + latestStage hint, 종료 시 1줄 collapsed (IconCheck + name list)
- 수정: `frontend/src/design/components/MessageThread.tsx:235-241` — AssistantBubble 내부 마운트 (CollapsibleTrace 위, ThinkBlock 아래)
- 검증: `pnpm exec tsc --noEmit` 0 error, design 내부 import only

### Phase 9 전체 요약 (9.1 ~ 9.6 완료)

3-stage sub-agent pipeline 도입 완료:
- AgentLoop(outer ReAct) ⊃ db_query / list_tables / sp_call (SubAgent1) + build_report (SubAgent2) + build_view (SubAgent3)
- LLM 자율 라우팅 (시스템 프롬프트 가이드 + description.md 명세)
- ReportSchema → ViewBundle → 인라인 ReportContainer 렌더 chain
- SSE subagent_* 이벤트 + UI multi-stage progress (양 가시성)
- Persistence: 메시지 메타데이터 (reportSchema + viewBundle) localStorage 보존
- Debug Fix 1·2·3·4 + 보강 A·B 모두 흡수 머지

### Sonnet 4.5 파일럿 평가 (9.6 케이스 기준)

| 항목 | 결과 |
|---|---|
| 코드 품질 | Opus 동등 |
| tsc 0 error | ✅ |
| 영역 침범 | 0 |
| Props 인터페이스 명세 충실도 | ✅ |
| CSS 토큰 사용 | ✅ |
| 기존 컴포넌트 재사용 (Dot, IconCheck/Spinner) | ✅ |
| 자율 결정 영역 처리 | OK (배치/layout/collapsed 모두 합리적) |
| 회신 §자율 결정 보고 | 🟡 빈칸 (Opus는 통상 채움) |
| Type union 전 값 흡수 (`error` 상태) | 🟡 누락 (running/complete만 구현) |
| 명세 한글 매핑 흡수 | 🟡 누락 (영문 그대로) |
| 영역 권한 자율 인지 | ✅ "본 세션 권한 반납 권장" 회신 |

**결론**: Sonnet 4.5는 90% 명세 충실 + 코드 품질 동등. **향후 Sonnet 위임 시 명세 보강 포인트**:
1. "회신 §자율 결정 사항을 반드시 채울 것 (이유 1줄)" 명시 강화
2. "박제된 type union의 모든 값을 처리할 것" 명시 (예: error 상태 case)
3. "사용자 가시 텍스트 명세(한글 매핑 등)는 cosmetic이라도 명세대로" 명시

향후 운영: 
- 단순 영역 (UI hookup, 단일 파일 작업) → Sonnet
- 복잡한 cross-file refactor / 영역 충돌 우회 판단 / 패턴 추출 → Opus
- supervisor / Debug → Opus 유지

### Phase 9 종료 후속 작업 (별도 사이클)

1. **AS현안 4턴 통합 회귀** — supervisor/사용자 수동 검증. Fix 1·2·3·4 + 한글 가드 종합 효과 확인:
   - Q3 SQL이 `wb_Title`/`wb_reqDt`/`wb_emFg` 사용 (한글 가드 효과)
   - 모든 턴 system_total_len > 0 (Fix 1 sticky)
   - tool_use/tool_result 페어 보존 (Fix 2 history)
   - 행수 meta가 LLM에 도달 (Fix 3)
   - 환각 시 Fix 4 + 한글 가드 ValueError → LLM 회복 (도메인 schema 재참조)
2. **9.6 부분 명세 미흡수 후속** (선택): SubAgentProgress의 error 상태 + 한글 stage 매핑. supervisor 직접 또는 별도 Front/View 사이클.
3. **ROADMAP 후보**:
   - HITL 게이트 (provider 분기) — db_query SQL 승인 게이트 검토
   - ReportSchema 점진 블록 (`table`, `comparison`, `kpi_grid`)
   - View 카탈로그 확장 (`TimeSeriesPanel`, `HeatmapCalendar`)
   - SubAgent 카탈로그화 (anomaly_detector 등)

### Phase 9 잠금 만료

§8 Locks Registry의 "9.x 종료 시" 만료 항목들은 Phase 9 클로즈 시점에 일괄 해제 또는 후속 phase로 이월:
- `ReportSchema` / `ReportBlock` / `DataRef` — 운영 안정성 검증 후 만료
- `ViewBundle` / `ViewBlockSpec` — 동상
- `BuildReportTool` / `BuildViewTool` 인터페이스 — 동상
- `design/components/report/` Front/View 한시 권한 — Phase 10 시점에 Claude Design 재이양 vs Front/View 영구 결정

본 잠금 만료 결정은 AS현안 회귀 통과 후 별도 사이클로 처리.

---

## 10. Phase 9 hotfix (2026-04-29 — supervisor 직접)

### 회귀 도중 발견된 이슈
사용자가 LM Studio 환경에서 "직원별 최근 업무일지 조회" → "직원들 업무 유형 분석" 2턴 회귀 실행 중 build_report 단계에서 chain 중단 발견. log + 스크린샷 trace로 본질 원인 3종 진단:

1. **`<think>` 블록 미처리** — `tools/build_report/tool.py`의 fence strip이 ```` ``` ```` 만 처리. qwen-style LM Studio 모델이 reasoning chain을 `<think>...</think>`로 emit → `json.loads('<think>...')` → JSONDecodeError → RuntimeError. 1회 retry도 같은 패턴이라 실패 → outer AgentLoop 회복 시도 → LM Studio `httpx.ReadTimeout`로 종결 → frontend "SSE connection lost".
2. **`tools/build_view/tool.py`도 동일 위험** — `_infer_axis`의 보조 LLM 호출 path에 같은 fence strip만 있음. try/except로 silently fallback하지만 정확도 저하.
3. **9.6 SubAgentProgress가 error 상태를 complete로 misrepresent** — Sonnet 파일럿에서 누락 평가했던 부분. 실제 사용자 화면에 "1 sub-agent complete: build_report" 표시되어 잘못된 정보 전달. 동시에 한글 stage 라벨(`build_report` → "분석 보고서 생성") 누락.

### 적용된 hotfix (commit `e2197d1`)
- `backend/tools/build_report/tool.py` — `_THINK_RE` regex로 `<think>...</think>` 일괄 제거. asymmetric residue도 방어. fence strip 직전에 적용
- `backend/tools/build_view/tool.py` — 같은 패턴 적용
- `frontend/src/design/components/SubAgentProgress.tsx` —
  - `Stage.status` union에 `"error"` 추가
  - `subagent_complete.output_summary`가 `"Error:"`로 시작하면 error 상태로 분기 (backend `loop.py`가 이미 prefix 적용 중)
  - error 상태: `IconAlert` + `var(--danger)` 색상 (확장 카드 + 1줄 collapsed 양쪽)
  - `STAGE_LABEL` lookup: build_report → "분석 보고서 생성", build_view → "시각화 구성"

### 검증 상태
- backend: `from main import app` + Tool import OK
- frontend: `pnpm exec tsc --noEmit` 0 error
- **수동 회귀는 미수행** — 사용자가 다음 세션에서 backend 재시작 후 같은 multi-turn 시나리오 재시도 권장

### 부수 관찰 (다음 사이클 후보)
- **LM Studio `model='(unset)'`** — 환경 변수 누락 의심. backend env 점검 필요 (HotfIX 영역 외)
- **httpx timeout 명시 부재** — `backend/llm/lm_studio.py`의 AsyncClient timeout 설정 점검. 기본값에 의존 X
- **영문 컬럼 환각**은 한글 가드(보강 B)가 못 잡음. 첫 SQL 시도가 `Title` / `Today` 같은 영문 환각 → 'Invalid column name' 에러로 LLM 자체 회복(Fix 4 효과). 그러나 회복 round-trip 비용 1회 발생. **도메인 schema 화이트리스트 검증(보강 C 후보)**가 본질 해결책.

---

## 11. 다음 supervisor 세션 인계 — Phase 9 종료 후 후속 우선순위

본 supervisor 세션은 Phase 9 클로즈 + hotfix 직후 비움. 새 supervisor 세션이 우선순위 결정용으로 본 §11 참조.

### 즉시 (검증 + 작은 정리)
1. **수동 multi-turn 회귀 재실행** (사용자 환경) — hotfix 이후 직원별 업무일지 분석 또는 AS현안 4턴 재현. 통과 시 §8 Locks 만료 진입. 미통과 시 추가 hotfix
2. **§8 Locks 만료 결정** — 수동 회귀 통과 후 ReportSchema/ViewBundle/build_*Tool 인터페이스 잠금 해제. 본 §8 표 갱신
3. **`design/components/report/` 권한 재이양 결정** — Front/View 한시 → 영구 vs Claude Design 복귀

### 단기 (Phase 9 잔재 정리 / 후속 hotfix)
4. **LM Studio 환경 정리** — `model='(unset)'` 원인 추적 + 명시 설정. `backend/llm/lm_studio.py`의 httpx timeout 환경변수화 (예: `LMSTUDIO_TIMEOUT_SEC`, default 300)
5. **도메인 schema 컬럼 화이트리스트 검증 (보강 C)** — `tools/db_query/tool.py`에 SELECT 컬럼이 도메인 schema 정의 컬럼인지 검증. 한글/영문 환각 모두 catch. 한글 가드의 본질 후속

### 중기 — Phase 10 후보
6. **HITL 게이트** — provider별 분기. 본 hotfix 회귀에서 build_report 실패 후 1턴 만에 명시적 회복 가능했음 → HITL이 build_report 출력 직후 사용자 검수 게이트로 가치 ↑
7. **ReportSchema 점진 블록** — `table` (실 수요 빈번), `comparison`, `kpi_grid`. 9.x 잠금 해제 후
8. **View 카탈로그 확장** — `TimeSeriesPanel`, `HeatmapCalendar` (시계열)
9. **SubAgent 카탈로그화** — base class 추출, `comparison_agent` / `anomaly_detector` 등록 패턴 표준화

### 운영 / 인프라
10. **Sonnet 다운그레이드 정식 적용** — 9.6 파일럿 평가 기반 (§9). 명세 보강 포인트 3종 적용 후 Front/View / DB Domain Manager / BackEnd Infra(단순 영역) → Sonnet
11. **agent-prompts/README.md** — §8 Locks Registry 인용 가이드 + 잠금 단위 명시 표준 추가
12. **세션 영속화** — 현 `_conversations` in-process. SQLite/Redis 마이그레이션 (장기)

### Phase 9 영구 잔재 (운영 관찰)
- **AS현안 4턴 통합 회귀** — Phase 9 close 시점 미실행 박제 (§7 항목 4). 사용자 직접 검증 필요
- 본 hotfix가 think strip을 해결했지만 다른 reasoning 마커 (`<reasoning>`, `<scratchpad>` 등) 출현 가능 — 발견 시 동일 패턴 적용

---

## 12. Phase 10 SKILL Architecture — Step 1+2 클로즈 (2026-04-30)

직전 supervisor 세션(본 세션)이 multi-turn 회귀(`직원별 최근 업무 일지... 시각화`)에서 **D7 한글 가드 false positive 16턴 trap** 실측. 분석 결과 5 root cause("프롬프트 자산 파편화")로 수렴 → `error-case.md` + `plans/PHASE10-skill-architecture.md` 박제 → backend-infra 위임.

### 마스터 plan
`plans/PHASE10-skill-architecture.md` — 4-step 마이그레이션. 본 사이클은 Step 1 + Step 2 완료. Step 3 (SKILL.md 표준 + `prompts/loader.py`)와 Step 4 (`agents/` 디렉토리)는 별도 사이클.

### Step 1 — `prompts/rules/` 신설 + D7 가드 fix (commit `8366824`)
- `backend/prompts/rules/` 신설 5개 — `korean-sql.md`(E7), `result-size.md`(E1), `error-recovery.md`(E6 이전), `report-block-types.md`(D5/D1, Step 2 입력), `json-output.md`(D6, Step 2 입력)
- `backend/prompts/system_base.md` — `## Korean text in SQL (strict)` + `## Result size` 신설, `## Error recovery` 갱신. 본 단계는 **수동 인용**(SST는 rules/, system_base는 cache·임시 인용). Step 3 loader 도입 시 자동화로 전환.
- `backend/tools/db_query/tool.py:52-77` — `_assert_no_korean_in_select` 정규식에 single-quoted literal strip 추가 (D7 false-positive 본질 해소). 에러 메시지 갱신: "Korean column or string literal detected outside alias/literal context..."

### Step 2 — Sub-agent system prompt 외부화 (commit `ffababa`)
- `backend/tools/build_report/system.md` 신설 (2783 chars) — 인라인 본문 + D5(block enum strict) + D1(`highlight.message` REQUIRED) + D6(backslash escape) hardening 흡수. `tool.py`는 `Path(__file__).parent / "system.md"` 로드.
- `backend/tools/build_view/system.md` 신설 (790 chars) — 보조 LLM 축 추론 프롬프트 외부화 + D6 hardening.

### 머지 (commit `86ed1dd`)
agent ad-hoc 6 케이스 모두 통과:
- T1: `CASE WHEN x LIKE '%성수기전%' THEN '고객지원' ... AS [업무분류]` → 통과 (D7 trap 해소 ✅)
- T2: `SELECT 담당자명 FROM t` (bare Korean) → 거부 ✅
- T3: alias 다중 (`AS [담당자]`, `AS [거래처]`) → 통과
- T4: `CASE WHEN 직위 = '사장'` (bare Korean inside CASE) → 거부 (false negative 방지)
- T5: `WHERE wb_Title LIKE '%성수기%'` → 통과
- T6: 순수 ASCII control → 통과

import OK (15 routes), `BuildReportTool()` / `BuildViewTool()` 인스턴스 생성 OK.

### error-case.md 상태 갱신
**🔴 → 🟠 (proactive prompt + reactive guard 짝 fix 완수, 라이브 회귀 대기)**:
- D7 (한글 가드 false positive 16턴 trap)
- D7-수반 (가드 메시지가 LLM에 잘못된 진단 주입)
- E7 (한글 컬럼 사전 금지 규칙 부재)
- D5 (`metric_group` block type 환각)
- D6 (build_report invalid JSON escape)
- D1 (highlight.message 누락)
- E1 (TOP N 강제 규칙 부재 — prompt only, code cap 미적용 → 잔재)

**자연 해소 후보** (D7 trap 해소 시 종속):
- D8 (SQL retry degeneration)
- A2-b (context bloat 빈 응답 — 16턴 trap 후 LLM 포기)
- C2 (텍스트 본문 raw SELECT — system_base.md `## Result size` 가이드)

**P0 잔재** (별도 사이클 필요):
- A3 (httpx timeout 환경변수화) — `backend/llm/lm_studio.py`
- B4 (AgentLoop circuit breaker) — `backend/agent/loop.py`
- C1 (db_query 코드-level 1000행 cap) — prompt 가이드만으로는 불충분
- A1 (LM Studio Jinja chat_template — `gemma-4-26b-a4b` 모델 quirk) — 모델 교체 후 재현 검증

### 박제된 결정 / 다음 세션 인용

1. **Single Source of Truth = `prompts/rules/`** — system_base.md는 본 phase 동안 캐시·임시 인용. Step 3 loader 도입 시 인용 부분 제거.
2. **rules/ 5개 파일 frontmatter 미부여** — Step 3에서 도입. 본 단계는 self-contained markdown.
3. **Sub-agent system prompt 외부화 패턴** — `<tool>/system.md` + `tool.py`가 startup load. 향후 SubAgent 추가 시 동일 패턴.
4. **위험 영역 변경 모두 사전 합의됨** — 시스템 프롬프트(`system_base.md`, `system.md` 2종) + 가드 정규식(`_assert_no_korean_in_select`) + sub-agent 인터페이스 비변경(잠금 무위반).

### 다음 세션 후속 (§11 갱신)

**즉시 (사용자 환경 의존)**:
1. **수동 multi-turn 회귀** — backend 재시작 후 다음 시나리오:
   - "직원별 최근 업무 일지... 시각화" — D7 trap 미발생 + build_report 정상 chain 확인
   - AS현안 4턴 시나리오 — Q3에서 한글 string literal 통과 + Fix 1·2·3·4 종합 효과
2. **회귀 통과 시** — `error-case.md` 🟠 → 🟢 일괄 갱신 + §8 Locks Registry "9.x 종료 시" 만료 항목 해제 진입
3. **회귀 미통과 시** — debug-hotfixer 세션(별도 cold-start `debugHotfixerSnapshot.md`)에서 deep-dive 분석 → main supervisor가 fix 위임

**단기 (P0 잔재)**:
4. A3 httpx timeout 환경변수화 (`backend/llm/lm_studio.py:143-146`) — BackEnd Infra 1회 단발
5. C1 db_query 코드-level row cap (1000) — BackEnd Infra
6. B4 AgentLoop circuit breaker — `backend/agent/loop.py` 동일 에러 N회 abort
7. A1 LM Studio 모델 교체 (gemma-4-26b-a4b → Qwen3 / Qwen2.5-Coder / Llama 3.x) — 사용자 환경

**중기 (Phase 10 Step 3)**:
8. SKILL.md 표준 도입 + `backend/prompts/loader.py` — frontmatter parsing + applies_to 라우팅 + system 프롬프트 자동 합성
9. `description.md` deprecate (SKILL.md `## Description`이 대체)

**Phase 10 잔재**:
10. Step 4 — `backend/agents/` 디렉토리 + SubAgent 카탈로그 README
11. SubAgent 카탈로그화(snapshot §11 중기 #9 — `comparison_agent`, `anomaly_detector` 등) — Step 3·4 완료 후

### 병행 트랙 — debug-hotfixer 세션
새 supervisor 세션(`debugHotfixerSnapshot.md`)이 error-case.md 분석 + reports/error-analysis/ 작성에 특화. main supervisor / backend-infra와 영역 분리됨. 병행 작업 가능.

### 갱신 필요 문서 (Phase 10 Step 3 완료 시)
- SPEC.md §7.1 — 시스템 프롬프트 구성 다이어그램에 `prompts/rules/` 추가
- ROADMAP.md — Phase 10 SKILL Architecture 섹션 신설
- HANDOFF.md — 새 도구·sub-agent 추가 가이드 (SKILL.md 표준)
- agent-prompts/README.md — rules/ 영역 권한 가이드
- supervisorSnapshot.md §8 — SKILL.md 표준을 새 잠금 후보로 검토

---

## 13. Phase 11 — build_report 안정화 + Provider 인터페이스 가변화 — Backend 사이클 클로즈 (2026-04-30)

직전 supervisor 세션이 Phase 10 Step 1+2 라이브 검증 결과를 분석. D7 fix 라이브 통과 입증 + 새/재발현 본질 발견 → 본 사이클 plan 박제 → backend-infra 위임 → 머지 완료. Frontend 사이클(B-6)은 별도 위임 대기.

### 마스터 plan
`C:\Users\chanios127\.claude\plans\fluttering-launching-trinket.md` (사용자 plan dir, 본 세션 active plan). Phase 11 = build_report 안정화 + Provider 인터페이스 가변화 + reasoning 모델 안정성. Backend(A+B-1~5+C+D+A3+G7) + Frontend(B-6+F7+vite.config) 분리.

### Backend 사이클 (commits + merge)
- `464d74d` phase11(provider): LLMProvider.complete signature 확장 (max_tokens, thinking_*) + claude/lm_studio 구현. claude `max_retries=0` (A6). lm_studio httpx.Timeout 환경변수화 (A3).
- `f2ac33a` phase11(loop): AgentLoop 옵션 forward + sub-agent tool에 `set_llm_options()` 호출 (B-2)
- `8d11067` phase11(build_report): `_truncate_data_results` (BUILD_REPORT_MAX_CELL_CHARS=200, MAX_ROWS=30) + sub-agent 옵션 받음 (A)
- `61d0e9c` phase11(api): QueryRequest 옵션 3개 + `/api/defaults` endpoint + .env.example 갱신 (B-3+B-4+B-5)
- `aaaef43` phase11(sse): event_generator heartbeat 15s (G7)
- `7a45c17` merge

### 검증 통과
- `from main import app` import OK, 16 routes (15 + `/api/defaults`)
- `ClaudeProvider().client.max_retries` = 0
- `LMStudioProvider()._client.timeout` = `Timeout(connect=10.0, read=600.0, write=30.0, pool=30.0)`
- `_truncate_data_results` 단위 동작 확인
- thinking_enabled=True on LM Studio → warning emit + ignore

### error-case.md 상태 갱신
- **🟢 처리완료**: A3 (httpx timeout), G7 (SSE heartbeat), C2 (build_report input cap)
- **🟠 부분처리 (라이브 회귀 대기)**: D6 (max_tokens 가변 + cap), D5 (block enum strict via system.md), D1 (highlight.message), A6 (SDK 폭주 차단, agent-level backoff 별도)

### 박제된 결정 / 다음 세션 인용

1. **`LLMProvider.complete` keyword-only 옵션 확장** — backend-infra.md §5.2 위험 영역. supervisor 사전 합의 박제됨. 후속 caller(Anthropic SDK + LM Studio + 미래 provider)는 동일 시그니처 채택.
2. **Sub-agent 옵션 전파 = `set_llm_options()` setter** — 매 turn 시작 시 AgentLoop가 sub-agent tool 인스턴스에 옵션 inject. Tool.execute 시그니처 무변경 (잠금 무위반).
3. **Provider env 표준** — `CLAUDE_MAX_TOKENS=10000`, `CLAUDE_THINKING_BUDGET=4096`, `LM_STUDIO_MAX_TOKENS=10000`, `LM_STUDIO_TIMEOUT_READ=600`, `LM_STUDIO_TIMEOUT_CONNECT=10`, `BUILD_REPORT_MAX_CELL_CHARS=200`, `BUILD_REPORT_MAX_ROWS=30`, `SSE_HEARTBEAT_SEC=15`.
4. **Anthropic SDK auto-retry 차단 (A6)** — `max_retries=0`. 우리 agent loop가 backoff 결정 (현재는 즉시 ERROR propagate, agent-level backoff는 B4 사이클).
5. **Thinking 미지원 모델 silent ignore + warning** — claude-3.5-haiku 등 미지원 시 옵션 무시하고 warning 1줄. 모델 capability 검사는 SDK server-side reject에 의존.

### 다음 세션 후속 (§11 갱신 사항)

**즉시 (사용자 환경 의존)**:
1. **Frontend 사이클(B-6) 위임** — `agent/front-view`. 범위:
   - useTweaks.ts: Tweaks 인터페이스에 `maxTokens` / `thinkingEnabled` / `thinkingBudget` 추가 + localStorage migration
   - TweaksPanel.tsx: "LLM" 섹션 신설 (Slider + Toggle + NumberInput). provider==claude일 때만 thinking 컨트롤
   - primitives.tsx: Slider primitive 신설
   - useAgentStream.ts: POST body 확장 (max_tokens / thinking_*)
   - App.tsx 또는 root: startup에 `/api/defaults` fetch + tweaks hydration
   - **F7 검증**: reasoning 모델에서 빈 `💬` → 빈 assistant bubble. AssistantBubble 빈 content hide 또는 placeholder
   - **vite.config.ts SSE 안전 설정**: proxy `timeout: 0, proxyTimeout: 0` (G7 backend heartbeat와 짝)
2. **수동 multi-turn 회귀** — Frontend 머지 후 백엔드 재기동 + TweaksPanel에서 max_tokens=12000 + thinking ON 시도. 본 시나리오 ("직원별 최근 업무 일지... 시각화") chain 끝까지 통과 확인. 통과 시 D6/D5/D1/A6 → 🟢.

**P0 잔재** (별도 사이클):
3. **B4 — AgentLoop circuit breaker** (동일 에러 N회 abort)
4. **C1 — db_query 코드-level 1000행 cap**
5. **B1·B2·B3 — tool input validation** (build_report/build_view 빈 dict 방어 + loop.py error wrapping)

**중기 — Phase 12 후보 (외부 진단 박제)**:
6. **main.py 3-split** — `app.py` (FastAPI 라우터) + `session.py` (SessionManager) + `orchestration.py` (agent loop 구동). 638줄 monolith가 기능 추가 병목으로 작용. agent/loop.py·llm/·tools/·domains/·db/는 단일 책임 OK 평가됨.
7. **LLM helper 공통화** — `backend/llm/helpers.py:call_llm_for_json()`. build_report·build_view의 fence/think strip + JSON parse + retry 로직 (~80줄 중복) → 공통 helper 추출. **다음 sub-agent 추가 전에 처리** (snapshot §11 중기 #9 SubAgent 카탈로그화 직전).

**Phase 10 잔재**:
8. **Step 3** — SKILL.md 표준 + `backend/prompts/loader.py` (frontmatter parsing + applies_to 라우팅). 본 phase 이전 박제.
9. **Step 4** — `backend/agents/` 디렉토리

### 본 사이클 변경 영역 + 다음 사이클 충돌 가드

본 사이클이 만진 파일: `backend/llm/{base,claude,lm_studio}.py` + `backend/agent/loop.py` + `backend/tools/build_report/{tool.py,system.md}` + `backend/tools/build_view/tool.py` + `backend/main.py` + `backend/.env.example`.

- **Frontend 위임(B-6)** — backend 영역 무영향. worktree 분리 강제.
- **Phase 12 main.py split** — main.py 638줄을 통째 분리. 본 사이클 머지 후 진입 권장 (충돌 zone 정리됨).
- **B4/C1/B1·B2·B3** — 본 사이클 영향 영역 일부 겹침(loop.py, db_query/tool.py 등). 순차 권장.

### 갱신 필요 문서
- SPEC.md §4 API: `/api/query` body 옵션 3개 + `/api/defaults` endpoint
- SPEC.md §7 LLM: `LLMProvider.complete` 시그니처 변경
- ROADMAP.md: Phase 11 backend 완료
- HANDOFF.md: per-request LLM tuning 패턴 박제 검토

---

## 14. Phase 10 Step 3 — SKILL.md 표준 + prompts/loader.py 클로즈 (2026-04-30)

Phase 10 SKILL Architecture의 마지막 핵심 단계. Step 1·2 머지 후 박제만 됐던 항목. backend-infra 위임 → 머지 완료. 본 사이클로 **error-case 구조적 테마 1·2·3·5 root 해소**.

### 마스터 plan
`plans/PHASE10-skill-architecture.md` (Step 3 본문 포함). 본 사이클 = Step 3만, Step 4 (`backend/agents/` SubAgent 카탈로그)는 별도.

### 사이클 (commits + merge)
- `bb4bcc3` step3(loader): SKILL/rules loader + frontmatter parser (`backend/prompts/loader.py` 249 lines, lru_cache, minimal-regex parser, PyYAML 의존 회피)
- `ad92719` step3(rules): 5개 rule 파일에 frontmatter 추가 (name/type/version/applies_to/referenced_by)
- `c899aef` step3(skills): 5개 도구에 SKILL.md 신설 (frontmatter + Description / Rules / Guards / Errors / Examples)
- `5fcf13a` step3(integrate): `llm/base.py` `load_base_system_prompt()` → loader 위임. `tools/base.py` `Tool.description` default impl. 5개 tool.py가 `_DESCRIPTION` 모듈 변수 + override 모두 제거. build_report/build_view tool.py가 `loader.get_subagent_system()` 호출
- `2705913` step3(cleanup): 5개 description.md 삭제 + system_base.md 다이어트 (rules/로 이전된 3 섹션 제거)
- `f9c1e39` merge

### 검증 통과 (12087 chars system prompt baseline)
- `from main import app` import OK, 16 routes (Phase 11 baseline 동일)
- `loader.load_all_rules()` 5개 / `load_all_tool_skills()` 5개
- `loader.build_system_prompt()` 12087 chars (system_base + 3 system_prompt rules + 5 tool addenda)
- `Tool.description` ABC default == `tool.schema()["description"]` 5개 모두 일치
- `loader.get_subagent_system("build_report")` 3271 chars / `("build_view")` 790 chars (기존 system.md 본문)

### 박제된 결정 / 다음 세션 인용

1. **SKILL.md 표준 frontmatter** — `name / type / version / applies_to / required_rules / sub_agent_system?`. `applies_to` ∈ {tool_description, system_prompt_addendum, system_prompt}. type ∈ {tool, sub_agent, rule}.
2. **`backend/prompts/loader.py` minimal-regex parser** — PyYAML 의존 회피. 키:값 + 들여쓴 리스트 + `[a,b,c]` 형식만 지원. lru_cache로 startup 1회 read.
3. **Single Source of Truth = SKILL.md / rules/** — system_base.md는 core(name resolution / anti-hallucination / 시각화 / report pipeline)만 보유. rules/ 본문은 loader 자동 collect, system_base.md에 인용 X.
4. **Tool.description ABC default** — tool 인스턴스의 `description` property는 자동으로 `loader.get_tool_description(self.name)` 호출. 도구별 override 불필요. 5개 도구 모두 default 사용.
5. **시스템 프롬프트 sequence** — system_base → korean-sql → result-size → error-recovery → tool addenda(db_query / list_tables / sp_call / build_report / build_view 순). Step 1·2 manual concat과 sequence 동치 + tool addenda 신규.
6. **새 도구 추가 워크플로우** — 디렉토리 1개 + SKILL.md 1개 + tool.py만으로 끝. description.md / 시스템 프롬프트 직접 read / Tool.description override 불필요. SubAgent 카탈로그화(Phase 10 Step 4 + snapshot §11 중기 #9) 시 표준 따라 1개씩 추가.

### error-case 구조적 테마 🟢 일괄 처리
- **Theme 1 (프롬프트 파편화)** — rules/ + SKILL.md + loader 자동 합성으로 ad-hoc 위치 결정 마찰 0
- **Theme 2 (sub-agent 인라인)** — system.md 외부화 (Step 2) + `loader.get_subagent_system()` (Step 3)
- **Theme 3 (reactive guard ↔ proactive prompt 분리)** — SKILL.md `## Rules` + `## Guards` 짝 표준
- **Theme 5 (미래 SubAgent debt)** — SKILL.md 표준화로 새 도구 추가 디렉토리 1개로 끝

**Theme 4 (가드 메시지가 회복 단서)**는 `## Errors` 섹션 표준 도입으로 framework 마련됨, individual error 메시지 갱신은 case-by-case로 별도 사이클.

---

## 15. Phase 11 Frontend (B-6) 클로즈 (2026-04-30)

Phase 11 Backend(§13)와 짝. TweaksPanel에 max_tokens / thinking 컨트롤 노출 + F7 빈 assistant bubble 가드 + vite SSE proxy 보강.

### 사이클 (commits + merge)
- `a2ca3b4` front(tweaks): Tweaks 인터페이스 확장 (`maxTokens`/`thinkingEnabled`/`thinkingBudget`) + Slider primitive + `readStoredLlmOptions()` util + localStorage backward-compat (v1 key, spread default)
- `eb03c01` front(api): `useServerDefaults()` hook 신설 + useAgentStream POST body 확장 (`max_tokens`/`thinking_enabled`/`thinking_budget`, localStorage 직접 read — 이중 상태 sync 회피) + App.tsx에 useServerDefaults() 호출
- `c7830ef` front(panel): TweaksPanel "LLM" 섹션 (Slider + thinking_supported일 때만 Toggle + budget Slider)
- `daf513b` front(message): F7 AssistantBubble null guard — 정밀 조건 (`!hasVisibleText && !isStreaming && !hasThinkContent && !hasTraceEvents && !hasInlineData && !hasReportContent`)
- `323a9b6` front(vite): proxy `timeout: 0, proxyTimeout: 0` (SSE-safe, backend G7 heartbeat과 짝)
- `4a529d1` merge

### 검증 통과
- `pnpm exec tsc --noEmit` 0 error
- localStorage migration backward-compat (v1 key, spread default 자동 채움)
- TweaksPanel 신구 섹션 모두 정상 (Theme/Density/SidebarStyle/ChartPalette/Debug + LLM)
- F7 정밀 조건 — think/inline viz/trace/streaming 케이스 모두 보존

### 박제된 결정

1. **localStorage migration backward-compat** — v1 key 유지. `{ ...DEFAULTS, ...JSON.parse(stored) }` 스프레드로 신규 필드 누락 자동 채움. v2 key 변경 불필요.
2. **tweaks 전파 = `readStoredLlmOptions()` send 시점 직접 read** — useTweaks 훅 호출(이중 상태 sync 위험) 회피. send 시점 항상 최신 localStorage 값 사용.
3. **F7 정밀 조건** — content empty + tools 없음 + report 없음 + think 없음 + inline viz 없음 + trace 없음 + streaming 아님 모두 동시 만족 시에만 null. 보존 케이스 누락 0.
4. **vite SSE 옵션 = http-proxy 수준만** — Node.js socket keepAlive 별도. 본 사이클 한정 명시 범위 그대로.

### error-case 갱신
- F7 → 🟠 (코드 적용 완료, 라이브 검증 대기)

---

## 16. Phase 11 + Step 3 close — 다음 세션 후속 (§11 갱신)

Phase 9·10·11 총 5사이클(9.1~9.6 + hotfix + Step 1+2 + Step 3 + Phase 11 backend + Frontend)이 main에 안착됨. main HEAD = `f9c1e39`. 다음 세션은 본 §16 우선순위 큐 인용.

### 즉시 (사용자 환경 의존)

1. **수동 통합 회귀** — backend 재기동 + frontend 재기동:
   - TweaksPanel "LLM" 섹션 노출 확인
   - max_tokens 12000 + thinking ON + budget 8000 변경 → DevTools Network /api/query body 검증
   - 본 회귀 시나리오 ("직원별 최근 업무 일지... 시각화") chain 끝까지
   - reasoning 모델 환경에서 200행 쿼리 SSE 끊김 미발생 (A3 + G7 묶음 효과)
   - 빈 assistant bubble 미표시 (F7)
2. **회귀 통과 시 일괄 갱신**: error-case D6/D5/D1/A6/F7 → 🟢, §8 Locks Registry 만료 진입(ReportSchema/ViewBundle/build_*Tool 9.x 인터페이스 잠금)
3. **회귀 미통과 시**: debug-hotfixer 세션 활성화 → deep-dive 보고서 작성 → main supervisor가 fix 위임 결정

### 단기 (P0 잔재)

4. **B4 — AgentLoop circuit breaker** (동일 에러 N회 abort + LLM 명시적 우회 메시지)
5. **C1 — db_query 코드-level 1000행 cap**
6. **B1·B2·B3 — tool input validation + error wrapping** (build_report/build_view 빈 dict 방어 + loop.py error wrapping `{type}: {msg}`)
7. **D2 — 영문 컬럼 환각** (도메인 schema 화이트리스트 검증, 보강 C 후보)

### 중기 — Phase 12

8. **main.py 3-split + LLM helper** — `plans/PHASE12-main-split.md` 사전 박제됨. Step 3가 main.py에 추가한 loader 호출이 새 모듈로 이동. **Step 3 머지 완료 시점이라 진입 가능**.

### 중기 — 구조 / 운영

9. **Phase 10 Step 4** — `backend/agents/` 디렉토리 + SubAgent 카탈로그 README. SKILL.md 표준 활용.
10. **HITL 게이트** (provider별 분기, build_report 출력 직후 검수)
11. **ReportSchema 점진 블록** (`table` / `comparison` / `kpi_grid`)
12. **View 카탈로그 확장** (`TimeSeriesPanel` / `HeatmapCalendar`)
13. **SubAgent 카탈로그화** — `comparison_agent` / `anomaly_detector` 등록 표준 (Step 4 묶음)

### 운영 / 인프라

14. **Sonnet 다운그레이드 정식 적용** — 9.6 파일럿 평가 기반
15. **세션 영속화** — 현 `_conversations` in-process → SQLite/Redis 마이그레이션 (장기, SessionManager 객체화 후 cheap)
16. **본 supervisor 세션이 유보한 문서 갱신** (§17 참조)

### 운영 관찰 (지속)

- AS현안 4턴 통합 회귀 — Phase 9 close 시점부터 미실행 박제 (§7). 사용자 직접 검증 필요.
- 본 hotfix가 `<think>` strip을 해결했지만 다른 reasoning 마커(`<reasoning>`, `<scratchpad>` 등) 출현 가능 — 발견 시 동일 패턴 적용

---

## 17. 본 supervisor 세션 종료 직전 미완 — 새 supervisor에 위임 (2026-04-30)

본 세션은 Phase 11 + Step 3 close까지 처리. 이하 문서 갱신은 **새 supervisor 세션에 위임** (사용자 결정).

### 위임 범위

| 파일 | 갱신 내용 |
|---|---|
| `SPEC.md` §1 | 디렉토리 트리 — `backend/prompts/loader.py`, `backend/tools/*/SKILL.md`, `backend/prompts/rules/` 박제, `description.md` 5개 삭제 반영 |
| `SPEC.md` §4 API | `/api/defaults` GET 신설 + `/api/query` body 옵션 3개 (max_tokens / thinking_enabled / thinking_budget) |
| `SPEC.md` §6 도구 | SKILL.md 표준 + sub_agent type. `Tool.description` ABC default 인용 |
| `SPEC.md` §7 LLM | `LLMProvider.complete` 시그니처 변경 (max_tokens / thinking_*). claude max_retries=0. lm_studio httpx.Timeout per-phase. |
| `SPEC.md` §10 세션 관리 | `_session_domains` sticky 박제 (Fix 1). Phase 11 Backend의 SSE heartbeat |
| `ARCHITECTURE.md` | 시스템 프롬프트 합성 흐름 (system_base + rules + tool addenda via loader) + per-request LLM tuning data flow + SSE heartbeat 패턴 |
| `ROADMAP.md` | Phase 7·8·9·10·11 close. Phase 12 (main.py split + LLM helper) 항목 신설. Phase 10 Step 4 (agents/ + SubAgent 카탈로그). P0 잔재 명시 |
| `agent-prompts/README.md` | SKILL.md 영역 권한 가이드 (loader / SKILL.md / rules / tool addendum 구조). 새 도구 추가 워크플로우. 잠금 단위 명시 표준 (snapshot §8 인용) |
| `agent-prompts/backend-infra.md` §1 | 작업 영역 — `backend/prompts/rules/` + `backend/tools/*/SKILL.md` + `backend/prompts/loader.py` 추가. §5.2 위험 영역 — SKILL.md 표준 보강 |
| `agent-prompts/front-view.md` | (선택) Tweaks 인터페이스 + useServerDefaults hook 박제 |

### 본 세션이 처리한 부분 (위임 대상 X)

- ✅ HANDOFF.md — 본 세션에서 갱신 (§"현재 프로젝트 상태" Phase 11 종료 반영, §"새 도구 추가 가이드" SKILL.md 표준 박제, 최종 갱신일 2026-04-30)
- ✅ supervisorSnapshot.md §14 / §15 / §16 / §17 — 본 sect들
- ✅ error-case.md status 일괄 갱신 — Theme 1·2·3·5 🟢, E2 🟢, F7 🟠, 갱신 이력 #11~#13

### 새 supervisor cold-start 권장 헤드업

새 세션이 §17 위임 처리 시:
- `HANDOFF.md` (본 세션 갱신본) + `supervisorSnapshot.md` §13~§16 정독 후 즉시 진입 가능
- 본 위임 = 문서 일괄 갱신 (코드 변경 0). git commit 단위 분할 권장 (SPEC / ARCHITECTURE / ROADMAP / agent-prompts 각각)
- 위임 X 권장 — 모두 supervisor 영역 운영 정책 문서 (BackEnd Infra / DB Domain / Front/View 영역 외)
- 사용자 통합 회귀 결과 받으면 error-case 추가 갱신 + Phase 12 진입 결정 함께

본 세션 종료 후 plan 파일 (`fluttering-launching-trinket.md`) 자체는 historical 자료로 보존. 새 사이클 진입 시 plan 파일 재작성.


## 18. Cycle 1 — build_report → build_schema 리네임 클로즈 (2026-04-30)

명칭 정확화 사이클. backend-infra 위임 → 머지 + frontend sync + docs sync.

### 사이클 (commits + 머지 + sync)
- `4dc8d9e` rename(tool) — agent/backend-infra: 14 파일 / +39 / -39. 디렉토리 git mv (build_report → build_schema), 클래스 BuildReportTool → BuildSchemaTool, SKILL.md frontmatter, main.py 인스턴스, agent/loop _SUBAGENT_TOOLS, prompts/system_base + rules referenced_by, build_view import 경로
- `c5c2f07` merge(cycle-1) — supervisor가 main 위에서 --no-ff 머지
- `218ff67` rename(frontend-sync) — supervisor가 직접: useAgentStream:273 (`event.tool === "build_schema"` runtime check), SubAgentProgress:18 (한글 라벨 dict 키), useAgentStream:249/271 + chat.ts:18 (주석)
- `2c1c15d` docs(rename-sync) — SPEC/ARCHITECTURE/ROADMAP/HANDOFF/agent-prompts/backend-infra 일괄 치환 (5 파일). ROADMAP 상단 Cycle 1 close 박제. SPEC §11 BUILD_REPORT_MAX_* env var 미갱신 사실 인라인 주석.

### 박제된 결정
1. **자료구조 ReportSchema 명칭 그대로** — 도구 명칭만 바뀜
2. **build_view 그대로** — chart axis assignment 역할 유지
3. **환경변수명 BUILD_REPORT_MAX_*** 미갱신 — 별도 사이클 후보로 박제 (Phase 12 정리 묶음)
4. **frontend mechanical sync는 supervisor 직접** — territory 위반 아니라 atomic rename 일부 (autonomous hotfix 권한 + agent F 회귀 점검에서 frontend follow-up 명시)
5. **historical 박제(supervisorSnapshot / error-case / plans/* / debugHotfixerSnapshot / reports/error-analysis)는 미수정** — 시점별 사실로 보존

### 검증 통과
- backend: from main import app OK / load_all_tool_skills() == ['build_schema','build_view','db_query','list_tables','sp_call'] / BuildSchemaTool().name == "build_schema"
- frontend: pnpm exec tsc --noEmit exit 0
- 라이브 sub_agent 호출 회귀는 사용자 환경

---

## 19. UI/디자인 폴리시 사이클 (2026-04-30)

7 hotfix 연속 처리. 사용자가 채팅/리포트 사용 중 발견한 가독성·UX 회귀.

### Hotfix 7건 (자율 push 모드 — `feedback_autonomous_hotfix.md` 권한 발효)

- `ece5965` polish(design): dark bg `--bg / --bg-elev-1/2/3` oklch lightness +0.04 (0.16→0.20 등) + `.prose code` brand-cyan → text-strong 보정 + `.prose pre` 신규 (12px / mono / overflow-x:auto / 1px border)
- `87592f1` polish(framework+design): 대화 목록 자동 정렬 off — `useConversationStore.updateConversation` `[updated,...others].sort` → findIndex+replace, `ConversationList.filtered` `.sort` 제거. today/yesterday/earlier 그룹 분기는 그대로 (그룹 내 insertion order)
- `cba0fc4` polish(design): db_query 결과 inline viz expand 영역에 `<details>` "Executed SQL" 토글 — `tool_start.input.sql` pairing (turn+tool key map)
- `f496fe0` polish(design): `.prose h1~h6` 신규 (`--text-strong` + 0.8/0.35em margin + size 1.45→0.9em ladder + h5/h6은 의도적 dim)
- `6c7e9be` hotfix(design): VizDebugInfo 제거 (callsite + 함수 + 주석 일괄). Executed SQL = `<details>` 토글 → 항상 visible 코드 블록 + 우측 상단 Copy 버튼 (`ExecutedSqlBlock` + `CopyGlyph` 인라인 svg, copied 1.4s)
- `74ab847` hotfix(framework): `useQuickPrompts` hook 신설 — `{id,label,prompt}` shape + localStorage `losszero.quick-prompts.v1` + 도메인 전환 시 re-seed. groupware DEFAULTS 3종: 출근 간트 / 거래처 AS 분석 / 직원 업무일지. AgentChatPage 단순 교체.
- `567c508` hotfix(design+framework): ConversationList streaming 표시 — `streamingId?` prop + IconSpinner(ring) → `3d71549`에서 `Dot(tone="brand")` 점등으로 대체 (ring 형태 거부, 깜빡이 후속)

### 박제된 결정
1. **자율 hotfix push 권한** (사용자 명시) — 메모리 `feedback_autonomous_hotfix.md`. 작은 수정(파일 1~3 / +50줄 미만 / 단일 관심사)은 plan-승인 핸드셰이크 생략, 즉시 commit+push+사후보고.
2. **VizDebugInfo 데드코드** — Tweaks `data-debug-viz` toggle / `.viz-debug` CSS class는 dead-but-harmless 유지 (별도 정리 사이클 후보).
3. **Streaming indicator는 currently selected 대화에만** — `useAgentStream` 페이지 단일 hook 구조 한계. 멀티 백그라운드 스트림은 SessionManager 리팩토링(Phase 12) 이후로 미룸.
4. **CRUD UI는 별도 사이클** — `useQuickPrompts` 데이터 shape + 영속화는 ready, add/edit/delete 폼은 Cycle 2 디자인 산출물 도착 후 함께 검토.

---

## 20. Cycle 2 디자인 산출물 수령 (2026-04-30 19:14 KST)

외부 Claude Design 도구가 design-export/ 패키지를 받아 **`https://api.anthropic.com/v1/design/h/f9oIN9jMgXfBMk8HHcEtBA`**(losszerodemo-2.tar.gz, 177KB)로 산출물 회수. supervisor가 `design-export/cycle2-output/`에 풀어 검수 완료.

### 산출물 구성 (29 파일, 토큰 + 12 컴포넌트 + index.html canvas + interactive.html prototype + chat 로그)

| 영역 | 파일 |
|---|---|
| 토큰 | `tokens.css` — 기존 OKLCH 미러 + **신규 4 severity 토큰** (`--severity-good / -neutral / -warn / -alert`). light theme 기본 (codebase는 dark 기본 + light 옵션 — 양쪽 동기화 필요) |
| 신블록 5종 | `BubbleBreakdownBlock.jsx` (chart 좌 + 카드 우, 스크린샷1 정합) / `KpiGridBlock.jsx` (2/3/4-col + severity tinting) / `RankedListBlock.jsx` (rank badge + dot + name + primary/secondary + tags + highlight_top) / `GanttBlock.jsx` (단일 segment / 7~22시 ruler / team color, 스크린샷2 정합) / `RadarBlock.jsx` (SVG mock — 실 구현은 Recharts RadarChart) |
| 기존 4 mock | `ExistingBlocks.jsx` — Markdown / Metric / Highlight / ChartPlaceholder (시그니처 잠금 정합) |
| Container/dispatch | `ReportContainer.jsx` (mock) |
| Composition | `Scenario1Report.jsx` (업무 현황 — KPI grid + Gantt + Bubble + Ranked × 2) / `Scenario2Report.jsx` (업체 분석 — Top 3 + radar + pattern detection) |
| Archive UX | `ArchivePage.jsx` (1280×820 — 사이드바 + 검색 + 도메인/태그 필터 + 상세) + `InteractiveArchive.jsx` (working prototype, 검색·필터·삭제·HITL flow 모두 작동) |
| HITL | `ReportProposalCard.jsx` (LLM 자율 호출 → 사용자 보관 결정) |
| Spec docs | `SpecCard.jsx` (각 블록 옆 props interface + data_ref shape + LLM 가이드) |
| 진입 | `index.html` (정적 canvas 9 섹션) + `interactive.html` (live prototype) |

### 검수 결과 — HANDOFF-context.md §4 출발점 vs 산출물

- ✅ bubble_breakdown props: title/data_ref/bubble{label/size/x/color}/cards{title,primary,secondary,tags,color_dot}/layout — 출발점 정합
- ✅ kpi_grid props: title/columns(2|3|4)/metrics[{label/value/delta/trend/unit/severity}] — 신규 severity enum (`good|neutral|warning|alert`) 도입 → 신규 4 토큰과 짝
- ✅ ranked_list props: title/data_ref/fields/limit/highlight_top — 출발점 정합
- ✅ chart + viz_hint:"gantt" data_ref shape: `{label/color_group/start/end}` — 단일 segment, 멀티 segment는 후속
- ✅ chart + viz_hint:"radar" data_ref shape: `{category/value/series?}` — multi-series via group_by
- ⚠️ tokens.css가 light theme 기본 — 우리 codebase는 dark/light 양쪽이라 severity 4 토큰만 발췌 + dark/light 양쪽에 추가 필요
- ⚠️ gantt/radar는 mock에서 SVG 직접 — 실 구현은 Recharts (BarChart horizontal / RadarChart) 권장 (기존 SwitchableViz 패턴 일치)
- ⚠️ tabbed_section은 mock 시점에서 보류 (시나리오 1의 금일/금주/금월 토글 — 별도 보고서 분리 권장)

### 본 사이클 후속 — Phase A/B/C 분할 plan 박제
`plans/CYCLE2-design-integration.md` (다음 항목)에 Phase A/B/C 본문 박제. 이번 supervisor 세션은 산출물 검수 + plan 박제 + 시작 전 종료. 다음 supervisor 세션이 cold-start 후 Phase A 진입.

### 다음 사이클 후속 큐 (§16 갱신)
1. **Phase A** (supervisor 직접, design/) — types/report.ts 신블록 + types/events.ts viz_hint enum + index.css severity 토큰 + 5 신블록 .tsx + ReportContainer 디스패치 + ReportProposalCard. ~600줄, 8 파일.
2. **Phase B** (BackEnd Infra 위임) — Pydantic 미러 + system.md 갱신 + rules 갱신 + build_view 매핑 + report_generate sub_agent + storage + /api/reports + report_proposed SSE. ~400줄, 8 파일 (그 중 신규 4).
3. **Phase C** (Front/View 위임) — ReportArchivePage + useReportArchive + useReportProposal + App.tsx 라우팅. ~300줄, 4 파일 (그 중 신규 3).

A → B 의존: B Pydantic이 A TypeScript interface를 1:1 미러. A → C 의존: C가 A 신블록 import. B → C 의존: C가 /api/reports + report_proposed 의존.

### error-case 회귀 대기 (§16에서 이월)
- D6/D5/D1/A6/F7 라이브 회귀 미수행. Phase A 시작 전 사용자 환경 통합 회귀 1회 권장 (Phase 11 백엔드/프론트 + 본 사이클 폴리시 + 리네임 모두 main 안착 시점).
