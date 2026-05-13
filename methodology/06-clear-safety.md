# /clear Safety — 세션 boundary 패턴

Claude Code 세션은 컨텍스트 한도가 있어서 `/clear`로 정리해야 할 때가 옴. multi-agent 협업에서는 **on-disk truth source** 우선이라 conversational context는 보조 — 디스크 박제가 통과되면 `/clear` 안전.

## supervisor 측 /clear 체크리스트

cold-start 시 / 세션 종료 시 양쪽에서 사용. 세션 종료 직전 통과해야 안전.

- [ ] **git status 클린** (미커밋 변경 0). untracked는 OK (로컬 전용 파일).
- [ ] **진행 중 작업의 핵심 결정 사항이 디스크에 박제됨** — `supervisorSnapshot.md` / `plans/` / `SPEC.md` / `ROADMAP.md` 중 하나.
- [ ] **사용자에게 답변 대기 중인 질문 0**. 있으면 답 받고 박제 후 clear.
- [ ] **진행 중 위임의 "회신 받으면 어떻게 할지" 의도가 디스크에 박제됨** — `supervisorSnapshot.md` §"진행 중 사이클" 또는 `plans/`.
- [ ] **미해결 사용자 결정사항 0** — 옵션 A/B/C 박제하면 다음 supervisor가 사용자에게 다시 물을 수 있음, 그것까지 박제.

통과 못 하면: `/clear` 자제하고 컨텍스트 한도까지 사용 권장. 본 체크리스트는 **사이클 자연 종료 시점 기준**.

## agent 측 /clear 체크리스트

multi-agent 협업 인프라는 on-disk truth source (cold-start 프롬프트 + 위임 명세 + git history) 우선. 다음 4가지 모두 통과하면 agent 세션 `/clear` 안전:

1. 자기 브랜치(`agent/<role>`) push 완료
2. 종료 인수인계 markdown supervisor에 회신 완료 또는 파일로 저장 (예: `reports/agent-<role>-<date>.md`)
3. 워킹트리 미커밋 실험 코드 0 (있으면 commit 또는 stash)
4. cold-start 프롬프트(`agent-prompts/<role>.md`) + 위임 명세 마크다운만으로 동일 작업을 재개할 수 있는지 self-check 통과

### 위험 시점 (clear 금지)

- 현재 turn 진행 중인 코드 작성 / 검증 사이클 한복판
- in-flight `tool_use` → `tool_result` 페어 사이 (Anthropic 메시지 순서 끊기면 400 에러)
- supervisor에게 답 대기 중인 질문 있음
- "이번 사이클만" 임시 합의 박제 안 한 채로

## 세션 종료 표준 흐름 (supervisor)

컨텍스트 한도 임박 또는 사이클 자연 종료 시:

1. **미커밋 변경 정리 + commit**
2. **`SPEC.md` / `ARCHITECTURE.md` / `ROADMAP.md` 갱신** (구조 변경 있었으면)
3. **`HANDOFF.md` 후임 세션용 갱신** (현재 상태 반영, 최종 갱신일 변경)
4. **`supervisorSnapshot.md` 갱신** — 진행 중 위임 / 대기 상태 / clear 직후 새 세션이 알아야 할 사항 박제
5. **사용자에게 다음 세션 시작 가이드 전달** (cold-start 프롬프트 + 우선 읽을 파일 순서)
6. **`/clear` 체크리스트 통과 확인 → clear OK**

## 세션 종료 표준 흐름 (agent)

1. **자기 브랜치 push**: `git push -u origin agent/<role>`
2. **인수인계 markdown 출력** (또는 `reports/agent-<role>-<date>.md` 저장)
3. **워킹트리 정리**: 미커밋 0
4. **(선택) worktree 제거**: 후속 작업 없으면 `cd <supervisor-worktree> && git worktree remove ../<project>-<role>`
5. **`/clear` 체크리스트 통과 확인 → clear OK**

## Cold-start 권장 흐름

### supervisor 새 세션
1. `HANDOFF.md` 정독 (최신본)
2. `supervisorSnapshot.md` §1~§3 정독 (현재 상태 + 활성 잠금 + 진행 중 사이클)
3. `plans/<현 진행 plan>.md` (있다면)
4. `git log --oneline -15`
5. `error-case.md` 또는 `bug-log.md` 잔재 항목 확인 (있다면)
6. 사용자에게 우선순위 질문 또는 진행 중 사이클 다음 액션 제안

### agent 새 세션
1. `agent-prompts/README.md` (브랜치 운영 규칙)
2. `agent-prompts/<role>.md` (자기 cold-start 프롬프트 — 정체성 + 작업 영역)
3. `SPEC.md` 자기 영역 sect
4. `git log --oneline -10` + `git status -s`
5. 자기 영역 핵심 파일 최근 변경 흐름
6. supervisor에 §3 상황보고 markdown 출력

## 본 체크리스트의 출처

LossZero Phase 6.5 ~ 11 운영. 컨텍스트 한도 임박 시 `/clear` 안전성 검증을 in-conversation으로 매번 reasoning하지 않도록 표준화.
