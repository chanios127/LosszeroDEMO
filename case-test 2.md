# Case Test 2 — 직원별 업무일지 5턴 시나리오 정합도 평가 보고서

**작성**: 2026-04-28 / Debug 에이전트 세션
**대상**: LM Studio 기반 에이전트 챗봇이 5턴 대화에서 "직원별 업무일지(이번주, 모든 직원)"을 조회하다가 도구 호출 시 컬럼명 환각을 두 번 연속 일으키고 사용자 cancellation으로 종료된 시나리오
**검증 방식**: GW 스킬(`.claude/skills/LosszeroDB_GW/meta.py`)로 `TGW_TaskDailyLog`의 실제 컬럼 메타를 직접 조회 + `groupware/tables.json` 등록 컬럼 대조 + 도메인 컨텍스트 노출 정책 코드 검증

---

## TL;DR

- **표면 증상**: Q4의 `td_Date` 환각 → SQL 실패. Q5의 `tcd_CreateDate` 환각 → SQL 실패. 5턴 도구 성공 0회. 사용자 cancel.
- **본질 진단**: case-test 1과 **동일한** 도메인 컨텍스트 소실 패턴 + LLM이 도메인 없는 상태에서 컬럼 prefix(`td_`) 변형 추측.
- **Transcript 시점**: 본 transcript는 **Fix 1 (`e4bf49a` sticky domain) 머지 *직전*에 캡처된 것으로 추정**. 마지막 줄의 `watchfiles ... main.py changes detected ... Reloading`이 Fix 1 commit 적용 reload일 가능성. Q2/Q4/Q5 모두 `system_total_len=0` — Fix 1 적용 시점이라면 sticky로 9785+ 유지됐어야 함.
- **추가 발견**:
  1. **사용자에게 거짓 정보 보고** — Q4 응답에서 "이 테이블에 날짜 컬럼이 존재하지 않아 주간 필터링 불가"라고 단정. 실제로 `td_writeDt`(작성일시)가 도메인 스키마에 노출되어 있음.
  2. **두 번째 동일 패턴 에러 학습 실패** — Q4 `Invalid column name` 에러 후 Q5에서도 prefix까지 바꿔 또 환각.
  3. **`tables.json` 컬럼 정의 불완전** — 실제 DB 15+ 컬럼 vs 등록 8 컬럼 (`td_regDt`/`td_modDt`/`td_OffCd`/`td_regUid`/`td_modUid` 등 누락). 본 case엔 영향 없으나 잠재적 다른 시나리오 위험.
- **개선안 핵심**: **Fix-A (Fix 1 효과 재검증)** 우선. Fix 1만으로 td_Date 환각도 해결될 가능성이 높음 — 도메인 살아있으면 td_writeDt를 LLM이 봤을 것이기 때문. 잔존 시 Fix-B(컬럼 노출 정책 보강) 자율 C 진행.

---

## 1. Ground Truth — 스킬 + tables.json + 코드 검증

### 1.1 TGW_TaskDailyLog의 실제 시간 컬럼

**스킬 직접 조회** (`python meta.py column_info TGW_TaskDailyLog`):

실제 DB 컬럼 15개. 시간 컬럼 3종 존재:

| # | 컬럼 | 타입 | 의미 |
|---|---|---|---|
| 5 | **`td_writeDt`** | datetime | 작성일시 |
| 13 | `td_regDt` | datetime | 작성일 (이력) |
| 15 | `td_modDt` | datetime | 수정일 |

**tables.json 등록 컬럼 8개** (`backend/schema_registry/domains/groupware/tables.json:252-309`):

