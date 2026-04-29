# Claude Design 재주입 패키지 절차

> **본 파일은 cold-start 프롬프트가 아니다.**
> Claude Design은 외부 도구(파일시스템 접근 별도 메타 논의)이므로, supervisor가 위임 직전 `design-export/` 패키지를 생성하고 그 안의 자료 + 프롬프트를 외부 도구에 전달하는 절차서.

---

## 사용 흐름 (supervisor 관점)

```
1. design 변경 작업 결정 (예: 새 차트 팔레트, TweaksPanel 옵션, 컴포넌트 디자인)
2. supervisor가 본 절차에 따라 design-export/ 패키지 생성
3. Claude Design 외부 도구에 패키지 + 본 파일 §6 프롬프트 초안 전달
4. Claude Design 산출물 (디자인 결정 / 코드 변경 제안) 회수
5. supervisor가 frontend/src/design/ 실제 파일에 반영 (또는 Front/View 세션에 위임 — 단 design/ 직접 변경은 supervisor 또는 Claude Design 결정 사항만 반영)
```

---

## 1. 목표

Claude Design에 컨텍스트 재주입 시 토큰 소모를 최소화하면서 현재 코드베이스 상태를 정확히 전달. 출력 디렉토리는 항상 `design-export/`로 고정.

---

## 2. 패키지 구성 규격

### 2.1 필수 포함 (항상)

- `frontend/tailwind.config.ts`
- `frontend/src/design/index.css` (CSS 변수 / OKLCH 토큰 / density 변수 정의)

### 2.2 조건부 포함

이번 작업 사이클에서 실제로 변경된 컴포넌트 파일만:

- 판단 기준: `git diff --name-only HEAD~1` 결과 중 `frontend/src/design/components/*` 또는 `frontend/src/design/*.css`에 해당하는 것만
- 전체 `components/` 디렉토리 일괄 포함 **금지**

### 2.3 항상 제외

- 비즈니스 로직 (API 호출, 상태관리, 라우터) — `frontend/src/framework/` 전체
- 타입 정의 전용 (`*.d.ts`, `types.ts`)
- 테스트 (`*.test.*`, `*.spec.*`)
- `node_modules`, `.git`, `dist`, `build`
- `backend/` 디렉토리 전체

---

## 3. 상태 동기화 파일 (매 사이클 자동 생성)

### 3.1 `design-export/DELTA.md` — 직전 사이클 대비 변경사항

```
## 변경 사이클: [날짜 + 간단한 작업 설명]

### 변경된 파일
- [파일 경로]: [변경 내용 한 줄 요약]

### 변경되지 않은 주요 파일
- [파일 경로]: [유지 이유]

### Claude Design에 전달할 맥락
- 이번 변경의 목적:
- 유지해야 할 디자인 결정:
- 새로 반영해야 할 요소:
```

### 3.2 `design-export/SNAPSHOT.md` — 현재 디자인 시스템 상태

```
## 디자인 시스템 현재 상태

### 스택
- 프레임워크: React 18.3 + Vite 5 + TypeScript 5
- 스타일링 방식: Tailwind 3 + OKLCH CSS 변수 (frontend/src/design/index.css)
- 컴포넌트 라이브러리: 자체 (frontend/src/design/components/primitives.tsx 등)

### 컬러 시스템
- Primary:
- Secondary:
- 차트 팔레트 (6단계): teal / ember / violet / mono
- 의미 색상: --success / --warning / --danger / --info

### 타이포그래피
- 폰트:
- 스케일 요약:

### 주요 컴포넌트 목록
- primitives.tsx: Button, Dot, cls 유틸
- icons.tsx: SVG 아이콘 라이브러리
- TweaksPanel.tsx: 테마/density/팔레트 설정 UI
- AppShell.tsx: 사이드바 + 헤더 레이아웃
- ChatInput.tsx, MessageThread.tsx, AgentTrace.tsx
- VizPanel.tsx (SwitchableViz: bar/line/pie/table/number)
- ConversationList.tsx, ResultsBoard.tsx

### 현재 미완성/개선 예정 영역
-
```

---

## 4. 실행 절차 (supervisor 수동/스크립트)

