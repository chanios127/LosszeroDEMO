# Handoff + Snapshot + Plans — 3 운영 문서

supervisor 운영의 핵심 진실 소스는 3가지 디스크 문서 + git history. conversational context는 보조.

## 1. `HANDOFF.md` — supervisor 세션 cold-start 프롬프트

**역할**: 새 supervisor 세션의 첫 입력으로 그대로 paste. 정체성 + 책임 + 시작 시 절차 + 작업 분배 패턴 + 검수 체크리스트 + git 컨벤션 + 알려진 함정 + 종료 패턴.

**위치**: `<project>/HANDOFF.md`

**갱신 주기**: 매 사이클 종료 시 supervisor가 갱신 (최종 갱신일 + 현 진행 중 사이클 한 줄 박제). 본 운영 문서의 구조 자체 변경은 드물게.

**시작 시 필수 읽기 순서** (HANDOFF.md 안에 박제):
1. `supervisorSnapshot.md` — 직전 세션의 일시 상태 + 결정 박제
2. `error-case.md` / `bug-log.md` 등 — 알려진 이슈 카탈로그 (있다면)
3. `SPEC.md` — 시스템 전체 명세
4. `ARCHITECTURE.md` — 데이터 흐름 / 디자인 결정
5. `ROADMAP.md` — 미이행 작업
6. `agent-prompts/README.md` — 위임 워크플로우
7. `plans/` — 진행 중 / 박제 plan
8. `git log --oneline -15` — 최근 작업 흐름

## 2. `supervisorSnapshot.md` — 결정 박제소 + active operational context

**역할**: HANDOFF.md가 운영 정책이라면 본 파일은 **현재 진행 중 상태 + 활성 잠금 + 진행 중 사이클**. supervisor 세션 cold-start 시 HANDOFF 다음으로 정독.

**원칙**:
- **결정 박제소**: 변경 자체보다 "왜 이렇게 갔는지" / "한계" / "후속 검토 후보" 위주
- **active operational context만**: 완료된 phase / commit log / 산출물 inventory는 다른 진실 소스에 위임
- **포인터 위주**: 본문이 길면 git hash + 외부 파일 인용으로 응축

### 표준 섹션 구조

```
## 1. 현재 상태 한 줄 (HEAD / cycle / 다음 액션)
## 2. Locks Registry (현재 활성 잠금 — 05-locks-registry.md 참조)
## 3. 진행 중 사이클 (Phase 분할 + 결정 박제)
## 4. 직전 사이클 박제 (결정 + 한계, commit log는 git에 위임)
## 5. (선택) 외부 도구 산출물 (예: design package intake)
## 6. Historical archive (이전 phase 1~3줄 + 포인터 표)
## 7. 다음 세션 큐 (즉시 / 단기 / 중기 / 장기)
## 8. /clear 체크리스트 helper
## 9. 본 snapshot 갱신 이력 + 후속 압축 가이드
```

### 압축 정책 (필수)

snapshot은 새 사이클마다 자라기 쉬움. **압축 정책 박제**:

매 사이클 종료 시 후속 supervisor가:

1. **§3 진행 중 사이클 → §6 historical로 강등** — 결정 박제(잠금 갱신 / lock 만료 / 제약 후속)는 §2 Locks Registry에 흡수. phase 본문은 1줄로 응축, ROADMAP의 처리 완료 sect로 위임
2. **§4 직전 사이클 → §6 historical로 강등** — §6 표에 새 행 추가 + 결정 박제만 유지
3. **§5 산출물 → 사이클 종료 시 삭제** — 산출물은 별도 디렉토리 또는 git에 박제됨, snapshot에 inventory 보존 가치 X
4. **§7 다음 큐 → 갱신** — 처리 완료 항목 제거 / 신규 항목 추가
5. **§2 Locks Registry → 잠금 만료 검토** — phase boundary에서 잠금 해제

**원칙**: snapshot은 결정 박제소 + active context. 완료된 phase / commit log / 산출물 inventory는 다른 진실 소스 (`ROADMAP.md` / git log / 외부 디렉토리).

본 압축 직전 본문 = `git show <prev>:supervisorSnapshot.md` 회수 가능 (갱신 이력의 hash 인용).

## 3. `plans/` — 다중 사이클 plan handoff

**역할**: 한 supervisor 세션이 끝나기 전, 진행 중 plan을 디스크에 박제. 다음 세션이 cold-start 후 plan만 보고 이어 작업 가능.

**위치**: `<project>/plans/<PLAN-NAME>.md`

**명명 컨벤션**:
- `PHASE<N>-<topic>.md` — 메이저 phase plan (예: `PHASE12-main-split.md`)
- `CYCLE<N>-<topic>.md` — sub-phase 또는 외부 도구 연동 사이클 (예: `CYCLE2-design-integration.md`)
- 또는 도메인 단어 (예: `error-recovery-overhaul.md`)

### Plan 파일 표준 섹션

```
## 산출물 위치 (외부 입력이 있다면)
## 분할 = Phase A / B / C 등
### Phase A — 누가 / 무엇을 / 의존
  | # | 파일 | 변경 |
  | ... 표 ... |
  verification:
  commit 분할 권장:
### Phase B — ...
### Phase C — ...
## 통합 회귀 (모든 Phase 머지 후)
## 본 plan 외 (보류 / 후속)
## 본 plan 갱신 이력
```

### Plan 라이프사이클

1. **생성**: supervisor가 새 사이클 진입 직전 또는 외부 도구 산출물 회수 시
2. **진행 중**: 각 Phase 시작/머지 시 plan에 "✅ DONE" 박제 (또는 inline)
3. **완료**: 모든 Phase 머지 + 라이브 회귀 통과 → plan을 historical로 (삭제 X, plans/에 유지). 다음 plan에서 인용 가능.
4. **superseded**: 새 plan이 본 plan을 대체하면 본 plan 상단에 "→ 후속: `<new-plan>`" 박제

## 운영 문서 간 관계

```
HANDOFF.md (운영 정책 — 잘 변하지 않음)
  ├──→ supervisorSnapshot.md (active context — 매 사이클 갱신)
  │     ├──→ §2 Locks Registry → 05-locks-registry.md 표준
  │     ├──→ §3 진행 중 사이클 → plans/<CYCLE-N>.md 진입점
  │     └──→ §7 다음 큐 → SPEC/ARCHITECTURE/ROADMAP/error-case 인용
  ├──→ agent-prompts/ (역할별 cold-start)
  ├──→ plans/ (진행 중 + historical)
  └──→ memory/ (사용자 권한 합의 박제 — 예: 자율 hotfix)
```

## 본 운영 문서들의 출처

LossZero Phase 6.5(2026-04-28) HANDOFF + agent-prompts 정착, Phase 9(2026-04-29) supervisorSnapshot 정착, Phase 11+Cycle 2(2026-04-30) plans/ 정착 + snapshot 압축 정책 정착.

압축 사례 (참조): `git show 943ab23:supervisorSnapshot.md` (820줄, 1차 압축 직전) → `git show 3c3a1e1:supervisorSnapshot.md` (250줄, 2차 압축 직전) → 현 `fd047c2:supervisorSnapshot.md` (197줄, 결정 박제소).
