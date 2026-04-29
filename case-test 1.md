# Case Test 1 — AS현안 다중턴 시나리오 정합도 평가 보고서

**작성**: 2026-04-28 / Debug 에이전트 세션
**대상**: LM Studio 기반 에이전트 챗봇이 4턴 대화에서 거래처별 AS현안을 조회·분석·재가공하는 실제 사용자 시나리오
**검증 방식**: GW 스킬(`.claude/skills/LosszeroDB_GW/Query.py`)로 동일 질의를 직접 재현하여 ground truth 확보 후 에이전트 출력과 대조

---

## TL;DR

- **표면 증상**: Q3에서 SQL 컬럼명 오류 2회 → 포기. Q4에서 사용자가 명시 요청한 "Top 3 치명적 이슈" 미충족.
- **본질 진단**: LLM 모델 한계가 아니라 **harness 아키텍처 결함 2종**의 합산 효과
  1. 후속턴에서 도메인 스키마가 system 프롬프트에서 통째로 사라짐 (`system_total_len=9785 → 0`)
  2. 이전 턴의 tool_use / tool_result 메시지가 `_conversations`에 보존되지 않음
- **결정론적 답이 가능했던 부분**: "치명적 이슈 Top 3"는 `wb_emFg='Y'` 플래그만으로 답할 수 있었음 (옥스/동광/성수기전 3건). 도메인 스키마가 살아 있었으면 LLM이 이 컬럼을 참조했을 가능성이 높다.
- **개선안**: Fix 1+2(자율 C 가능)만으로 본질 해결. Fix 3+4(prompt 보강)는 supervisor A 경유.

---

## 1. Ground Truth — 스킬 기반 직접 검증

### 1.1 Q1 ground truth — 최근 1개월 AS 현안

**스킬 직접 실행**:
```sql
SELECT COUNT(*) FROM dbo.TGW_WorkBoard w
WHERE w.wb_reqDt >= DATEADD(month, -1, GETDATE())
-- → 30건
```

| 항목 | 값 |
|---|---|
| 도구 반환 행수 | **30건** |
| 에이전트 markdown 표 | **25건** (현안번호 26-00152 ~ 26-00128) |
| 에이전트 자기보고 (Q4 본문) | **"총 24건"** |

**누락된 5건** (2026-03-30 ~ 2026-04-07):

| 번호 | 거래처 | 일자 |
|---|---|---|
| 26-00127 | (주)옥스머티리얼즈 | 2026-04-07 |
| 26-00126 | (주)무궁상사 | 2026-04-02 |
| 26-00125 | (주)한일가구 | 2026-04-01 |
| 26-00124 | 2025-(주)성수기전 | 2026-03-31 |
| 26-00123 | 2025-(주)성수기전 | 2026-03-30 |

→ **세 숫자(30/25/24)가 모두 다름**. 옥스 1건 + 성수기전 2건 누락이 후속 분석에 직접 영향.

### 1.2 Q3 ground truth — 최근 3개월 재고/자재/오류 관련

**스킬 직접 실행**:
```sql
SELECT c.cu_custNm, w.wb_WBNO, w.wb_Title, w.wb_reqDt,
       w.wb_emFg, w.wb_reqLevel
FROM dbo.TGW_WorkBoard w
LEFT JOIN dbo.TCD_Customer c ON w.wb_CustCD = c.cu_custCd
WHERE w.wb_reqDt >= DATEADD(month, -3, GETDATE())
  AND (w.wb_Title  LIKE N'%재고%' OR w.wb_Title  LIKE N'%자재%'
    OR w.wb_Title  LIKE N'%오류%' OR w.wb_Title  LIKE N'%에러%'
    OR w.wb_reqText LIKE N'%재고%')
ORDER BY w.wb_emFg DESC, w.wb_reqDt DESC
-- → 24건
```

**긴급여부 Y (`wb_emFg='Y'`) 3건** = 사용자가 요청한 "치명적 이슈 Top 3":

| # | 거래처 | 현안번호 | 제목 | 일자 |
|---|---|---|---|---|
| 1 | **(주)옥스머티리얼즈** | 26-00144 | 스캔 자재 투입 재고 미생성 오류 | 2026-04-17 |
| 2 | **2022-동광전자(주)** | 26-00141 | 휴가신청서 작성 시 중복키 에러 후 기존 내역 사라짐 | 2026-04-16 |
| 3 | **2025-(주)성수기전** | 26-00064 | 합계내역 출력시 SQL오류 발생 | 2026-02-11 |

**거래처별 빈도 Top** (재고/자재/오류 키워드 24건 중):