```
1. git diff --name-only HEAD~1 로 변경 파일 목록 추출
2. 변경 파일 중 §2.2 포함 기준 해당하는 것만 선별
3. design-export/ 디렉토리 초기화 후 재생성 (이전 사이클 잔존 방지)
   rm -rf design-export/ && mkdir design-export/
4. 필수 포함 파일 복사 (§2.1, 원본 디렉토리 구조 유지)
5. 조건부 포함 파일 복사 (§2.2)
6. DELTA.md 생성 (§3.1, 변경사항 자동 분석)
7. SNAPSHOT.md 생성 (§3.2, 현재 디자인 시스템 상태 분석)
8. 최종 패키지 구성 요약 출력
```

`design-export/`는 git 추적 정책 결정 필요:
- (a) git 추적 — 매 사이클 커밋, 패키지 이력 보존
- (b) `.gitignore` 등록 — 임시 산출물 취급
권장: 초기엔 (b), 운영 안정화 후 (a) 검토.

---

## 5. 주입 전략 자동 판단

| 상황 | 권장 전략 | 이유 |
|------|---------|------|
| 신규 화면/컴포넌트 추가 | 토큰 파일 + SNAPSHOT.md + 프롬프트 | 기존 UI 재현 불필요 |
| 기존 UI 부분 수정 | 토큰 파일 + 변경 컴포넌트 + 스크린샷 | 재현도와 핸드오프 품질 균형 |
| 전체 디자인 고도화 | 토큰 파일 + 스크린샷 + DELTA.md | 코드보다 시각적 현재 상태가 효율적 |
| 직전 사이클 미세 조정 | DELTA.md + 스크린샷만 | 맥락이 이미 있으므로 최소 주입 |

---

## 6. Claude Design 전달 프롬프트 초안 (§5 전략 기반)

DELTA.md + SNAPSHOT.md를 참조해 다음 형식으로 외부 도구에 전달:

```
프로젝트: LossZero LLM Harness — 프론트엔드 디자인 시스템

본 첨부 design-export/ 패키지의 자료를 참고해 다음 작업을 수행:

[작업 명세]
- (이번 사이클에 supervisor가 결정한 변경 의도)

[제약]
- 디자인 토큰(OKLCH CSS 변수)와 density 변수는 그대로 유지
- design ↔ framework 분리 원칙 준수: framework 의존 금지
- 컴포넌트 prop 추가는 OK, 시그니처 파괴는 사전 합의 필요

[입력]
- design-export/SNAPSHOT.md — 현재 디자인 시스템 상태
- design-export/DELTA.md — 직전 사이클 변경사항
- design-export/ 안의 토큰 정의 + 변경 컴포넌트 코드

[출력 기대]
- 디자인 결정 요약 (선택지/이유)
- 코드 변경 제안 (파일별 diff 또는 전체 본문)
- 추가 토큰 필요 시 OKLCH 값 제안
- TweaksPanel 영향 시 새 옵션 안내
```

---

## 7. 보고 형식 (supervisor가 패키지 생성 후 사용자에 보고)

```
## design-export/ 패키지 생성 완료

### 포함된 파일 ([N]개)
- [파일 목록]

### 제외된 파일 및 이유
- [파일]: [이유]

### 권장 주입 전략
[§5 판단 기준 기반 명시]

### Claude Design 프롬프트 초안
[§6 본문에 작업 명세 채워서 사용자에 전달]
```

---

## 8. Claude Design 산출물 통합

회수된 산출물의 실제 코드 반영 주체:

- **간단한 토큰/팔레트 추가**: supervisor 직접 반영
- **새 컴포넌트 / 컴포넌트 props 추가**: supervisor가 본 design 산출물을 design/ 파일에 반영. Front/View 세션에는 design/ 직접 수정 권한 없음
- **토큰 + framework 양쪽 변경 필요**: supervisor가 design/ 부분 직접 반영 → Front/View에 framework/ 부분 위임

반영 후 다음 갱신:
- `frontend/src/design/index.css` (토큰 추가 시)
- `frontend/src/design/components/*` (컴포넌트 변경 시)
- SPEC.md §2 / ARCHITECTURE.md "디자인 시스템" 섹션 (구조 변경 시)

---

## `/clear` 안전 시점

본 절차서는 supervisor 측에서 사용. supervisor 세션의 `/clear` 안전성은 `HANDOFF.md` §`/clear` 전 체크리스트(supervisor 측) 참조. 외부 Claude Design 도구는 본 협업 인프라 외부라 별도 관리.
