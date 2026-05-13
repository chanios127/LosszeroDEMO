# Multi-agent Supervisor Orchestration — Methodology

> 본 디렉토리는 Claude Code 기반 다중 세션 협업 프로토콜을 project-agnostic으로 추출한 것.
> LossZero LLM Harness 프로젝트에서 6개월 운영하며 굳어진 패턴 — 다른 프로젝트로 복제 가능.

## 사용 흐름

새 프로젝트에 본 디렉토리를 그대로 복사:
```bash
cp -r methodology/ <new-project>/
```
그 후 `templates/` 디렉토리의 빈 파일들을 프로젝트 루트로 옮기고 placeholder를 채우면 됨.

## 인덱스

| 파일 | 내용 | 누구를 위한 |
|---|---|---|
| [01-supervisor-role.md](01-supervisor-role.md) | supervisor 세션의 정체성 / 책임 / 금지 영역 | supervisor 세션을 시작하는 사람 |
| [02-agent-roles.md](02-agent-roles.md) | per-role agent 표준 6단 cold-start 구조 + 위임 검증 가드 | 새 역할 agent 추가 시 |
| [03-git-conventions.md](03-git-conventions.md) | main 고정 원칙 / per-agent worktree / 브랜치 명명 / 충돌 가드 | 모든 세션 (supervisor + agent) |
| [04-handoff-snapshot-plan.md](04-handoff-snapshot-plan.md) | HANDOFF.md + supervisorSnapshot.md + plans/ 3 운영 문서의 역할 + 압축 정책 | supervisor 운영 |
| [05-locks-registry.md](05-locks-registry.md) | 잠금 단위 표준 (section/symbol) + 잠금 정책 | 위임 명세 작성 시 |
| [06-clear-safety.md](06-clear-safety.md) | `/clear` 안전 체크리스트 + 세션 boundary 패턴 | 세션 종료 시점 |
| [07-autonomous-hotfix.md](07-autonomous-hotfix.md) | 자율 hotfix push 권한 메모리 패턴 | supervisor가 사용자와 권한 합의 후 |
| [templates/](templates/) | 빈 HANDOFF / supervisorSnapshot / agent-prompts / plan template | 새 프로젝트 초기 세팅 |

## 핵심 가치

1. **세션 휘발성 ↔ 디스크 영속성** — 모든 결정은 conversational context가 아닌 디스크에 박제. `/clear`해도 cold-start로 동일 작업 재개 가능.
2. **단일 진실 소스 + 포인터** — `supervisorSnapshot.md`은 결정 박제소 + active context. 본문은 SPEC / ROADMAP / git log / plans/가 진실 소스.
3. **per-role 영역 권한** — 각 agent는 자기 영역만 변경. 영역 외 요청은 위임 검증 가드로 거부 + 재라우팅 제안.
4. **worktree 분리로 git HEAD 충돌 차단** — supervisor는 main 고정, 각 agent는 별도 worktree.
5. **잠금 단위 = section/symbol** — 파일 통째 잠금 회피, 충돌 우회 우선.

## 자유 적응 권장

본 methodology는 LossZero 사례에 최적화됨. 다른 프로젝트에서 굳이 모든 패턴을 채택할 필요 없음. 다음은 **항상 가치 있음**:

- §3 main 고정 + per-agent worktree
- §4 HANDOFF.md cold-start
- §6 `/clear` 체크리스트

다음은 **3+ agent 동시 운영 시 가치**:

- §2 per-role cold-start 표준
- §5 Locks Registry
- §7 자율 hotfix 권한

다음은 **장기 프로젝트(3개월+) 시 가치**:

- §4 supervisorSnapshot.md 압축 정책

## 본 methodology의 출처

LossZero LLM Harness 프로젝트 (Phase 6.5 ~ 11, 2026-04). supervisor + BackEnd Infra + DB Domain Manager + Front/View + Claude Design + Debug 6 역할 동시 운영. 본 디렉토리의 모든 패턴은 실 운영 사례 기반.
