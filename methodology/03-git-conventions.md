# Git Conventions — main 고정 원칙 + per-agent worktree

## main 고정 원칙 (supervisor 절대 규칙)

### Why

다중 agent가 동시에 작업할 때 같은 워크트리(`<project>/`)를 공유하면 git HEAD가 하나라서 분기·커밋이 꼬임. 실 사례 (LossZero Phase 8·9):
- agent의 `git checkout -b agent/<role>`이 워크트리 HEAD를 바꿔서 supervisor의 commit이 잘못된 브랜치에 안착 (3회 발생)
- cherry-pick + 강제 정정 필요

### 규칙

1. supervisor 세션의 워크트리(`<project>/`)는 **항상 `main` 브랜치**. 다른 브랜치로 `git checkout` 절대 금지.
2. **모든 git 동작 전 `git branch --show-current` 자가 점검**. `main`이 아니면 즉시 `git checkout main` (uncommitted change 있으면 stash 후 검토).
3. supervisor의 cherry-pick·revert·merge·commit 등 **모든 git 작업은 main 위에서**.
4. 다른 브랜치 내용 확인이 필요하면 `git show <branch>:<path>` / `git log <branch>` / `git diff main..<branch>` 등 **read-only 명령만 사용**. 절대 checkout 금지.

### 위반 시 복구 절차

잘못된 브랜치에서 commit이 발견되면:
```bash
git checkout main
git cherry-pick <wrong-commit>
git branch -f <wrong-branch> origin/<wrong-branch>   # 또는 적절히 reset
```

## per-agent feature 브랜치 + worktree

### 명명 규칙

- 브랜치: `agent/<role>` (예: `agent/backend-infra`, `agent/db-domain`, `agent/front-view`, `agent/debug`)
- worktree 디렉토리: `<project>-<role>` (예: `../LosszeroDEMO-backend-infra`)

### 자율 분기 시퀀스 (작업 위임을 받은 시점에만 실행)

```bash
git fetch origin
git worktree add ../<project>-<role> -b agent/<role> origin/main
cd ../<project>-<role>
# 이후 모든 작업은 이 디렉토리에서. supervisor 워크트리는 절대 건드리지 않음
```

작업 후:
```bash
git push -u origin agent/<role>
# supervisor가 검수 후 main으로 머지
```

종료 시 (supervisor 머지 + 사용자 확인 후):
```bash
cd <supervisor-worktree>
git worktree remove ../<project>-<role>
git push origin --delete agent/<role>   # 선택, 정리용
```

### 운영 원칙

- **세션 시작 시점**에는 분기 자체 불필요 — supervisor 워크트리에서 cold-start 절차만 수행 (read-only)
- **stand-by / verify-only** 세션은 worktree 추가 불필요
- **작업 위임을 받은 시점**에만 위 시퀀스로 fresh worktree 분기
- supervisor가 첫 상황보고의 `git branch --show-current` 및 작업 디렉토리 값으로 위반 감지

### 절대 금지

- supervisor 워크트리(`<project>/`)에서 `git checkout -b agent/<role>` 또는 `git checkout agent/<role>` 실행 금지. 반드시 `git worktree add`로 별도 디렉토리 사용.

### worktree 환경 주의

- **포트 충돌**: 두 worktree에서 dev 서버 동시 실행 시 포트 점유 — 한쪽만 띄우거나 포트 분리
- **`.env` 공유 안 됨**: 각 worktree에 별도 `.env` 복사 필요 (worktree add 후 1회)
- **worktree 정리 필수**: 종료 후 `git worktree remove` 안 하면 디스크 누적 + ghost reference

### 동시 세션 작업 시 워크트리 충돌 주의

같은 워크트리를 여러 Claude Code 세션이 공유하면 git 브랜치가 1개만 checkout 가능하므로 분기·커밋이 꼬일 수 있음.

**완화책 (supervisor 정책)**:
- **권장 1: 순차 진행** — 위임을 동시에 보내더라도 한 세션이 push까지 끝낸 뒤 다음 세션 시작 (Plan에서 "병렬"로 적혀 있어도 실행은 순차)
- **권장 2: git worktree 분리** — 각 agent 세션마다 별도 worktree (필수)
- 머지·검증·정리 부담은 supervisor가 흡수

agent 측에서는 **첫 상황보고 시 `git branch --show-current` 값**과 **`git status`의 의외 modified 항목**을 supervisor에 보고해서 supervisor가 충돌을 조기 감지할 수 있도록.

## Git 커밋 컨벤션

- **단일 관심사 commit** (예: backend/llm 변경과 frontend 변경은 분리)
- 메시지 형식:
  ```
  scope(area): summary

  - bullet 1
  - bullet 2
  ```
- commit 전 항상 `git diff --cached --name-status`로 의도한 파일만 스테이징됐는지 확인
- 시크릿 검출 시: 새 git init이 아닌 git filter-branch 또는 BFG 사용

## 머지 패턴

supervisor가 agent 브랜치를 main으로 머지할 때:

### Option 1: `--no-ff` merge (권장)
```bash
git merge --no-ff origin/agent/<role> -m "merge(<cycle>): <summary>"
```
- 분기점 표현, history 명확
- agent의 commit hash 그대로 보존 + merge commit 추가

### Option 2: cherry-pick (단일 commit + 깔끔 history 선호 시)
```bash
git cherry-pick <agent-commit-hash>
```
- 단일 commit으로 추가, fast-forward 가능
- 단점: agent 브랜치에 있는 commit이 main에는 다른 hash로 들어감

### Option 3: rebase + FF
- 사용자가 agent worktree에서 rebase하거나 supervisor가 별도 worktree에서 처리
- 거의 사용 안 함 (overhead 큼)

## 직후 frontend/backend sync (mechanical 후속)

예: backend rename → frontend 식별자 동기화 1줄. agent territory에 속하지만 atomic rename 의 일부.

**규칙**: supervisor가 직접 sync 후속 commit. 이유:
- 별도 agent 세션 cold-start 오버헤드 > 1줄 sync 변경
- atomic rename 일관성 유지
- 단, agent의 인수인계 markdown에 "frontend follow-up" 명시 후 supervisor가 처리

## 본 conventions의 출처

LossZero Phase 6.5(2026-04-28) ~ Phase 11(2026-04-30) 운영 사례. Phase 8·9에서 발생한 워크트리 충돌 3회 사고가 main 고정 원칙 도입의 직접 원인.