| 거래처 | 건수 |
|---|---|
| 2025-(주)성수기전 | 6 |
| (주)옥스머티리얼즈 | 5 |
| 2023-에스티씨(주) | 2 |
| 2016-(주)엠엠피 | 2 |
| 2019-(주)쓰리젯 | 2 |

→ 에이전트 Q4의 "옥스 + 동광 + 동성화학" 결론은 **빈도 1위 성수기전 누락**(Q1 표 자체에 빠짐) + **긴급도 데이터 미참조**(`wb_emFg` 컬럼 존재 자체를 모름).

---

## 2. 턴별 정합도 평가

| 턴 | 사용자 요청 | 에이전트 동작 | 정확도 | 비고 |
|---|---|---|---|---|
| Q1 | 거래처별 AS 현안 (1개월) | 정확한 SQL 생성, 30건 반환 → 25건 렌더 | **60%** | SQL 자체는 정확. 데이터 손실 + 자기보고 불일치 (30/25/24) |
| Q2 | 옥스 요청 유형 | Q1 표에서 5건 옥스 항목을 분류·요약, 도구 추가 호출 X | **90%** | 적절한 판단. 단 Q1에서 누락된 옥스 1건(00127) 미반영 |
| Q3 | 3개월 재고 관련 + Top 3 치명적 | 한글 alias(`[현안제목]`)를 실제 컬럼처럼 SQL 작성 → 동일 에러 2회 → 포기 | **0%** | 완전 실패 |
| Q4 | Q1 데이터로 보고 | Q1 캐시 재가공, Top 3 ranking 누락 | **30%** | "옥스+동광+동성화학"은 Q1 표 빈도조차 부정확. 긴급도 미참조 |

**최대 손실**: 사용자가 Q3에서 명시 요청한 "치명적 이슈 Top 3"는 DB의 `wb_emFg='Y'` 플래그로 **결정론적으로 답할 수 있었던 항목**. 도메인 스키마만 살아 있었어도 LLM이 이 컬럼을 참조했을 가능성이 높다.

---

## 3. 근본 원인 — 코드 위치별 진단

### 3.1 [CRITICAL] 후속턴에서 도메인 스키마 누락

**위치**: `backend/main.py:314-315` + `backend/domains/loader.py:182-210`

**증상 (백엔드 로그)**:
```
Q1: AgentLoop start: messages=2 (system=1, other=1) system_total_len=9785
Q2: AgentLoop start: messages=3 (system=0, other=3) system_total_len=0
Q3: AgentLoop start: messages=5 (system=0, other=5) system_total_len=0
Q4: AgentLoop start: messages=7 (system=0, other=7) system_total_len=0

Q1: LM Studio request: ... system_len=12831
Q2: LM Studio request: ... system_len=3044
```
12831 - 3044 = 9787 ≈ 9785 (도메인 스키마가 통째로 사라진 정확한 양).

**메커니즘**:
- `/api/query`는 매 호출마다 `match_domain(body.query)`를 새로 실행 (`main.py:314`).
- `match_domain`은 단순 키워드 substring 매칭 (`loader.py:193`):
  ```python
  score = sum(1 for kw in d.get("keywords", []) if kw.lower() in q)
  ```
- `groupware/meta.json:5-35`의 keywords는 "출근/퇴근/근태/AS/현안/접수/처리/조치/결재/회의실/예약/평가/교육/건강검진/TGW" 등 **첫 진입 키워드 위주**. follow-up 빈출 토큰("옥스/유형/요청/재고/오류/업체/이미/조회/보고")은 없음.
- → Q2~Q4: score=0, `domain_ctx=""`, AgentLoop가 system 메시지 자체를 안 끼움 (`loop.py:100-101`).

**파급**: LLM은 `wb_Title`, `wb_reqDt`, `wb_CustCD`, `wb_emFg` 같은 실제 컬럼명을 알 길이 없어진다. **Q3 SQL 실패의 직접 원인.**

### 3.2 [HIGH] 도구 실행 이력이 다음턴에 전달되지 않음

**위치**: `backend/main.py:500`

**증상**: Q3 LLM은 Q1에서 자신이 작성한 `wb_Title`/`wb_reqDt` SQL 본문을 못 본다. 보이는 건 Q1 final answer markdown(거래처명/현안번호/현안제목 헤더)뿐.

**메커니즘**:
- `_conversations[session_id]`에는 user/assistant 텍스트만 누적 (`main.py:322, 500`):
  ```python
  _conversations[session_id].append({"role": "user", "content": body.query})
  ...
  _conversations[session_id].append({"role": "assistant", "content": final_answer})
  ```
