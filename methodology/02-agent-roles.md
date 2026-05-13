# Per-role Agent — 표준 6단 cold-start 구조

각 역할 agent는 별도 Claude Code 세션에서 cold-start됨. supervisor가 표준 cold-start 프롬프트를 사용자에게 출력, 사용자가 새 세션에 paste.

`agent-prompts/<role>.md` 파일 1개당 1 역할.

## 표준 6단 구조 (claude-design 같은 외부 도구 제외, 모든 역할 공통)

### §1. 정체성
- 역할 이름 / 작업 위치 (디렉토리 경로)
- **작업 영역** (이 영역만 변경)
- **절대 건드리지 말 것** (다른 역할의 영역)
- **위임 검증 가드** — supervisor가 잘못 라우팅된 위임을 보내면 작업 시작 전 거부 + 재라우팅 제안

### §2. 시작 시 절차 (cold start)
1. 핵심 문서 정독 (`SPEC.md` / `ARCHITECTURE.md` / `ROADMAP.md` / `HANDOFF.md` / `agent-prompts/README.md`)
2. git 상태 확인 (`git log --oneline -10` / `git status -s` / `git branch --show-current`)
3. 자기 영역 핵심 파일 최근 변경 흐름 점검
4. §3 상황보고 markdown 출력 후 supervisor 추가 지시 대기

**금지**: §2 단계에서 코드 수정 / 커밋 / 새 파일 / 의존성 변경 / dev 서버 구동 / 브랜치 분기. 읽기 전용.

### §3. 상황보고 형식 (supervisor 주입 가능 markdown)

```markdown
### [<Role>] 에이전트 상황보고 (시각: <yyyy-mm-dd hh:mm>)

#### A. 진행 중 작업
- 브랜치 / 파일 / 진행도 (없으면 "없음")

#### B. 마지막 supervisor 위임
- (없으면 "없음")

#### C. 본 세션이 인지하는 프로젝트 상태
- 최근 커밋 흐름 요약 (3~5줄)
- 자기 영역의 주목할 변경 (최근 N커밋)
- 워킹트리: untracked / modified

#### D. 블로커 / 의문점
- (없으면 "없음")

#### E. 다음 분기 후보
- resume / new-task / verify-only

#### F. supervisor에 요청
- (없으면 "없음")
```

### §4. 작업 분기 (supervisor 응답 후)

- **resume**: 진행 중 작업 이어서. 변경사항 요약 후 계속.
- **new-task**: supervisor가 위임 명세 전달 → 본문에 따라 작업.
- **verify-only**: 코드 변경 없이 검증만 (타입/임포트/회귀 점검).

### §5. 작업 중 규칙 (역할별 차별점)

#### 5.1 자율 worktree 분기 (위임 시점에 1회만)

**supervisor 워크트리에서 `git checkout -b` 금지**. 별도 디렉토리에서 작업:

```bash
git fetch origin
git worktree add ../<project>-<role> -b agent/<role> origin/main
cd ../<project>-<role>
# 이후 모든 작업은 이 디렉토리에서
```

작업 후 `git push -u origin agent/<role>` → supervisor가 main 머지.
종료 시 `cd <supervisor-worktree> && git worktree remove ../<project>-<role>`.

#### 5.2 위험 영역 (변경 전 supervisor 사전 합의)
역할별로 정의. 예시:
- 공용 인터페이스 시그니처 (다른 영역이 의존)
- 이벤트 스키마 (cross-area 미러)
- 환경변수 / 의존성 추가/제거
- 라우터 경로/메소드 변경

#### 5.3 일상 작업 규칙
- 비동기 / 패키지 구조 / 파일 명명 등 역할별 컨벤션
- 자신의 영역 핵심 파일 패턴

#### 5.4 검증 (커밋 전)
- import OK / 타입 체크 / 단위 점검

### §6. 종료 시 인수인계 (작업 완료 후 출력 — supervisor 주입 가능)

```markdown
### [<Role>] 에이전트 종료 인수인계 (시각: <yyyy-mm-dd hh:mm>)

#### A. 변경 파일
- `<경로>`: <변경 한 줄 요약>

#### B. 커밋 흐름
- `<hash>` <commit message 첫 줄>

#### C. 브랜치 / 푸시 상태
- 브랜치: `agent/<role>`
- 푸시: <완료 / 미완>

#### D. 미완 항목 / 후속 작업
- (있으면)

#### E. supervisor 다음 액션 제안
- 검수 포인트: (특히 위험 영역 §5.2 접촉 여부)
- 머지 후 갱신 필요 문서: SPEC.md / ROADMAP.md 어느 섹션
- 다른 세션 영향: (어느 역할 동기화 필요)

#### F. 회귀 점검 (위험 영역 §5.2 변경 또는 debug 시 필수)
- 깨진 케이스:
- 영향 안 받은 케이스:
- 검증 방법:
```

## 위임 검증 가드 (§1 가드 본문 표준)

supervisor의 위임 명세를 받으면 작업 시작 전에 §1 "작업 영역" / "절대 건드리지 말 것"과 대조:

1. 위임 항목 중 본 역할 영역을 벗어난 것이 있으면 **즉시 작업 중단 + supervisor에 재확인 요청**:
   - 벗어난 항목을 인용
   - 어느 역할이 적절한지 판단 의견 제시
   - 재라우팅 또는 분할 위임 제안
2. supervisor가 "그래도 진행"이라 명시적으로 재확인하기 전에는 **본 역할 외 파일 절대 수정·생성·삭제 금지**.
3. 모호한 경우(영역 경계 위)는 추정으로 진행하지 말고 supervisor에 질의.

이 가드는 휴먼 에러로 잘못된 세션에 위임이 도달하는 사고를 차단하기 위한 것.

## 외부 도구 위임 (별도 절차서, 6단 구조 외)

외부 도구(figma / claude.ai/design / 디자인 컨설팅 등)는 본 6단 구조 미적용. supervisor가 별도 절차서를 가지고 운영:

1. 재주입 패키지 (예: `design-export/`) 생성 절차
2. 패키지 본문 규격 (필수 / 조건부 / 항상 제외)
3. 위임 프롬프트 표준
4. 산출물 회수 후 통합 절차

예시는 [LossZero의 `agent-prompts/claude-design.md`](../agent-prompts/claude-design.md) 참조.

## 새 역할 추가 워크플로우

1. `agent-prompts/<new-role>.md` 신설 — 본 6단 구조 따라 작성
2. `agent-prompts/README.md` 표 갱신
3. supervisor의 [01-supervisor-role.md](01-supervisor-role.md) §"작업 분배 패턴" 표 갱신
4. (필요 시) 본 역할 작업 영역의 첫 디렉토리 트리 박제 — supervisor와 합의된 [05-locks-registry.md](05-locks-registry.md) 잠금 단위
