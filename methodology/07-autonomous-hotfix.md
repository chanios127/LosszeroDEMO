# 자율 hotfix push 권한 — 메모리 패턴

## 패턴

supervisor는 기본적으로 모든 변경에 대해 사용자 확인 → 작업 → commit → push 승인 → push의 5단계 핸드셰이크를 따름. 하지만 **작은 UI/CSS hotfix 연속 발생 시** 사이클이 마찰. 사용자가 명시적으로 권한을 위임하면 supervisor가 자율 진행 가능.

본 패턴은 **메모리 파일**(persistent across sessions)로 박제 — 한 번 합의하면 모든 후속 세션이 자동 적용.

## 메모리 파일 형식

`memory/feedback_autonomous_hotfix.md`:

```markdown
---
name: 자율 hotfix push 권한 (작은 수정)
description: <언제 적용되는지>
type: feedback
---

<배경 — 왜 권한을 위임했는지>

**규칙**: 사용자가 작은 hotfix를 요청하면:
1. 변경 범위 추정 (파일 1~3개, +50줄 미만, 단일 관심사) → 작은 수정으로 분류
2. 즉시 수정 + 검증(tsc/preview 에러 0) + commit + push
3. 사후 보고만 (1~2 문장 요약)

**Why**: 사용자가 명시적으로 "<권한 위임 인용>" 위임.

**How to apply**:
- 작은 수정 = (a) 단일 컴포넌트 / 단일 CSS 토큰 영역 (b) 새 기능 0 (c) territory crossing 시에도 mechanical sync 수준 (rename / 타입 동기화 등)
- 큰 변경(아키텍처 / 새 기능 / 라우팅 / schema 갱신)은 기존 plan-승인 핸드셰이크 유지
- 의문 시 작은 수정으로 보고 진행 (사후 보고 단계에서 문제 제기 가능)
- main 고정 원칙 / SPEC·ROADMAP 문서 갱신 / agent 위임 / git 위험 동작은 본 자율 권한 외 (별도 승인 필요)
```

## "작은 수정" 기준 (명확화)

다음 모두 만족:

| 조건 | 기준 |
|---|---|
| 파일 수 | 1~3개 |
| 추가 줄 수 | +50줄 미만 |
| 관심사 | 단일 (예: 색상 / 라벨 / 단일 컴포넌트 prop) |
| 새 feature | 0 (기존 동작 보정만) |
| territory crossing | mechanical sync 수준만 (rename 결과 / 타입 동기화 / 1-line 식별자 갱신) |
| 의존 동기화 | cross-area 변경 영향 0 |

다음은 **권한 외**:
- 아키텍처 변경 (계층 / 패턴 도입)
- 새 기능 (라우팅 추가 / 새 페이지 / 새 hook)
- schema 갱신 (Pydantic / TypeScript interface 추가)
- agent 위임 명세 작성
- git 위험 동작 (force push, branch delete, history rewrite)
- 문서 운영 변경 (SPEC / ARCHITECTURE / ROADMAP 갱신)
- env / 의존성 변경

## 운영 흐름

### 권한 합의 (1회)

사용자 발화 예시:
> "추가 hotfix 계속해서 줄테니 자율판단해 작은 수정이면 바로 수정 이행후 push 진행."

supervisor 응답:
> "승인. 자율 진행 모드로 메모리 저장 + 즉시 작업."

그 후 `memory/feedback_autonomous_hotfix.md` 신설 + `memory/MEMORY.md` 인덱스 갱신.

### 자율 hotfix 사이클

```
사용자: <hotfix 요청>
   ↓
supervisor: 변경 범위 추정 (위 기준 표 적용)
   ├─ 작은 수정 → 즉시 진행
   │    ├─ 코드 변경
   │    ├─ tsc / preview 검증
   │    ├─ commit + push
   │    └─ 사후 보고 (1~2 문장)
   └─ 큰 변경 → 기존 핸드셰이크 (plan 제안 → 사용자 승인)
```

### 사후 보고 표준 (3~5줄)

```
push 완료 (`<hash>`).

처리: <변경 한 줄 요약>. <기술 결정 1~2줄>.
verify: <tsc / preview 결과>.
```

## 경계 (의문 시 처리)

본 기준이 모호한 경우:
1. **의문 시 작은 수정으로 추정 + 진행** — 사후 보고 단계에서 사용자가 문제 제기 가능
2. **단, territory crossing이 의심되면 confirm 우선** — 다른 agent 영역 침범은 비싼 회복

## 사용자 권한 회수

사용자가 "이제 권한 회수해" 또는 "다시 확인받고 진행해"라고 하면 메모리 파일에 회수 박제 + 기존 5단계 핸드셰이크 복귀.

## 본 패턴의 출처

LossZero 2026-04-30 UI 폴리시 사이클. 7건의 연속 hotfix에서 매번 plan → 승인 → push 승인이 마찰. 사용자가 "추가 hotfix 계속해서 줄테니 자율판단해 작은 수정이면 바로 수정 이행후 push 진행" 위임. 메모리 박제 후 8~11번째 hotfix는 자율 진행.