| # | 컬럼 | 타입 | 등록? |
|---|---|---|---|
| 1 | td_TDNo (PK) | varchar(10) | ✓ |
| 2 | td_myUid | varchar(20) | ✓ |
| 3 | td_myDept | varchar(10) | ✓ |
| 4 | td_addrUid | varchar(20) | ✓ |
| 5 | **td_writeDt** | datetime | ✓ |
| 6 | td_Title | varchar(200) | ✓ |
| 7 | td_Today | varchar(8000) | ✓ |
| 8 | td_Tomorrow | varchar(4000) | ✓ |
| 9~15 | (td_addFileNm/td_rawFile/td_OffCd/td_regUid/td_regDt/td_modUid/td_modDt) | — | **❌ 누락** |

**도메인 노출 정책** (`backend/domains/loader.py:256-271`): PK + 첫 10 비-PK 컬럼. 본 테이블은 등록된 8개 모두 노출 범위 안 → **`td_writeDt`가 도메인 스키마에 반드시 포함되어 LLM에게 전달**.

→ **결론**: 도메인 컨텍스트가 system 메시지에 살아있는 한 LLM은 `td_writeDt`를 알 수 있다. 환각의 주된 원인은 도메인 컨텍스트 소실(아래 §3.1).

### 1.2 에이전트가 환각한 컬럼

| 턴 | LLM이 작성한 컬럼 | 실제 존재? | 환각 패턴 |
|---|---|---|---|
| Q4 | `t.td_Date` | **❌** | 의미 매핑 환각 — `td_Today` 노출 인지 후 "Today=Date"라 변형 추측 |
| Q5 | `t.tcd_CreateDate` | **❌** | prefix 자체 환각 — `td_` → `tcd_`로 변형, `CreateDate`까지 fabricate |

→ 두 환각 모두 `system_total_len=0` 상태에서 발생. case-test 1의 한글 alias 환각(`[현안제목]`)과 영문 prefix 변형 환각(`tcd_CreateDate`)은 **표현 형태만 다른 동일 root cause**.

### 1.3 사용자 cancel 시점

- Q5 "최신 100건 ㄱㄱ" 처리 중 두 번째 환각(tcd_CreateDate) 직후 사용자 Ctrl-C → `Cancelled by user`.
- 5턴 도구 성공 0회 + 명확화 3회 + 환각 2회 → frustration 누적 → cancel.

---

## 2. 턴별 정합도 평가

| 턴 | 사용자 입력 | 에이전트 동작 | 정확도 | 비고 |
|---|---|---|---|---|
| Q1 | 직원별 업무 일지 조회. | 32k 행 보호 차원 명확화 질문, 도구 X | **90%** | 큰 테이블에 대한 적절한 안전 판단 |
| Q2 | 이번주. | 도메인 컨텍스트 사라짐(`system=0`). 직원 미지정 재명확화 | **70%** | 명확화 자체는 정당하나, "직원별" Q1 의도에서 "전체 직원"으로 default 추론 가능 여지 |
| Q3 | TGW_TaskDailyLog | 도메인 매칭 복구(`TGW` 키워드 hit). 사용자 답을 메타 정보로 해석, 또 명확화 | **50%** | 사용자 의도("이 테이블로 진행해라") 파악 약함. 3턴 연속 명확화 |
| Q4 | 모든 직원 | 도메인 다시 사라짐 → `td_Date` 환각 → SQL 실패 → "날짜 컬럼 없음"이라 사용자에게 **잘못된 정보 보고** | **0%** | 본 case 핵심 실패. `td_writeDt`가 실재함에도 거짓 단정 |
| Q5 | 최신 100건 ㄱㄱ | 도메인 여전히 사라진 상태, `tcd_CreateDate` 환각 → SQL 실패 → 사용자 cancel | **0%** | 같은 패턴 에러를 prefix까지 바꿔서 재발 |

**가장 큰 손실**: Q4의 "이 테이블에 `td_Date`라는 이름의 날짜 컬럼이 존재하지 않아 주간 필터링을 수행할 수 없었습니다" 단정. 실제로 `td_writeDt`가 존재하므로 거짓. 사용자가 도메인 비전문가일 경우 LLM 답을 그대로 신뢰 → **시스템 신뢰 손상**.

