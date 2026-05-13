# Locks Registry — 잠금 단위 표준

## Why

장기 프로젝트에서 어떤 인터페이스/스키마/이벤트는 **여러 영역이 의존**해서 변경하면 cross-area 동기화 폭탄. 잠금은 supervisor 합의 없이 변경 못하도록 하는 운영 장치.

**핵심 원칙**: 파일 통째 잠금 회피. **section/symbol 단위로 명시**.

## Locks Registry 표 구조

`supervisorSnapshot.md` §2 또는 별도 섹션에 박제:

| Scope | 위치 | 잠금 사유 | 만료 |
|---|---|---|---|
| `<symbol or section>` | `<file>` | <왜 잠겼는지 — 다른 영역의 의존성> | 영구 / Phase X 종료 시 / etc |

### 예시 (LossZero 사례 인용)

| Scope | 위치 | 잠금 사유 | 만료 |
|---|---|---|---|
| `AgentEvent` union + `*Event` 클래스 + `VizHint` enum | `frontend/src/design/types/events.ts` | backend SSE 미러 무결성 | 영구 (backend SSE 변경 시 동기화) |
| `ReportSchema` 본체 + 기존 4 블록 시그니처 | `frontend/src/design/types/report.ts` | 9.x 인터페이스 계약 (frontend ↔ backend pydantic mirror). **신규 union 추가는 forward-compat additive로 잠금 정합** | 9.x 종료 시 |
| `LLMProvider.complete` keyword-only signature | `backend/llm/base.py` | per-request tuning 계약 + 모든 provider 미러 의무 | 영구 |
| SKILL.md frontmatter 표준 | `backend/tools/*/SKILL.md` + `prompts/loader.py` | 합성 흐름 안정성 | 영구 |

## 잠금 단위 카테고리

### 1. 공용 인터페이스 시그니처 (영구)
- ABC class의 abstract method signature
- public API 라우터의 request/response 모델
- 라이브러리 entry point export
- 예: `LLMProvider.complete(messages, tools, *, max_tokens=None, ...)` keyword-only signature

### 2. Cross-area 이벤트 / DTO (영구 또는 phase 종료 시)
- backend SSE 이벤트 ↔ frontend type mirror
- backend Pydantic ↔ frontend TypeScript interface mirror
- 예: `events.py` `AgentEvent` union

### 3. JSON 계약 / Schema (phase 종료 시)
- 사용자 입력 / LLM 출력 / 도구 출력의 구조화 schema
- 예: `ReportSchema` Phase 9.1

### 4. 자산 표준 / 워크플로우 (영구)
- 파일 구조 표준 (예: SKILL.md frontmatter)
- 디렉토리 컨벤션 (예: `tools/<name>/{tool.py, SKILL.md}`)

### 5. 영역 권한 (영구)
- agent territory 매핑 (예: `backend/` → BackEnd Infra, `frontend/src/framework/` → Frontend, `frontend/src/design/` → Design)
- 의존 방향 제약 (예: design은 framework를 import 하지 않음)

## 잠금 정책 (운영 메모)

### 잠금 단위 명시 표준
위임 명세에 잠금 단위를 명시할 때:

> "`X 파일 안의 Y symbol/section만 변경 금지`" 또는 "`X 파일의 일반 영역은 자유`"

회피할 표현:
> ~~"X 파일 통째 변경 금지"~~ — 너무 broad, 합리적 변경도 막힘

### 충돌 발생 시 해결 우선순위

1. **우회 우선** — 잠금 영역 옆에 새 symbol 추가로 우회. 예: `framework/EnrichedChatMessage`처럼 design/ types를 확장하지 않고 framework/에서 wrapping
2. **구조적 리팩터로 해소** — 미래 충돌까지 예방하는 정리 (예: 한 events.ts를 도메인 분리로 쪼개기)
3. **잠금 깨기** — 마지막 수단. supervisor + 사용자 합의 + 모든 의존 영역 동시 갱신 필수.

### 잠금 추가 / 만료 시점

- **추가**: 새 phase가 한 인터페이스를 도입하면서 다른 영역이 의존하기 시작할 때. supervisor가 즉시 표에 추가.
- **만료**: phase boundary에서 supervisor가 검토. 더 이상 cross-area 의존이 없으면 잠금 해제. (만료 컬럼이 "Phase X 종료 시"로 설정된 경우 해당 phase 종료 시 자동 검토.)

## Locks Registry vs git lock files

- **git lock files** (예: branch protection, CODEOWNERS) — repo-level, machine-enforced
- **본 Locks Registry** — supervisor protocol-level, human-enforced via supervisor 합의

본 Registry는 git lock의 대체가 아니라 **결정 박제 + 위임 명세 작성 시 참조용**. 강제는 supervisor 검수 + agent 위임 검증 가드가 담당.

## 운영 사례

### 사례 1: forward-compat additive 변경 (잠금 정합 유지)

LossZero Phase 9.1에서 `ReportBlock` discriminated union을 잠금. Cycle 2 (Phase A)에서 신블록 3종 추가 — union에 새 type 추가는 **기존 4 블록 시그니처 무변경** + LLM이 신 type을 emit할 때만 동작. **잠금 정합 유지**.

### 사례 2: 잠금 깨기 (Cycle 1 rename)

`BuildReportTool` 잠금 (Phase 9.1) → Cycle 1에서 `BuildSchemaTool`로 rename. 잠금 깬 사례. 처리:
- supervisor + 사용자 합의 (background 박제)
- 모든 의존 영역 동시 갱신 (backend 클래스 / SKILL.md / frontend SSE 이벤트 비교 string / 한글 라벨 dict)
- atomic rename — 4 commit 묶음 (`4dc8d9e..2c1c15d`)
- 잠금 표 갱신 (`BuildReportTool` → `BuildSchemaTool`)

### 사례 3: 우회 (충돌 회피)

LossZero에서 `events.ts` `ChatMessage` 잠금 + framework가 reportSchema 메타데이터 첨부 필요 — design types 확장 대신 framework에 `EnrichedChatMessage = ChatMessage & { reportSchema?: ... }` 신설. 잠금 무위반.

## 본 Registry pattern의 출처

LossZero Phase 9 (Deep Agent Loop / Report Pipeline) 클로즈 시점 도입. cross-area 인터페이스 동기화 부담이 임계치 도달.
