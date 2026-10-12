# Methodology 도입 부트스트랩 프롬프트

> 본 파일은 새 프로젝트의 **첫 Claude Code 세션**에 그대로 paste할 프롬프트.
> `methodology/` 디렉토리만 복사해 온 상태에서 시작한다고 가정.
>
> ```bash
> cp -r <source-project>/methodology/ <new-project>/methodology/
> ```
>
> **`agent-prompts/`, `plans/`, `HANDOFF.md`, `supervisorSnapshot.md`, `SPEC.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `error-case.md` 등은 복사하지 않는다.**
> 이들은 원 프로젝트(LossZero)의 세션 산출물이지 방법론 자체가 아님 — 새 프로젝트 실태에 맞게 이 세션이 처음부터 재도출한다.

---

## 당신에게 주어진 작업

이 프로젝트에 `methodology/` 아래 문서화된 **multi-agent supervisor orchestration 프로토콜**을 도입한다. 단, 그대로 복제하지 말고 **이 프로젝트의 실제 구조/규모에 맞게 재구축**한다.

### 절대 원칙

- `methodology/01~07.md` + `README.md`는 **수정하지 않고 그대로 둔다** (project-agnostic 규율 원문).
- LossZero의 역할 이름(BackEnd Infra / DB Domain / Front-View / Debug / Claude Design), plan 내용, SPEC 내용 등은 **참고하지 않는다** — 이 프로젝트에 그런 역할/도메인이 존재한다는 근거가 없다.
- 모든 산출물(`agent-prompts/*.md`, `HANDOFF.md`, `supervisorSnapshot.md` 등)은 **이 프로젝트를 조사한 결과**로부터 새로 작성한다.

---

## 절차

### 1단계 — methodology 정독

`methodology/README.md` → `01-supervisor-role.md` ~ `07-autonomous-hotfix.md` 전체를 읽는다. 특히 README §"자유 적응 권장" 표를 숙지 — 모든 섹션을 다 채택할 필요는 없다.

### 2단계 — 현재 프로젝트 실태 조사

다음을 파악한다 (Explore subagent 활용 권장):

- 기술 스택 / 디렉토리 구조 (백엔드, 프론트, DB, 인프라, 디자인 산출물 등 존재 여부)
- 이미 존재하는 도메인 경계 (예: 모노레포의 packages/, 기존 팀 분업 관례)
- 프로젝트 규모 — 단기 실험용인지, 3개월+ 장기 운영 예정인지
- 예상 동시 운영 agent 세션 수 — 1개(supervisor만)? 2~3개? 3+ 개?
- git 원격 / 브랜치 보호 정책 / CI 유무 (worktree 운영에 영향)

### 3단계 — 채택 레벨을 사용자에게 확인

README §"자유 적응 권장" 기준으로 다음을 **사용자에게 질문**한다 (AskUserQuestion 등 활용):

- 항상 가치 있는 §3(main 고정 + worktree) / §4(HANDOFF cold-start) / §6(`/clear` 체크리스트)는 기본 채택
- §2(per-role cold-start) / §5(Locks Registry) / §7(자율 hotfix)은 **3+ agent 동시 운영이 실제로 예상될 때만** 채택 여부를 묻는다
- §4의 snapshot 압축 정책은 **장기 프로젝트일 때만** 채택 여부를 묻는다

혼자 운영하거나 agent 2개 이하면 methodology 전체를 무겁게 들여오지 말 것을 권고하고, 사용자 선택을 받는다.

### 4단계 — 역할(agent-prompts) 재설계

2단계 조사 결과를 바탕으로 **이 프로젝트에 실제로 필요한 역할**을 표로 제안한다:

| 역할 이름 | 작업 영역(디렉토리) | 절대 건드리지 말 것 | 위험 영역(§5.2 후보) |
|---|---|---|---|
| ... | ... | ... | ... |

- LossZero의 역할명을 그대로 베끼지 말 것 — 이 프로젝트의 실제 아키텍처 경계(예: API 서버 / 워커 / 모바일 앱 / 데이터 파이프라인 등)로 새로 나눈다
- 역할 수는 3단계에서 확인한 동시 운영 규모에 맞춘다 (agent 2개 예정인데 역할 5개 설계하지 않는다)
- **사용자 승인 전까지 파일을 생성하지 않는다.**

### 5단계 — agent-prompts/ 생성 (승인 후)

승인된 역할마다:

1. `methodology/templates/agent-prompts-role.md`를 골격으로 `agent-prompts/<role>.md` 작성 — `02-agent-roles.md`의 표준 6단 구조(정체성/cold start/상황보고/작업분기/작업규칙/인수인계) 준수, placeholder를 실제 값으로 채움
2. `methodology/templates/agent-prompts-README.md`를 골격으로 `agent-prompts/README.md` 작성 — 역할 표 + 위임 워크플로우

### 6단계 — 루트 운영 문서 생성 (신규, LossZero 내용 이식 금지)

1. `methodology/templates/HANDOFF.md` → `HANDOFF.md` — placeholder를 2단계 조사 결과로 채움 (LossZero의 "완료 phase" 등은 절대 넣지 않음, 이 프로젝트는 아직 phase 0)
2. `methodology/templates/supervisorSnapshot.md` → `supervisorSnapshot.md` — §2 Locks Registry는 비워두거나 4단계에서 나온 "위험 영역" 후보만 최소 등록
3. `SPEC.md` / `ARCHITECTURE.md` / `ROADMAP.md` — 이미 프로젝트에 존재하면 그대로 사용(경로만 HANDOFF.md에 반영), 없으면 최소 골격만 생성하고 내용 채우기는 별도 작업으로 미룸
4. `plans/`, `reports/` — **빈 디렉토리로만 생성**. 실제 사이클/위임이 시작될 때 그 시점 plan만 만든다. LossZero의 PHASE9/PHASE10 등 plan 파일은 이식하지 않는다.

### 7단계 — 결과 보고

생성된 파일 목록 + 각 파일의 핵심 placeholder 값을 요약해 사용자에게 보고. 특히:

- 채택하지 않기로 한 methodology 섹션과 이유
- 역할 설계 근거 (왜 이 경계로 나눴는지)
- 사용자가 다음에 할 일 (예: 실제 agent 세션 cold-start, 첫 위임 작성)

---

## 참고 — 원 출처

이 부트스트랩이 참조하는 규율의 출처는 LossZero LLM Harness 프로젝트 (Phase 6.5~11, 2026-04) 6개월 운영 사례. 상세는 `methodology/README.md` §"본 methodology의 출처" 참조.