---

## 3. 근본 원인 — 코드 위치별 진단

### 3.1 [CRITICAL] case-test 1과 동일 — 후속턴 도메인 컨텍스트 소실

**위치**: `backend/main.py:314-315` (Fix 1 적용 전) + `backend/domains/loader.py:182-210`

**증상 (백엔드 로그)**:
```
Q1: AgentLoop start: messages=2 (system=1, other=1) system_total_len=9785  ← 매칭 OK
Q2: AgentLoop start: messages=3 (system=0, other=3) system_total_len=0     ← "이번주" 매칭 실패
Q3: Domain matched: groupware for query: TGW_TaskDailyLog                   ← TGW 키워드로 복구
    AgentLoop start: messages=6 (system=1, other=5) system_total_len=9785
Q4: AgentLoop start: messages=7 (system=0, other=7) system_total_len=0     ← "모든 직원" 매칭 실패
Q5: AgentLoop start: messages=9 (system=0, other=9) system_total_len=0     ← "최신 100건 ㄱㄱ" 매칭 실패
```

**메커니즘**: case-test 1과 동일. `match_domain`이 매 턴마다 단순 키워드 substring 카운트로 score 산출 → follow-up 빈출 토큰("이번주/모든/최신")은 groupware 키워드에 없음 → score=0 → `domain_ctx=""` → AgentLoop가 system 메시지 미주입.

**해결됨 여부**: **Fix 1 (`e4bf49a` sticky domain) 적용 후 main에 안착**. 본 transcript는 Fix 1 머지 *전* 캡처 가능성이 매우 높음 (마지막 줄 watchfiles reload 로그). → 동일 시나리오를 현재 main에서 재현하면 **Q2/Q4/Q5 모두 `system_total_len > 0` 유지**될 것으로 기대.

### 3.2 [HIGH] 컬럼명 환각이 case-test 1과 다른 패턴으로 발현

**증상**:
- Q4: `td_Date` (의미 매핑 환각 — `td_Today` 노출됐는데 "Today=Date" 변형 추측)
- Q5: `tcd_CreateDate` (prefix 자체 환각 — `td_` → `tcd_`)

**메커니즘**:
- 도메인 컨텍스트 없는 상태에서 LLM이 컬럼 prefix(`td_`) 패턴을 보고 변형 추측.
- case-test 1: 한글 alias(`[현안제목]`)를 컬럼처럼 추측 / case-test 2: 영문 prefix 패턴 추측. **두 경우 모두 도메인 스키마 부재가 원인**.

**Fix 1로 해결 기대**:
- Q4 시점에 sticky=groupware로 도메인 컨텍스트 살아있으면 `td_writeDt`가 도메인 스키마에 노출 → LLM이 이를 사용했을 가능성 높음.
- 100% 보장은 아님 — 모델 자체가 도메인 스키마를 정밀 참조하지 않을 가능성. **재현 검증 필수**.

### 3.3 [MEDIUM] 두 번째 동일 패턴 에러 학습 실패

**증상**: Q4의 `Invalid column name 'td_Date'` 에러 후 Q5에서 또 다른 잘못된 컬럼(`tcd_CreateDate`) 사용. 에러 메시지를 보고도 `list_tables` 호출이나 도메인 스키마 재참조 안 함.

**위치**: `backend/prompts/system_base.md` (회복 가이드 부재).

**메커니즘**: case-test 1의 §3.4와 동일.

