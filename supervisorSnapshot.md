# Supervisor Snapshot — 세션 인계용 일시 상태

> 작성: 2026-04-29 (Phase 8 종료 직후, Phase 9 plan 승인 시점)
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