- AgentLoop 내부에서 만들어지는 `assistant(tool_use)` + `tool(result)` 메시지는 로컬 `messages` 리스트에만 존재 (`loop.py:175, 199`), 턴 종료 시 폐기.
- `history = _conversations[session_id][-MAX_HISTORY:]` (`main.py:311`)는 final 텍스트만 회수.

**파급**: 도메인 스키마가 빠진 상태(3.1)에서 LLM이 의지할 단서는 **markdown 표 헤더뿐**. "거래처명/현안제목/접수일시/현안번호"를 컬럼처럼 인식 → SQL `[현안제목] LIKE ...` hallucination.

> **3.1과 3.2의 합산 효과**: 도메인 스키마 없음 + 과거 SQL 본문 없음 → LLM이 "보이는 한글 헤더 = 실제 컬럼명"이라고 추론하는 환각이 거의 보장된다. 모델 교체로는 해결되지 않는다.

### 3.3 [MEDIUM] 결과 행수 불일치 자기보고

- 도구 30행 반환 → markdown 25행 → 본문 24건 주장.
- `ToolResultEvent.rows=30`은 SSE로 가지만 **LLM에게 "30행이 도착했다"는 명시 메시지가 없다** (`loop.py:196-202`에서 도구 결과를 통째로 JSON으로 stuff). 모델 컨텍스트 한계 + 한국어 표 렌더 토큰 비용으로 LLM이 자체 truncation 판단을 내리는데 **harness가 이를 감지하거나 강제 재현하지 않는다**.

### 3.4 [MEDIUM] 에러 회복 전략 미흡

- Q3의 `Invalid column name` 에러 발생 시 LLM이 재시도 패턴이 시스템 프롬프트에 없음 (`backend/prompts/system_base.md`).
- `list_tables` 재호출 / 도메인 스키마 재참조 같은 회복 절차 가이드 부재 → 동일 SQL 미세변형 2회 후 포기.

### 3.5 [LOW] 키워드 매칭 자체의 brittleness

- 3.1의 fix(세션-점착)가 적용되면 자동 완화되지만, 첫 매칭조차 못 잡는 케이스(영어 질의, 동의어, 약칭)는 별개 문제.

---

## 4. 개선안 (우선순위 + 가드레일 self-judge)

### Fix 1 — 세션 점착 도메인 (3.1 해결, 가장 큰 효과)

**위치**: `backend/main.py` (`_conversations` 옆에 도메인 캐시 추가)

**변경**:
- 새 dict `_session_domains: dict[str, str] = {}` (session_id → domain code)
- `/api/query` 매칭 로직 순서:
  1. `match_domain(body.query)` 시도
  2. 매칭 실패 시 `_session_domains.get(session_id)` fallback
  3. 매칭 성공 시 `_session_domains[session_id] = matched["domain"]` 갱신
- 다른 도메인 키워드가 매칭되면 새 도메인으로 전환 (사용자 의도 존중)

**가드레일 self-judge (Debug §5.2)**: 단순 메모리 dict 추가, 인터페이스/SSE/시스템 프롬프트 모두 미변경 → **자율 C 가능**

### Fix 2 — Tool history 보존 (3.2 해결, 컨텍스트 누적의 본질)

**위치**: `backend/main.py` `_run` 종료 로직

**변경**:
- AgentLoop가 사용한 전체 `messages`(시스템 메시지 제외)를 `_conversations[session_id]`로 복사
- OpenAI 메시지 순서 규약 (`assistant(tool_use)` → `tool(result)` 페어) 깨지지 않도록 history 트리밍 시 incomplete pair 방지
- `MAX_HISTORY=20`(메시지 단위)이 이미 있어 폭주 방지됨

**가드레일 self-judge**: AgentLoop 인터페이스/SSE 스키마 미변경. `_conversations`는 §5.2 #6 명시 영역(`_run_tasks`, `_continue_gates`, `_sessions`) 외 단순 dict → **자율 C 가능 (회귀 명세 엄격)**

### Fix 3 — 결과 행수 명시 메시지 (3.3 mitigate)

**위치**: `backend/agent/loop.py:199-202`

**변경**: 도구 결과 wrapping 시 row count meta prepend
```python
content = f"[meta] rows={rows}\n{json.dumps(result, ensure_ascii=False, default=str)}"
```