**해결 경로**: Fix 4 (system_base.md 수정 → §5.2 #1 트리거 → A 경유 필수). Phase 9 sub-phase 9.4에 흡수됨.

### 3.4 [MEDIUM] 자기보고 거짓 — schema 부재라고 단정

**증상**: Q4 응답에서 LLM이 `td_Date` 환각 후 사용자에게 "이 테이블에 `td_Date`라는 이름의 날짜 컬럼이 존재하지 않아 주간 필터링을 수행할 수 없었다", "혹시 업무 일지의 날짜 정보가 담겨 있는 다른 컬럼 이름이 있으신가요?"라고 단정.

**문제**: `td_writeDt`가 실재. 거짓 보고로 사용자에게 schema 결함 누명. 비전문가 사용자는 LLM 답을 그대로 신뢰 → **시스템 신뢰 손상**.

**해결 경로**: §3.2 + §3.3과 함께 처리. Fix 1 + Fix 4 적용 시 자연스럽게 완화. Fix 4에 "Invalid column name 에러 시 절대 'schema에 없다'고 단정 X — `list_tables` 또는 도메인 스키마 재참조 후에만 발언" 추가.

### 3.5 [LOW] tables.json의 컬럼 정의 불완전

**위치**: `backend/schema_registry/domains/groupware/tables.json:249-309`

**증상**: 실제 DB 15+ 컬럼 vs 등록 8 컬럼. 누락:
- `td_addFileNm` (첨부파일명)
- `td_rawFile` (첨부파일 데이터, image)
- `td_OffCd` (사업장코드)
- `td_regUid` (등록자ID)
- **`td_regDt`** (등록일, datetime — 시간 필터에 활용 가능)
- `td_modUid` (수정자ID)
- **`td_modDt`** (수정일, datetime)

**파급**:
- 본 case에선 `td_writeDt`가 등록되어 있어 영향 없음.
- 그러나 다른 시나리오에서 누락된 컬럼이 핵심이라면 도메인 스키마 살아있어도 LLM이 그 컬럼 모름.
- 같은 누락 패턴이 다른 테이블에도 있을 가능성 → 시스템 전반 신뢰성 영향.

**주의**: 단순히 모든 컬럼을 노출하면 system_len 폭증. 첫 10 컷오프 + datetime 타입 우선 같은 정책 필요(Fix-B 참조).

**해결 경로**: 두 갈래 (병행 가능)
- (a) `tables.json` 보강 — DB Domain Manager 영역
- (b) `domains/loader.py:259-261` 컬럼 노출 정책 — datetime/date 타입은 첫 10 컷오프 외에도 항상 노출 (Fix-B)

### 3.6 [LOW] 사용자 의도 해석 약함

**증상**: Q3 "TGW_TaskDailyLog"를 사용자가 던졌을 때 LLM이 "이 테이블 맞다, 그래서 어떤 직원?"으로 또 명확화. 사용자가 이미 Q1에서 "직원별"이라 했으므로 "모든 직원" default 추정 가능했음.

**파급**: 3턴 연속 명확화 = 사용자 frustration 증폭. 결국 Q4에서 사용자가 "모든 직원"이라 명시 → 그제서야 도구 호출 시도 → 환각 실패.

**해결 경로**: Phase 9 sub-phase 9.4의 시스템 프롬프트 가이드에 "한 가지 정보만 빠진 경우 일단 합리적 default로 시도, 명확화 반복 회피" 추가 검토.

---

## 4. 개선안 (우선순위 + 가드레일 self-judge)

### Fix-A — Fix 1 효과 재검증 (가장 시급)

**목적**: 본 transcript가 Fix 1 적용 *전* 시점일 가능성이 높으므로, 현재 main에서 동일 시나리오 재현하여 다음 확인:
- Q2/Q4/Q5 `system_total_len`이 9785+ 유지되는지 (Fix 1 sticky 효과)
- Q4의 `td_Date` 환각이 여전히 발생하는지 (도메인 살아있으면 `td_writeDt`를 LLM이 보는지)
- Q5의 `tcd_CreateDate` 환각도 동일 검증

**가드레일 self-judge**: 코드 변경 없는 read-only 검증 → Debug §5.5 자율 read-only 분석 영역. **본 사이클 외 별도 Debug 사이클**로 진행 권장.

### Fix-B (조건부) — `domains/loader.py` 컬럼 노출 정책 보강

**전제**: Fix-A 결과 환각이 잔존할 때만 진행.

**위치**: `backend/domains/loader.py:259-261`

**변경**: 첫 10 컷오프 외에도 datetime/date 타입 컬럼은 항상 노출.
```python
pk_cols = [c for c in cols if c.get("pk")]
other_cols = [c for c in cols if not c.get("pk")]
date_cols = [c for c in other_cols
             if "date" in c.get("type", "").lower() or "time" in c.get("type", "").lower()]
non_date_first10 = [c for c in other_cols if c not in date_cols][:10]
show = pk_cols + non_date_first10 + [c for c in date_cols if c not in non_date_first10]
```

**가드레일 self-judge**:
- domain_to_context 출력 형식 변경 = LLM 입력 형식. 단 도메인 JSON 스키마(§5.2 #4) 변경 아님 — loader 내부 표현만 바뀜.
- 시그니처(`domain_to_context`) 동일 → §5.2 #3 미해당.
- 시스템 프롬프트(§5.2 #1) 미수정.
- → **자율 C 가능**.

### Fix-C — `tables.json` 컬럼 보강 (DB Domain Manager 영역)

**위치**: `backend/schema_registry/domains/groupware/tables.json:249-309` (TGW_TaskDailyLog) + 다른 테이블 점검.

**변경**: 누락된 7개 컬럼 추가 (td_addFileNm/td_rawFile/td_OffCd/td_regUid/td_regDt/td_modUid/td_modDt). 다른 도메인 테이블도 동일 누락 패턴 점검.

**가드레일 self-judge**: 데이터 항목 추가, 구조 변경 아님 → §5.2 #4 미해당. **자율 C** 가능. 본 Debug 세션 영역 외 → DB Domain Manager에 별도 위임 권장.

### Fix-D — `system_base.md` 회복/거짓 단정 가드 (기존 Fix 4 강화, Phase 9에 박제됨)

**위치**: `backend/prompts/system_base.md`

**추가 문구 (예시)**:
- "쿼리가 `Invalid column name` 에러를 반환하면: 절대 '스키마에 없다'고 사용자에게 단정하지 말 것. `list_tables`로 컬럼 목록 재확인 후에만 발언 가능."
- "동일 패턴 에러가 두 번 연속이면 컬럼 추측을 멈추고 `list_tables` 호출."

**가드레일 self-judge**: §5.2 #1 직접 트리거 → **A 경유 필수** (Phase 9 sub-phase 9.4에 이미 흡수됨).

---

## 5. 권장 실행 순서

| 순서 | 작업 | 영역 | 사이클 |
|---|---|---|---|
| 1 | Fix-A (재검증) | Debug 세션 read-only | **별도 Debug 사이클** |
| 2 | Fix-C (tables.json 보강) | DB Domain Manager | **별도 위임** (분기와 무관) |
| 3 | Fix-B (조건부) | 자율 C | **Fix-A 결과 (i) 환각 잔존 시만** |
| 4 | Fix-D | A 경유 (Phase 9 9.4) | **이미 박제됨** |

**Fix-A 결과 분기**:
- (i) td_Date 환각 사라짐 → Fix 1만으로 본 case도 해결. 추가 fix 불필요.
- (ii) 환각 잔존 → Fix-B 자율 C 진행.

본 사이클(case-test 2 보고서 작성)은 보고서 산출에 한정. 추가 코드 변경은 별도 위임 후 진행.

---

## 6. 회귀 점검 명세 (Fix-A 검증 + Fix-B 적용 시)

**깨진 케이스** (Fix 1 + (조건부) Fix-B 적용 후 정상화 기대):
- 동일 5턴 시나리오 재현
  - Q2/Q4/Q5에서 `system_total_len > 0` 유지 (Fix 1 sticky 효과)
  - Q4 SQL에서 `td_writeDt` 사용 (환각 차단 효과)
  - Q4 응답에서 "날짜 컬럼 없다" 거짓 단정 사라짐
  - 5턴 도구 성공 ≥ 1회 (사용자 cancel 회피)

**영향 안 받은 케이스** (회귀 격리 근거):
- 다른 도메인의 첫-10 컷오프 컬럼 노출 (Fix-B는 datetime만 추가 노출 — 비-datetime 컬럼은 그대로 첫 10)
- 짧은 도메인(컬럼 ≤ 10)은 Fix-B 영향 없음
- `domain_to_context` 호출자(`/api/query`, `/api/generate_aggregation_sql`) 시그니처 미변경
- Fix-A는 read-only이므로 회귀 자체 발생 X

**검증 방법**:
- `cd backend && uv run python main.py` 후 frontend 또는 curl로 5턴 재현
- 백엔드 stdout `AgentLoop start: ... system_total_len=N` 4·5턴 비교
- Q4 `tool_start` 이벤트 SQL에서 `td_writeDt` 또는 다른 실제 컬럼 사용 여부 확인
- Q4 final answer에 "날짜 컬럼 없음" / "스키마에 없습니다" 류 단정 검색 (안 나와야 함)

---

## 7. 본 평가가 다루지 않은 영역

- **LM Studio 모델 자체 환각 성향** (prefix 변형, 의미 매핑 추측): 모델 교체로 일부 개선 가능하나 본질 아님. Fix 1 + Fix-B + Fix-D 합산 효과 우선.
- **사용자 의도 해석 (3턴 명확화 frustration)**: Phase 9 9.4 시스템 프롬프트 가이드에 흡수.
- **다른 도메인 테이블의 tables.json 컬럼 누락 점검**: DB Domain Manager 영역, 별도 cycle.

---

## 8. Critical Files

| 파일 | 영역 | 관련 Fix |
|---|---|---|
| `backend/main.py:317-329` | sticky domain 적용 위치 (Fix 1 commit `e4bf49a`, 이미 머지) | Fix-A 재검증 대상 |
| `backend/domains/loader.py:256-271` | 컬럼 노출 정책 (PK + 첫 10 컷오프) | Fix-B |
| `backend/schema_registry/domains/groupware/tables.json:249-309` | TGW_TaskDailyLog 컬럼 정의 (8개 등록 / 실제 15+) | Fix-C |
| `backend/prompts/system_base.md` | base prompt — 회복 가이드 / 거짓 단정 가드 | Fix-D (Phase 9 9.4) |

---

## 9. Case-Test 1과의 비교 요약

| 항목 | Case-Test 1 (AS현안) | Case-Test 2 (업무일지) |
|---|---|---|
| 핵심 root cause | 도메인 컨텍스트 소실 + tool history 폐기 | 도메인 컨텍스트 소실만 (단일턴 환각) |
| 환각 형태 | 한글 alias(`[현안제목]`) → 컬럼처럼 사용 | 영문 prefix 변형(`td_Date`, `tcd_CreateDate`) |
| 시간 컬럼 ground truth | `wb_emFg` (Top 3 ranking 결정 가능했음) | `td_writeDt` (주간 필터 가능했음) |
| Fix 1 효과 예상 | Q3 SQL 정상화 (검증 후 기대) | Q4/Q5 환각 차단 가능성 (재검증 필요) |
| 추가 fix 필요? | Fix 2/3/4 (Phase 9에 흡수) | Fix-B (조건부) + Fix-C (병행) |
| 사용자 결과 | Top 3 누락된 채 종료 | 사용자 cancel (frustration) |

→ 두 case는 **동일 root cause의 두 발현 양태**. Fix 1이 가장 큰 효과 — 두 case의 약 70%를 함께 해결할 것으로 예상. 잔여 30%는 Phase 9 9.4 (system 프롬프트 가이드 정제)로 흡수.
