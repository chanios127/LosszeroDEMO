# Supervisor Snapshot

> 최종 갱신: <YYYY-MM-DD> (<현 사이클 / phase 한 줄>)
> 본 파일은 supervisor 세션 cold-start 시 최우선 정독 대상. **결정 박제소** + active operational context. 코드 변경 0.
> 압축 정책: 완료된 phase / commit log는 ROADMAP `§"✅ Phase X 처리됨"` + git log가 진실 소스. 본 snapshot은 결정 + 잠금 + 진행 중 사이클만.
> 진행 중 사이클이 종료되면 후속 supervisor가 본 snapshot의 active 섹션을 historical로 강등 + 압축.

---

## 1. 현재 상태 한 줄

main HEAD `<hash>`. <워킹트리 상태>. <현 사이클 / 다음 액션 한 줄>.

---

## 2. Locks Registry — 현재 활성 잠금

위임 명세 작성 시 본 표 인용. 잠금 단위는 **파일 통째 X — section/symbol 명시**.
methodology/05-locks-registry.md 참조.

| Scope | 위치 | 잠금 사유 | 만료 |
|---|---|---|---|
| `<symbol or section>` | `<file>` | <왜 잠겼는지> | 영구 / Phase X 종료 시 |

### 영역 권한 (영구 — agent-prompts에 박제됨)
- <영역 매핑>

### 잠금 정책
- 위임 명세에 잠금 단위 명시 ("X 파일 안의 Y symbol/section"). 파일 통째 잠금 회피.
- 충돌 시 우회 우선 → 구조적 리팩터 → 잠금 깨기 (마지막 수단).

---

## 3. 진행 중 사이클 — <Cycle N — Topic>

진입 plan: [plans/<PLAN-NAME>.md](plans/<PLAN-NAME>.md).

| Phase | 위임 | 상태 |
|---|---|---|
| **A. <subject>** — <변경 요약> | <누구> | <상태> |
| **B. <subject>** — <변경 요약> | <누구> | <상태> |
| **C. <subject>** — <변경 요약> | <누구> | <상태> |

### 박제된 결정
- <결정 1>
- <결정 2>

### 다음 액션
1. <next-action-1>
2. <next-action-2>

---

## 4. 직전 사이클 박제 (<YYYY-MM-DD>)

본 sect는 **결정 박제소**. commit 단위 변경 내역은 `git log --oneline <hash-range>` 회수.

### <Cycle / phase name>
범위: <한 줄>. <hash-range>.

박제된 결정 + 한계:
- <결정 1>
- <한계 1 + 후속 사이클 후보>

---

## 5. (선택) 외부 도구 산출물 — <Cycle N intake>

외부 도구 산출물 회수 시점 인용. **사이클 종료 시 삭제** (산출물은 별도 디렉토리 + git에 박제됨).

---

## 6. Historical archive

본 sect는 **포인터 위주**. phase별 본문 + 결정 + 미완 항목은 `ROADMAP.md` `§"✅ Phase X 처리됨"`이 진실 소스.

| Phase | 키워드 | 본문 회수 |
|---|---|---|
| <X> | <키워드 1줄> | ROADMAP `✅ Phase X` |

---

## 7. 다음 세션 큐

### 즉시
- <action 1>
- <action 2>

### 단기
1. <item 1>

### 중기 — <next major phase>
- <item>

### 장기 / 운영
- <item>

---

## 8. /clear 체크리스트 helper

methodology/06-clear-safety.md 참조. 

cold-start 시:
1. HANDOFF.md 정독
2. 본 snapshot §1~§3 정독
3. plans/ 진행 중 plan
4. git log --oneline -15
5. error-log (있다면)

종료 직전:
1. git status 클린
2. 핵심 결정사항 본 snapshot 또는 plans/에 박제
3. 사용자 답변 대기 0
4. 진행 중 위임 의도 박제
5. 미해결 결정사항 0

---

## 9. 본 snapshot 갱신 이력 + 후속 supervisor 압축 가이드

### 갱신 이력
- **<YYYY-MM-DD>**: <변경 요약>. 본 압축 직전 본문 = `git show <hash>:supervisorSnapshot.md` 회수.

### 후속 supervisor 압축 가이드

진행 중 사이클이 종료되면 다음 supervisor 세션이 본 snapshot 보강:

1. **§3 진행 중 → §6 historical로 강등**: 결정 박제는 §2 Locks Registry에 흡수. phase 본문은 1줄 응축, ROADMAP 포인터로 위임.
2. **§4 직전 사이클 → §6 historical로 강등**: §6 표에 새 행 추가 + 결정 박제만 유지.
3. **§5 산출물 → 사이클 종료 시 삭제**.
4. **§7 다음 큐 → 갱신**: 처리 완료 항목 제거 / 신규 항목 추가.
5. **§2 Locks Registry → 잠금 만료 검토**: phase boundary에서 만료된 잠금 해제.

**원칙**: snapshot은 **결정 박제소 + active operational context**만. 완료된 phase / commit log / 산출물 inventory는 ROADMAP / git / 별도 디렉토리가 진실 소스.
