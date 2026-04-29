# agent-prompts/ — 에이전트 위임 표준 프롬프트

> 본 폴더는 supervisor가 별도 Claude Code 세션을 cold start할 때 사용하는 **표준 위임 프롬프트** 모음이다.
> 각 파일을 새 세션의 첫 입력으로 그대로 paste하면 해당 역할로 즉시 전환된다.

---

## 사용 흐름 (supervisor 관점)

```
1. supervisor가 작업을 분해 → 어느 역할에 위임할지 결정
   (다중 역할 시 코드 블록 N개로 분리 출력 — 한 블록에 두 역할 명세 X)
2. 사용자가 새 터미널에서 cd → claude 시작
3. 사용자가 agent-prompts/<role>.md 본문을 첫 입력으로 paste
4. (선택) supervisor의 위임 명세 코드 블록을 그 아래에 paste
   (supervisor가 항상 코드 블록 형태로 출력하므로 그대로 복사)
5. 새 세션 cold start → 상황보고 출력 → supervisor 응답 → 작업 진행
6. 종료 시 표준 인수인계 markdown 회신 → supervisor가 검수·머지
```

---

## 파일 구성

| 파일 | 역할 | 브랜치 |
|------|------|------|
| `README.md` | 본 파일 | — |
| `backend-infra.md` | FastAPI / LLM Provider / AgentLoop / tools / DB | `agent/backend-infra` |
| `db-domain.md` | schema_registry/domains/* + 도메인 매칭/서빙 | `agent/db-domain` |
| `front-view.md` | React framework/ 페이지·훅·컴포넌트 | `agent/front-view` |
| `claude-design.md` | 외부 Claude Design 도구 위임용 절차 + design-export/ 패키지 규격 | (외부 도구, supervisor가 결과 통합) |
| `debug.md` | 케이스별 테스트·수정 + A+C 가드레일 | `agent/debug` |

---

## 표준 6단 구조 (claude-design.md 제외)

각 역할 프롬프트는 동일한 6단 구조를 따른다:

1. **정체성** — 역할 / 작업 위치 / 금지 영역 / **위임 검증 가드**(잘못 라우팅된 위임 수신 시 작업 시작 전 거부·재확인)
2. **시작 시 절차 (cold start)** — 핵심 문서 + git 상태 점검 → 상황보고 출력
3. **상황보고 형식** — supervisor 주입 가능한 markdown
4. **작업 분기** — resume / new-task / verify-only
5. **작업 중 규칙** — 역할별 차별점 (SSE 동기화, 시그니처 동결, 분리 원칙 등)
6. **종료 시 인수인계** — 변경 파일 / 미완 / supervisor 다음 액션 제안

이 통일 구조 덕에 supervisor가 어떤 세션의 보고든 동일 형식으로 받게 된다.

---

## per-agent 브랜치 운영 규칙

### 명명 규칙
`agent/<role>` (예: `agent/backend-infra`, `agent/db-domain`, `agent/front-view`, `agent/debug`)

### 자율 분기 시퀀스 (작업 위임을 받은 시점에만 실행) — git worktree 의무

```bash
git fetch origin
git worktree add ../LosszeroDEMO-<role> -b agent/<role> origin/main
cd ../LosszeroDEMO-<role>
# 이후 모든 작업은 이 디렉토리에서. supervisor 워크트리(C:\ParkwooDevProjects\LosszeroDEMO)는 절대 건드리지 X
```

`<role>` = `backend-infra` / `db-domain` / `front-view` / `debug` 중 하나.

### 운영 원칙

- **세션 시작 시점**에는 분기 자체 불필요 — supervisor 워크트리에서 cold-start 절차만 수행 (read-only)
- **stand-by / verify-only** 세션은 분기·worktree 추가 불필요
- **작업 위임을 받은 시점**에만 위 시퀀스로 fresh worktree 분기
- 작업 후: `git push -u origin agent/<role>` → supervisor가 검수 후 main으로 머지
- 작업 종료 후: `cd C:\ParkwooDevProjects\LosszeroDEMO && git worktree remove ../LosszeroDEMO-<role>` 으로 정리
- supervisor가 첫 상황보고의 `git branch --show-current` 및 작업 디렉토리 값으로 위반 감지

### 절대 금지

- **supervisor 워크트리(`C:\ParkwooDevProjects\LosszeroDEMO`)에서 `git checkout -b agent/<role>` 또는 `git checkout agent/<role>` 실행 금지** — supervisor의 main HEAD를 변경시켜 사고 유발. Phase 8·9 사이클에서 3회 발생한 사고의 근본 원인. 반드시 `git worktree add`로 별도 디렉토리 사용.

### worktree 환경 주의

- **포트 충돌**: 두 worktree에서 `uvicorn` / `pnpm dev` 동시 실행 시 포트 점유. 한쪽만 dev 서버 띄우거나 포트 분리.
- **`.env` 공유 안 됨**: 각 worktree에 별도 `.env` 복사 필요 (worktree add 후 1회).
- **worktree 정리 필수**: 종료 후 `git worktree remove` 안 하면 디스크 누적 + ghost reference.

### 세션 자율성 vs 사용자 부담

이 규칙은 각 cold-start 프롬프트의 §2(시작 절차) / §5(작업 중 규칙)에 박제되어 있어, **사용자는 매번 브랜치 신경 쓸 필요 없다**. 세션이 자율로 처리한다.

### 동시 세션 작업 시 워크트리 충돌 주의 (Phase 8 사이클에서 발생)

같은 워크트리(`C:\ParkwooDevProjects\LosszeroDEMO`)를 여러 Claude Code 세션이 공유하면 git 브랜치가 1개만 checkout 가능하므로 분기·커밋이 꼬일 수 있다. 실제 사례: db-domain과 backend-infra 세션이 동시에 분기·커밋하다가 한쪽 final commit이 잘못된 브랜치 위에 안착, cherry-pick + 강제 정정 필요했음.

**완화책 (supervisor 정책)**:
- **권장 1: 순차 진행** — 위임을 동시에 보내더라도 한 세션이 push까지 끝낸 뒤 다음 세션 시작 (Plan에서 "병렬"로 적혀 있어도 실행은 순차).
- **권장 2: git worktree 분리** — 각 agent 세션마다 `git worktree add ../<role>-wt agent/<role>` 로 워크트리 자체를 분리 (각 세션이 독립 디렉토리에서 작업).
- 머지·검증·정리 부담은 supervisor가 흡수.

agent 측에서는 **첫 상황보고 시 `git branch --show-current` 값**과 **`git status`의 의외 modified 항목**을 supervisor에 보고해서 supervisor가 충돌을 조기 감지할 수 있도록 한다. 이미 cold-start §2에 박제됨.

---

## 종료 시 표준 인수인계 형식 (모든 역할 공통)

작업 종료 시 다음 markdown을 출력한다 (supervisor가 그대로 본 세션에 paste 가능한 형태):

```markdown
### [<role>] 에이전트 종료 인수인계 (시각: <yyyy-mm-dd hh:mm>)

#### A. 변경 파일
- `<경로>`: <변경 내용 한 줄 요약>

#### B. 커밋 흐름
- `<commit hash>` <commit message 첫 줄>

#### C. 브랜치 / 푸시 상태
- 브랜치: `agent/<role>`
- 푸시: <원격 push 완료 / 미완>

#### D. 미완 항목 / 후속 작업
- (있으면)

#### E. supervisor 다음 액션 제안
- 검수 포인트:
- 머지 후 갱신 필요 문서:
- 다른 세션 영향:

#### F. 회귀 점검 (debug 또는 위험 영역 변경 시 필수)
- 깨진 케이스:
- 영향 안 받은 케이스:
- 검증 방법:
```

---

## `/clear` 안전 시점 (모든 agent 공통)

multi-agent 협업 인프라는 on-disk truth source(cold-start 프롬프트 + 위임 명세 + git history) 우선이라 conversational context는 보조. 다음 4가지 모두 통과하면 agent 세션 `/clear` 안전:

1. 자기 브랜치(`agent/<role>`) push 완료
2. 종료 인수인계 markdown supervisor에 회신 완료 또는 파일로 저장(`reports/agent-<role>-<date>.md` 등)
3. 워킹트리 미커밋 실험 코드 0 (있으면 commit 또는 stash)
4. cold-start 프롬프트(agent-prompts/<role>.md) + 위임 명세 마크다운만으로 동일 작업을 재개할 수 있는지 self-check 통과

**위험 시점 (clear 금지)**:
- 현재 turn 진행 중인 코드 작성 / 검증 사이클 한복판
- in-flight `tool_use` → `tool_result` 페어 사이 (Anthropic 메시지 순서 끊기면 400)
- supervisor에게 답 대기 중인 질문 있음
- "이번 세션 한정" 임시 합의(예: "이번 9.1만 fixture 형식 X로 가자") 박제 안 한 채로

통과 못 하면: clear 자제하고 컨텍스트 한도까지 사용 권장. 본 체크리스트는 사이클 자연 종료 시점 기준.

---

## supervisor가 본 폴더를 갱신하는 시점

- 새로운 역할 추가 (예: 향후 QA 에이전트 등) → 새 파일 추가
- 가드레일 트리거 보강 → `debug.md` 갱신
- design-export/ 패키지 절차 변경 → `claude-design.md` 갱신
- 표준 6단 구조 자체 변경 → 모든 파일 + 본 README 동시 갱신

갱신 시 SPEC.md / HANDOFF.md 디렉토리 트리도 동기화한다.
