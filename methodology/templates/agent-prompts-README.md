# agent-prompts/ — 에이전트 위임 표준 프롬프트

> 본 폴더는 supervisor가 별도 Claude Code 세션을 cold start할 때 사용하는 **표준 위임 프롬프트** 모음.
> 각 파일을 새 세션의 첫 입력으로 그대로 paste하면 해당 역할로 즉시 전환.

---

## 사용 흐름 (supervisor 관점)

```
1. supervisor가 작업을 분해 → 어느 역할에 위임할지 결정
   (다중 역할 시 코드 블록 N개로 분리 출력)
2. 사용자가 새 터미널에서 cd → claude 시작
3. 사용자가 agent-prompts/<role>.md 본문을 첫 입력으로 paste
4. (선택) supervisor의 위임 명세 코드 블록을 그 아래에 paste
5. 새 세션 cold start → 상황보고 출력 → supervisor 응답 → 작업 진행
6. 종료 시 표준 인수인계 markdown 회신 → supervisor 검수·머지
```

---

## 파일 구성

| 파일 | 역할 | 브랜치 |
|---|---|---|
| `README.md` | 본 파일 | — |
| `<role-1>.md` | <역할 1 요약> | `agent/<role-1>` |
| `<role-2>.md` | <역할 2 요약> | `agent/<role-2>` |
| `<external-tool>.md` | 외부 도구 위임 절차 (6단 구조 미적용) | (외부 도구, supervisor가 결과 통합) |

---

## 표준 6단 구조

methodology/02-agent-roles.md 참조. 각 역할 프롬프트는 동일한 6단 구조:

1. **정체성** — 역할 / 작업 위치 / 금지 영역 / 위임 검증 가드
2. **시작 시 절차 (cold start)** — 핵심 문서 + git 상태 점검 → 상황보고 출력
3. **상황보고 형식** — supervisor 주입 가능 markdown
4. **작업 분기** — resume / new-task / verify-only
5. **작업 중 규칙** — 역할별 차별점
6. **종료 시 인수인계** — 변경 파일 / 미완 / supervisor 다음 액션 제안

---

## per-agent 브랜치 운영 규칙

methodology/03-git-conventions.md 참조.

### 명명 규칙
`agent/<role>`

### 자율 분기 시퀀스 (작업 위임을 받은 시점에만 실행) — git worktree 의무
```bash
git fetch origin
git worktree add ../<project>-<role> -b agent/<role> origin/main
cd ../<project>-<role>
```

### 운영 원칙
- 세션 시작 시점에는 분기 불필요 (read-only)
- stand-by / verify-only 세션은 worktree 추가 불필요
- 작업 위임 받은 시점에만 fresh worktree 분기
- 작업 후 `git push -u origin agent/<role>` → supervisor 머지
- 작업 종료 후 `git worktree remove ../<project>-<role>`

### 절대 금지
- supervisor 워크트리에서 `git checkout -b agent/<role>` 또는 `git checkout agent/<role>` 실행 금지

---

## 종료 시 표준 인수인계 형식 (모든 역할 공통)

```markdown
### [<role>] 에이전트 종료 인수인계 (시각: <yyyy-mm-dd hh:mm>)

#### A. 변경 파일
- `<경로>`: <변경 한 줄 요약>

#### B. 커밋 흐름
- `<commit hash>` <commit message 첫 줄>

#### C. 브랜치 / 푸시 상태
- 브랜치: `agent/<role>`
- 푸시: <완료 / 미완>

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

## `/clear` 안전 시점

methodology/06-clear-safety.md 참조. 모든 agent 공통 4가지:

1. 자기 브랜치(`agent/<role>`) push 완료
2. 종료 인수인계 markdown supervisor에 회신 완료 또는 파일 저장
3. 워킹트리 미커밋 실험 코드 0
4. cold-start 프롬프트 + 위임 명세 마크다운만으로 동일 작업 재개 가능 self-check 통과

---

## supervisor가 본 폴더를 갱신하는 시점

- 새로운 역할 추가 → 새 파일 추가 + 본 README 표 갱신
- 가드레일 트리거 보강 → debug.md 갱신
- 외부 도구 절차 변경 → `<external-tool>.md` 갱신
- 표준 6단 구조 자체 변경 → 모든 파일 + 본 README 동시 갱신

갱신 시 `SPEC.md` / `HANDOFF.md` 디렉토리 트리도 동기화.