**가드레일 self-judge**: loop.py 내부 메시지 wrapping 변경 = LLM 입력 형식 변경. 위치 무관 instruction 상수(§5.2 #1) 인접 → **모호 → 안전장치 ②로 A 경유 권장**

### Fix 4 — 에러 회복 가이드 (3.4)

**위치**: `backend/prompts/system_base.md` 또는 `backend/tools/db_query/description.md`

**변경**: "쿼리가 'Invalid column name' 에러를 반환하면, 컬럼명을 추측하지 말고 도메인 스키마(시스템 메시지) 또는 `list_tables`를 다시 참조하라" 한 줄 추가

**가드레일 self-judge**: §5.2 #1 직접 트리거 → **A 경유 필수**

### Fix 5 — domain matching 보강 (3.5, 선택)

**위치**: `backend/schema_registry/domains/groupware/meta.json` keywords 배열

**변경**: follow-up 빈출 토큰 추가 (단, Fix 1 적용 시 우선순위 떨어짐)

**가드레일 self-judge**: 데이터 추가, 구조 변경 아님 (§5.2 #4 미해당) → **자율 C 가능**

---

## 5. 권장 실행 순서

| 순서 | Fix | 처리 경로 | 효과 |
|---|---|---|---|
| 1 | Fix 1 (세션 점착 도메인) | 자율 C | 본질 해결 1/2 |
| 2 | Fix 2 (Tool history 보존) | 자율 C (회귀 엄격) | 본질 해결 2/2 |
| 3 | Fix 3 (loop.py 행수 메타) | A 경유 (보수) | 행수 정합성 mitigate |
| 4 | Fix 4 (system_base.md 회복 가이드) | A 경유 필수 | 에러 회복 강화 |
| 5 | Fix 5 (키워드 보강) | 자율 C, 후순위 | Fix 1 효과 측정 후 결정 |

**최소 본질 해결**: Fix 1+2만으로 Q3 SQL 환각 해소. supervisor 개입 없이 진행 가능.

---

## 6. 회귀 점검 명세 (Fix 1+2 적용 시 필수)

**깨진 케이스**:
- 동일 시나리오 (Q1~Q4) 재실행
  - Q3에서 `wb_Title`/`wb_reqDt` 사용한 정상 SQL 생성 확인
  - 로그에서 Q2~Q4 모두 `system_total_len > 0` 유지 확인
  - Q4에서 `wb_emFg='Y'` 기반 Top 3 ranking 등장 가능성 (LLM이 자율 판단)

**영향 안 받은 케이스** (회귀 격리 근거):
- 신규 세션 첫 질문에서 도메인 매칭 실패 (예: "안녕") → `domain_ctx=""` 그대로 동작 (Fix 1의 fallback이 빈 도메인을 만들지 않음)
- 도메인 전환: groupware 세션 중 사용자가 "MES 생산실적" 같은 다른 도메인 키워드 질의 → 새 매칭 우선, 점착 도메인 갱신
- 긴 대화 (20+ messages) → MAX_HISTORY 트리밍이 tool_use/tool_result pair 깨지 않는지 확인 (orphan tool_call 메시지로 인한 OpenAI 400 에러 방지)

**검증 방법**:
- `cd backend && uv run python main.py` 후 frontend 또는 curl로 Q1~Q4 4턴 재현
- 백엔드 stdout에서 `AgentLoop start: ... system_total_len=N` 값을 4턴 모두 비교
- Q3 SQL의 `tool_start` 이벤트에서 컬럼명이 `wb_*` 계열인지 확인
- `_conversations[session_id]`를 디버거로 dump해서 tool_use/tool_result 메시지 보존 여부 확인

---

## 7. 본 평가가 다루지 않은 영역

- **LM Studio 모델 자체 품질** (행수 truncation, alias 혼동): 모델 교체로 일부 개선 가능하나 본질 아님. Fix 1+2가 우선.
- **Top 3 critical 누락 자체**: Q3 SQL 성공 시 LLM이 `wb_emFg`를 자연스럽게 참조하게 되어 ranking 가능. 별도 instruction 강제 필요 시 Fix 4와 묶어 A 경유.
- **30행 vs 표 25행 차이**: 모델 본질적 한계. Fix 3로 mitigate, 완전 해결은 어려움.

---

## 8. Critical Files

| 파일 | 영역 | 관련 Fix |
|---|---|---|
| `backend/main.py:301-505` | `/api/query` 라우터, 세션 저장소 | Fix 1, 2 |
| `backend/agent/loop.py:74-239` | AgentLoop, 메시지 history 관리 | Fix 2, 3 |
| `backend/domains/loader.py:182-210` | `match_domain` 키워드 점수 | Fix 1 (참조) |
| `backend/llm/lm_studio.py:148-175` | 시스템 메시지 merge, system_len 계산 | 진단 (참조) |
| `backend/prompts/system_base.md` | base prompt | Fix 4 (A 경유) |
| `backend/schema_registry/domains/groupware/meta.json` | 키워드 목록 | Fix 5 |
| `backend/schema_registry/domains/groupware/tables.json:396+` | TGW_WorkBoard 실제 컬럼 정의 (`wb_emFg`, `wb_reqLevel` 포함) | 진단 (참조) |
