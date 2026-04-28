# agent-prompts/ — 에이전트 위임 표준 프롬프트

> 본 폴더는 supervisor가 별도 Claude Code 세션을 cold start할 때 사용하는 **표준 위임 프롬프트** 모음이다.
> 각 파일을 새 세션의 첫 입력으로 그대로 paste하면 해당 역할로 즉시 전환된다.

---

## 사용 흐름 (supervisor 관점)

```
1. supervisor가 작업을 분해 → 어느 역할에 위임할지 결정
2. 사용자가 새 터미널에서 cd → claude 시작
3. 사용자가 agent-prompts/<role>.md 본문을 첫 입력으로 paste
4. (선택) supervisor의 위임 명세를 그 아래에 첨부
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

1. **정체성** — 역할 / 작업 위치 / 금지 영역
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

### 자율 분기 시퀀스 (작업 위임을 받은 시점에만 실행)

```bash
git fetch origin
git checkout main && git pull --ff-only
git checkout -b agent/<role>     # 없으면 생성, 있으면: git switch agent/<role>
```

### 운영 원칙

- **세션 시작 시점**에는 브랜치를 따지 않는다 — main 그대로 시작 OK
- **stand-by / verify-only** 세션은 분기 자체 불필요
- **작업 위임을 받은 시점**에만 위 시퀀스로 fresh base 분기
- 작업 후: `git push -u origin agent/<role>` → supervisor가 검수 후 main으로 머지
- supervisor가 첫 상황보고의 `git branch --show-current` 값으로 위반 감지

### 세션 자율성 vs 사용자 부담

이 규칙은 각 cold-start 프롬프트의 §2(시작 절차) / §5(작업 중 규칙)에 박제되어 있어, **사용자는 매번 브랜치 신경 쓸 필요 없다**. 세션이 자율로 처리한다.

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

## supervisor가 본 폴더를 갱신하는 시점

- 새로운 역할 추가 (예: 향후 QA 에이전트 등) → 새 파일 추가
- 가드레일 트리거 보강 → `debug.md` 갱신
- design-export/ 패키지 절차 변경 → `claude-design.md` 갱신
- 표준 6단 구조 자체 변경 → 모든 파일 + 본 README 동시 갱신

갱신 시 SPEC.md / HANDOFF.md 디렉토리 트리도 동기화한다.
