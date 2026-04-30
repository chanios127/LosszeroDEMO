# Error Case Catalog

> 작성: 2026-04-30 (Phase 9 클로즈 + hotfix 직후, multi-turn 회귀 1차 결과 기반)
> 목적: 관찰된/추정된 오류 케이스를 분류·박제. 수정 판단은 별도 사이클.
> 갱신 규칙: 새 케이스 발견 시 해당 카테고리에 ID 부여(`A1`, `B1`, ...) 후 추가.
> 상태 표기: ⚪ 추정 / 🔵 확인 / 🟠 부분처리 / 🟢 처리완료 / 🔴 미처리·우선순위高

---

## 카테고리

- **A. LLM Provider / 서버 측** — LM Studio·Claude API·httpx 레벨
- **B. Tool 입력 검증** — 도구 진입 시점 input dict 무결성
- **C. Tool 출력 / 리소스 제어** — 결과 크기·context bloat
- **D. LLM 생성 품질 / 환각** — SQL 환각, schema 위반, 필드 누락
- **E. 시스템 프롬프트 / 문서 격차** — 가이드 부재로 인한 LLM 오동작
- **F. 프론트엔드 / 영속화** — UI 렌더, localStorage, SSE 핸들링
- **G. 환경 / 설정** — env 변수, 타임아웃 기본값
- **H. 미분류 / 관찰 보류** — 재현성 낮거나 가설 단계

---

## A. LLM Provider / 서버 측

### A1. 🔴 LM Studio Jinja chat_template 렌더 실패 (`map` without `attribute=`)
**발생 시점**: 2026-04-30 09:29 — "최근 한달간 출근 현황 ... best와 worst" 신규 시나리오 첫 호출
**증상**:
```
Error: Error rendering prompt with jinja template:
"`map` expressions without `attribute` set are not currently supported."
```
LM Studio 내부 `llmworker.js`에서 prompt 포맷팅 단계 실패. 토큰 생성 자체가 시작되지 않음.
**모델**: `google/gemma-4-26b-a4b` — Google 공식 Gemma 라인업(1/2/3) 외 비표준 빌드. 이름 의심.
**본질**: 모델 chat_template Jinja에 `{{ list | map(...) }}` 형태 — LM Studio Jinja 구현이 `attribute=` 인자 강제. tool_calls 직렬화 부분 추정. tools[]가 요청에 포함될 때만 트리거.
**우리 백엔드 영향**: HTTP status 미확인. `_complete_without_tools` fallback이 발동했는지 로그 확인 필요. 200 OK + 에러 stream이면 우리 코드가 못 잡음.
**해결 후보**:
1. lmstudio-community 검증 모델 교체 (Qwen3, Qwen2.5-Coder, Llama 3.x)
2. LM Studio "My Models > Prompt Template"에서 수동 오버라이드
3. `lm_studio.py` 에러 stream 감지 후 명시적 사용자 메시지 변환
**우선순위**: 옵션 1 (모델 교체)이 가장 cheap. plan 적용과 독립 진행 가능.

### A2. 🔵 LM Studio 빈 응답 (chunks=1, text_deltas=0, tool_calls=0)
**발생 시점**:
- **A2-a (warmup)**: 2026-04-30 — "직원별 최근 업무 일지 ..." 첫 호출. 사용자 즉시 재시도 시 정상.
- **A2-b (context bloat / LLM 포기)**: 2026-04-30 회귀 T16 직후 — `messages=34, system_len=13709` 누적. 16턴 trap 후 모델이 빈 응답 emit하며 종결.
**증상**:
```
LM Studio request: model='(unset)' messages=2 tools=5 system_len=13709
LM Studio stream ended with no content: chunks=1, text_deltas=0, tool_calls=0
AgentLoop: empty LLM response on turn 1
```
1 chunk만 도착, content 없음. 사용자 측에 "(LLM returned empty response)" 노출.
**위치**: `backend/llm/lm_studio.py:307-312` warning emit
**가설**:
- (a) LM Studio가 metadata-only chunk(role + finish_reason만) 단일 발사 — **A2-a 원인 추정**
- (b) 모델 warmup 첫 호출 quirk — A2-a 보강
- (c) `_HarmonyTransformer` HOLDBACK이 partial marker 보유 후 close 미도착으로 swallow
- (d) **컨텍스트 누적 + 동일 에러 반복 → 모델이 더 이상 의미 있는 출력 생성 못 함 (degenerate to silence)** — A2-b 원인 추정
**재현성**:
- A2-a: 1/N
- A2-b: D7·B4 트랩 환경에서 거의 100% 재현 (T16 빈 응답으로 강제 종결)
**우선순위**:
- A2-b는 D7·B4 fix 시 자동 해소 (트랩 자체가 사라짐)
- A2-a는 별도 ⚪ 관찰

### A3. 🟢 httpx ReadTimeout (long-context 요청 / reasoning 모델 thinking 시간) — Phase 11 timeout 환경변수화 완료 (`aaaef43`)
**발생 시점**:
- 2026-04-30 (1차): T3 회차에서 db_query가 32,709 행 반환 후 다음 LLM 호출
- 2026-04-30 (2차 확인): reasoning 모델(`qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2`) 환경에서 200행 쿼리 결과 처리 중 동일 에러. **쿼리 크기가 작아도 트리거됨 — reasoning 모델의 thinking 단계 자체가 120s 초과.**
**증상**:
```
ERROR:llm.lm_studio:LM Studio HTTP error
httpcore.ReadTimeout → httpx.ReadTimeout
```
**위치**: `backend/llm/lm_studio.py:143-146` — `httpx.AsyncClient(timeout=120.0)`
**본질**: 120s 단일 float = 모든 phase(connect/read/write) 동일 제약. 2차 확인으로 입증:
- 1차: 32K 행 → prompt 처리 시간 초과
- 2차: 200행만으로도 → reasoning 모델의 `<think>` 추론 단계(chain-of-thought)가 120s+ 소요
- **reasoning 모델 전환 후 A3가 실질적 P0로 격상** — reasoning 없는 모델에서는 간헐적, reasoning 모델에서는 거의 모든 복잡한 쿼리에서 트리거 가능
**해결**: `httpx.Timeout(connect=10, read=600, write=30, pool=30)` + `LM_STUDIO_TIMEOUT_READ` env. plan Fix-D.
**우선순위**: 🔴 P0 — **reasoning 모델 도입으로 즉시 해결 없이는 모든 분석 쿼리 차단 수준**.

### A4. 🟠 `model='(unset)'` 로깅 (cosmetic)
**위치**: `backend/llm/lm_studio.py:138, 215`
**원인**: `LM_STUDIO_MODEL` env 미설정 → `self.model=""` → 로그에 `(unset)` 출력
**영향**: 기능적 문제 없음. LM Studio가 로드된 모델 자동 사용. 로그 가독성만 저하.
**해결**: env 설정 또는 startup warning 1줄. plan P2.
**참조**: snapshot §10·§11

---

## B. Tool 입력 검증

### B1. 🔴 `build_view({})` → `KeyError: 'report_schema'` raw propagation
**발생 시점**: 2026-04-30 직원 업무일지 회귀 T2 단계 T4
**증상**:
```
🔧 [T4] build_view({})
ERROR:agent.loop:Tool build_view raised: 'report_schema'
KeyError: 'report_schema'
```
LLM이 빈 dict로 호출. tool_result에 `"Error: 'report_schema'"` 만 돌아가 LLM이 회복 단서 부족.
**위치**: `backend/tools/build_view/tool.py:72`
**해결**: 진입부 required field 검증 + 친절한 ValueError. plan Fix-A.
**우선순위**: 🔴 P0

### B2. 🔴 `build_report({})` → `KeyError: 'user_intent'` raw propagation
**발생 시점**: 동상 T5
**증상**: B1과 동일 패턴
**위치**: `backend/tools/build_report/tool.py:137`
**해결**: 동일. plan Fix-A.

### B3. 🔴 loop.py 도구 예외 wrapping이 `str(exc)` 만 사용
**위치**: `backend/agent/loop.py:225-231`
**증상**: KeyError처럼 message가 raw key string인 케이스 → "Error: 'user_intent'" 같이 type 정보 손실
**해결**: `f"{type(exc).__name__}: {exc}"` 형식 통일. plan Fix-B.
**우선순위**: 🔴 P0 (defensive layer)

### B5. 🟠 continue_callback 정책 부재 — turn limit이 retry trap 차단 못 함
**발생 시점**: 2026-04-30 회귀 T10 직후 — `⏸️ 10턴 도달. 계속 진행할까요?` 표시 후 즉시 T11 진행
**증상**: turn limit 도달 시 `ContinuePromptEvent` 발사 + `_continue_callback` 콜백 결과로 진행 여부 결정. 그러나 동일 에러 16턴 트랩 상황에서도 callback이 true 반환하여 +N 진행. **사용자 의사결정에 위임**하나, 사용자도 "계속 시도하면 풀릴 수도"라고 판단할 수 있어 trap 절대 못 빠져나옴.
**위치**: `backend/agent/loop.py:237-248` continue_prompt 로직 + `backend/main.py` callback 정의
**가설**: callback 자체가 항상 true 반환하거나 default true. 또는 사용자가 UI에서 자동 continue 클릭.
**해결 후보**:
1. callback 측에서 "최근 N턴 연속 동일 에러" 감지 시 자동 false 반환
2. B4 (circuit breaker)와 통합 — turn limit 도달 + N회 동일 에러면 사용자 prompt 없이 abort
3. continue prompt 메시지에 "최근 N턴 동일 에러 — 계속하면 누적 비용↑" 경고 추가
**우선순위**: 🟠 P1 (B4 fix가 우선)

### B4. 🔴🔴 AgentLoop retry trap — 동일 에러 N회 연속 시 circuit breaker 부재 (16턴 트랩 실측)
**발생 시점**: 2026-04-30 회귀 T3~T16 — D7 false positive로 **14턴 연속 동일 ValueError**. turn limit 10 도달 후 사용자 continue 선택 → 6턴 추가 → T16 후 LM Studio 빈 응답으로 사실상 강제 종결.
**증상**: 같은 도구가 **완전히 같은 ErrorType + 같은 메시지**로 N회 실패해도 AgentLoop가 그대로 retry. turn limit이 임시 stop이지 termination이 아님(continue_callback이 true 시 +N 추가).
**위치**: `backend/agent/loop.py` — turn limit 외 별도 circuit breaker 없음
**가설**: D7·D8 같은 가드 false positive 또는 LLM degeneration 케이스에서 사용자에게 자원 낭비 + UX 손상.
**해결 후보**:
1. (간단) 같은 도구가 같은 error_type 으로 연속 K회(예: 2회) 실패하면 LLM에게 "다른 접근 시도하라"는 명시적 시스템 메시지 inject
2. (적절) error category 누적 시 sub-agent 차원 abort + 사용자 안내
3. (보완) turn limit 도달 전 단계적 경고 (turn N/K 알림)
**우선순위**: 🔴 P0 (D7 해결과 별개로 일반 가드)

---

## C. Tool 출력 / 리소스 제어

### C1. 🔴 db_query 무제한 fetchall → context bloat
**발생 시점**: 2026-04-30 T3 — `SELECT ... FROM TGW_TaskDailyLog ... ORDER BY td_writeDt DESC` (TOP 없음) → 32,709 rows
**위치**: `backend/tools/db_query/tool.py:100-118`
**연쇄 영향**: A3 (httpx timeout) 직접 트리거
**해결**: hard cap 1000행 + 초과 시 ValueError raise. plan Fix-C.
**우선순위**: 🔴 P0

### C2. 🟢 텍스트 본문 컬럼 raw SELECT — Phase 11 build_report `_truncate_data_results` 자동 truncate (`8d11067`)
**발생 시점**: 동상 — `td_Today AS 업무내용, td_Tomorrow AS 익일계획` 32K rows × 본문 길이 = 거대 payload
**위치**: SQL 생성 LLM. 시스템 프롬프트 가이드 부재.
**해결**: system_base.md에 "텍스트 본문 컬럼 raw SELECT 금지, 집계·샘플링" 규칙. plan Fix-E.
**우선순위**: 🔴 P0 (E와 묶여있음)

---

## D. LLM 생성 품질 / 환각

### D1. 🟠 build_report 1차 생성에서 `highlight.message` 필드 누락
**발생 시점**: 2026-04-30 T2 build_report 1차 LLM 호출
**증상**:
```
WARNING:tools.build_report.tool:build_report: first attempt validation failed:
blocks.0.highlight.message Field required
```
1회 retry로 회복. 동작은 OK이나 round-trip 비용 발생.
**위치**: `backend/tools/build_report/tool.py:28-52` 시스템 프롬프트 + `description.md` — 필수 필드 명시 없음
**해결**: block type별 필수 필드 표 추가. plan Fix-F.
**우선순위**: 🟠 P1

### D2. ⚪ 영문 컬럼 환각 (한글 가드 미포착)
**박제 위치**: snapshot §10 부수 관찰
**증상**: 첫 SQL에 `[Title]`, `[Today]` 같은 영문 환각 → MSSQL 'Invalid column name' → Fix 4 가이드로 LLM 자체 회복. 그러나 round-trip 1회 손실.
**한글 가드(보강 B)**가 영문 환각은 catch 못 함.
**해결 후보**: 도메인 schema 화이트리스트 검증(보강 C, snapshot §11 단기 #5). 별도 사이클.
**우선순위**: 🟠 P2

### D3. 🟢 한글 컬럼 환각 (한글 가드 catch)
**박제 위치**: snapshot §7 9.3+9.4 보강 B
**위치**: `backend/tools/db_query/tool.py:_assert_no_korean_in_select`
**상태**: hotfix 완료 — 환각 시 ValueError → LLM 도메인 schema 재참조

### D4. ⚪ LLM이 description.md 가이드 무시 (빈 dict 호출)
**관계**: B1·B2의 상위 원인
**가설**: LLM이 description.md의 `required` 필드 명세를 보고도 빈 dict로 시도. 모델 quality 또는 시스템 프롬프트 우선순위 이슈.
**완화**: B1·B2의 친절한 에러로 회복 가능 (plan Fix-A)
**관찰 항목**: hotfix 후에도 빈 dict 호출 빈도 측정.

### D5. 🟠 build_report ReportSchema 미정의 block type 환각 (`metric_group`) — Step 2 system.md enum strict 추가
**발생 시점**: 2026-04-30 직원 업무일지 회귀 — build_report 1차 LLM 생성
**증상**: LLM이 다음과 같이 emit
```json
"blocks": [
  {
    "type": "metric_group",
    "metrics": [ {...}, {...} ]
  }
]
```
ReportSchema(`backend/tools/build_report/schema.py`)는 block type을 **`markdown` / `metric` / `chart` / `highlight` 4종**만 허용. `metric_group`은 존재하지 않음. pydantic validation 실패 예정.
**위치**: `backend/tools/build_report/tool.py:28-52` 시스템 프롬프트 — 허용된 block type 명시 부족 또는 모델이 일반 지식으로 환각.
**해결 후보**:
1. (E2 묶음) description.md / 시스템 프롬프트에 **block type을 4종 명확 enum 명시** + "이 외에는 절대 사용 금지"
2. (D6 동시 발생) 본 케이스에서는 D6(JSON parse error)로 먼저 실패해 D5 validation까지 도달도 못 함 — D6 해결 시 D5 노출
3. retry 시 첫 시도 결과 + validation error를 함께 LLM에 전달하므로 두 번째 시도에서 회복 가능 (build_report 내장 retry)
**우선순위**: 🟠 P1 (D6와 묶음)

### D6. 🟠 build_report LLM JSON에 invalid escape — Step 2 system.md backslash escape rules + rules/json-output.md
**발생 시점**: 2026-04-30 직원 업무일지 회귀 — build_report 1차 호출
**증상**:
```
RuntimeError: LLM returned invalid JSON: Invalid \escape: line 81 column 67 (char 2816)
```
LLM 출력의 markdown 본문 또는 chart axis label 같은 string 안에 JSON에서 invalid한 `\X` escape가 들어감. JSON 표준은 `\n \t \" \\ \/ \b \f \r \uXXXX`만 허용. `\d` `\p` `\` (단일) 등은 reject.
**위치**: `backend/tools/build_report/tool.py:228` — `json.loads(raw)`
**가설**:
1. 모델이 Windows path 표기 (`C:\Users\...`) 또는 정규식 (`\d+`)을 string literal에 그대로 넣음 — 백슬래시 escape 안 함
2. 모델 출력 중 `\` 단독 잔재 (예: `\r\n` 의도였으나 한 글자 빠짐)
3. 한글 컬럼 인용 시 `\["한글"]` 같은 markdown 잔재
**해결 후보**:
1. (간단) `json.loads` 실패 시 `raw`에 대해 conservative한 정규화 — 단독 `\` → `\\` 치환 후 재시도
2. (적절) JSON5 또는 `json-repair` 라이브러리 도입 — 흔한 LLM JSON quirk 자동 수리
3. (근본) 시스템 프롬프트 강화 — "string 안 모든 backslash는 `\\`로 escape할 것" 명시
4. retry 로직(현재 1회) 횟수 증가 + validation error context를 더 풍부하게 LLM에 전달
**우선순위**: 🔴 P0 — D6 → build_report 실패 → 인라인 ReportContainer 미렌더 → F1 직접 트리거

### D7. 🟠 한글 가드 false positive — CASE WHEN 안 한글 string literal 차단 (Phase 10 Step 1 fix 적용, 라이브 회귀 대기)
**발생 시점**: 2026-04-30 회귀 — **T3 ~ T16 연속 14회 차단**. turn limit 10 도달했으나 사용자가 계속 진행 선택 → T16 후 LM Studio 빈 응답으로 종결.
**증상**: 다음과 같은 SQL이 `_assert_no_korean_in_select` 가드에 차단됨
```sql
SELECT TOP 10
  td.td_myUid,
  u.uName AS [담당자명],          -- 정상 alias (가드 strip 대상)
  CASE
    WHEN td.td_Today LIKE '%성수기전%' THEN '고객지원/유지보수'  -- ★ 한글 string literal
    WHEN td.td_Today LIKE '%ERP%' THEN '시스템개발/개선'
    ...
  END AS [업무분류],
  COUNT(*) OVER(...) AS [건수]
FROM dbo.TGW_TaskDailyLog td
```
한글이 **단일따옴표 string literal** (`'%성수기전%'`, `'고객지원/유지보수'`) 안에 있음. 컬럼명 환각이 아니라 정상적인 SQL 분류 표현. 그러나 가드가 이걸 컬럼명 환각으로 오인하여 `ValueError: Korean column name detected in SELECT clause (outside alias)` raise.
**위치**: `backend/tools/db_query/tool.py:62` `_assert_no_korean_in_select`
**본질 원인**: 가드 정규식이 4가지 alias 패턴(`AS [한글]`, `AS '한글'` 등)만 strip하고, **single-quoted string literal은 strip하지 않음**. SELECT 절 region에 한글이 남아있으면 무조건 환각으로 판정.
**연쇄 영향**:
- LLM이 분류 로직(`CASE WHEN ... THEN '카테고리명'`)을 SQL로 풀려고 시도할 때 모두 차단
- 4턴 연속 retry → SQL 점점 더 파편화 (D8 트리거)
- 사용자 의도(분류·집계 분석)가 절대 도달 못 함 — **functional 차단**
**해결 후보**:
1. (즉시) 가드 정규식에 single-quoted literal strip 추가: `re.sub(r"'[^']*'", "''", sql)` 후 한글 검사
2. (보완) 동시에 N-quoted (`N'한글'`) 와 escape된 single quote (`''`) 처리도 검토
3. (추가) 가드 자체를 보강 C(도메인 schema 컬럼 화이트리스트 검증)로 대체 후 한글 가드 deprecate
**우선순위**: 🔴 P0 — **plan에 즉시 추가 권장**. 본 케이스가 가장 critical한 신규 발견 (Phase 9 보강 B 자체의 결함).

### D7-수반. 🟠 가드 에러 메시지가 LLM에 잘못된 진단을 주입 (self-correction 트랩) — Step 1 메시지 갱신 적용
**발생 시점**: 2026-04-30 회귀 T11·T12 — LLM이 두 번 "사과 + 재시도" 사이클 진입
**증상**: LLM 자기 분석 텍스트:
> "죄송합니다. 제가 SQL 쿼리 작성 중에 **한국어 컬럼명을 별칭(Alias) 없이 그대로 사용했거나, 존재하지 않는 한글 컬럼명을 잘못 참조**했습니다. 시스템 규칙에 따라 모든 한국어 출력은 `AS [한글명]` 형식을 사용하여 명확히 정의해야 하는데..."

**본질**: 가드 에러 메시지(`"Korean column name detected in SELECT clause (outside alias). Likely hallucination — use the exact column name... Aliases via AS [한글명] are allowed."`)는
- **alias 외 한글 = 컬럼명 환각** 이라고 단정
- 실제 원인(single-quoted Korean literal)을 언급 안 함
- LLM이 "alias 추가하면 해결될까?" 로 잘못된 가설 → 모든 retry가 alias만 더 추가하고 string literal은 그대로 → 무한 트랩

**연관**: D7 본질의 직접 효과. 가드 fix 시 메시지도 함께 수정 필요.
**해결**: D7 fix 시 메시지를 다음과 같이 변경:
- "Korean column name **or string literal** detected in SELECT clause..."
- 또는 가드가 자기 strip 결과를 함께 노출 (어느 부분에 한글이 남았는지 보여줌)
**우선순위**: 🔴 (D7 묶음)

### D8. 🟠 LLM SQL retry 누적 파괴 (typo / 토큰 깨짐)
**발생 시점**: D7 차단이 4회 연속되며 retry마다 SQL 점점 손상
**증상**:
- T3 → T4: `td.td_Today LIKE` 가 `td.td_TodayLIKE` (공백 누락)
- T5: `'%나타내어'` (의미 불명 토큰), `'재무/나트륨지원'` (오타), `[건나]'DESC` (구문 깨짐)
- T6: `'%아이탑어%'`, `'%프로나이트%'` (랜덤 토큰)
- T8 이후: **`LIKE` → `LINE` 일관 오타** (예: `td.td_TodayLINE '%ERP%'`) — 모델이 자기 출력의 한 패턴을 잘못 학습해 retry마다 반복
- T15·T16: `'%아이턴스%'` (의미 불명), `'%성수나%'` (오타)
- 동시에 `td.\r\ntd_myUid` 형태로 `\r\n`이 column ref 사이에 끼어들어 SQL 파편화
**가설**:
1. 모델이 retry 시 이전 출력의 일부를 보고 패치 시도하다 장기 컨텍스트 누적으로 출력 품질 저하
2. LM Studio sampling 변동 + tool_result(에러)가 컨텍스트 부풀림
3. 본질은 D7 false positive로 LLM이 빠져나갈 수 없는 retry trap에 갇힘
**해결**: D7 해결 시 자동 해소 예상. 별도 대책 무필요.
**우선순위**: 🟠 (D7 종속)

### D9. 🟠 Instruct 모델 출력 격리 실패 — 중간 추론 전체가 사용자 가시 텍스트로 노출 (reasoning 모델 전환으로 대폭 개선)
**발생 시점**: 2026-04-30 — "직원별 최근 업무 일지... 시각화" 회귀 (instruct 모델 사용)
**증상**:
- 모든 도구 호출 전후 LLM의 내부 추론·계획이 💬 메시지로 사용자에게 그대로 노출:
  - 각 도구 호출 전: 300~500단어 계획 설명 + markdown 코드 블록 (SQL/JSON 전체 포함)
  - 도구 오류 후: "죄송합니다" + 오류 자기분석 + 수정 접근법 (전체 데이터 재임베드)
  - 사용자가 보는 것: 에이전트의 모든 시도·실패·분석·재시도를 순서대로 노출
- Chat 모델 대비 도구 호출 1회당 사용자 가시 텍스트 5~10배
- LLM이 오류를 "시스템의 과도한 감지 알고리즘" 으로 자기진단하여 사용자에게 잘못된 신호 전달
**위치**: `backend/agent/loop.py` — text_delta emit 경로 / `backend/llm/lm_studio.py` — streaming
**본질**: Chat template에 tool calling 지원이 없는 instruct 모델은 "도구를 호출하기 전에 출력을 생략"하는 개념이 없음. 모든 reasoning이 streamed text로 변환되어 AgentLoop가 그대로 emit.
- Chat 모델(function calling 지원): 도구 호출 전 text 없거나 1줄 / 도구 결과 후 간결한 다음 단계
- Instruct 모델: 전체 계획+SQL+JSON+자기분석을 text로 emit → 도구 호출 → 오류 후 전체 재분석 emit
**가설**:
1. LM Studio의 해당 모델이 `tool_calls` 포맷 대신 text embedding 형태로 함수 호출 → text가 모두 흘러나옴
2. AgentLoop의 text_delta가 think block / tool reasoning 여부를 구분하지 않고 그대로 SSE 전송
3. Frontend에 "에이전트 내부 추론을 숨기는" 레이어 없음 — 모든 💬 text가 AssistantBubble로 렌더
**연관**: D9가 존재하면 D10 (build_report 우회) 패턴이 직접 파생됨. B4 (circuit breaker 부재)와 결합 시 장기 컨텍스트 bloat 가속.
**해결 후보**:
1. (즉시) 모델을 chat 모델 (function calling 지원) 로 교체 — A1 해결과 같은 방향
2. (backend) AgentLoop에서 도구 호출 직전에 emit된 text를 `agent_thought` 이벤트로 분리 → frontend에서 접힌 상태로 표시
3. (frontend) 도구 호출 사이의 assistant text를 기본 hidden, expand 가능한 "에이전트 추론" 섹션으로 분리
4. (prompt) system_base.md에 "Do not output any text before a tool call" 강제 — 일부 instruct 모델은 이를 따를 수 있음
**우선순위**: 🔴 P0 — 사용자에게 에러 메시지·실패 시도·잘못된 자기진단이 직접 노출되는 UX 손상

### D10. 🔴 build_report 2회 실패 후 LLM이 build_view를 직접 수동 호출 (chain 우회)
**발생 시점**: 2026-04-30 T7 (build_report 2회 실패) → T8·T9 (build_view 직접 호출)
**증상**:
- T7: build_report가 `blocks.1.metric.value Field required` 로 2회 실패 → RuntimeError
- T8: LLM이 build_report를 재시도하는 대신 자신이 직접 ReportSchema를 구성하여 build_view 호출
  - `"blocks": [{"type": "bar_chart", ...}, {"type": "pie_chart", ...}]` → `union_tag_invalid` (허용된 타입: `markdown/metric/chart/highlight`)
  - `"summary": "최근 7일간..."` (str) → `Input should be a valid dictionary or instance of Summary` (객체 필요)
  - `"data_refs": [{"rows": [...], "columns": [...]}]` → `Unable to extract tag using discriminator 'mode'` (`mode` 필드 없음)
- T9: 오류 분석 후 재시도 — `"type": "chart"` 수정했으나 `viz_hint` + `data_ref` 누락, `summary` 여전히 str
  - 추가 실패: `summary.Input should be a valid dictionary`, `blocks.0.chart.viz_hint Field required`, `blocks.0.chart.data_ref Field required`, `data_refs.0 Unable to extract tag using discriminator 'mode'`
**위치**: `backend/tools/build_view/tool.py:64` — `ReportSchema.model_validate(input["report_schema"])`
**본질**: Instruct 모델이 build_report 오류를 "도구의 제약"으로 판단 → "직접 ReportSchema 생성 후 build_view 호출" 시도. 그러나 ReportSchema 복잡도(summary 객체, data_refs.mode 판별자, chart.viz_hint enum, chart.data_ref int 인덱스)를 instruct 모델이 추론만으로 정확히 구성 불가.
- 의도된 chain: `db_query → build_report → build_view`
- 실제 chain: `db_query → [build_report 2x fail] → (LLM 직접 구성) → build_view 2x fail`
- 결과: 추가 4개 도구 호출 실패 + 각 실패마다 D9로 인해 500+ 단어 분석 텍스트 사용자 노출
**연관**: D9의 직접 파생 (instruct 모델의 verbose reasoning이 "build_report를 건너뛰자" 결정으로 이어짐). D1·D5 (build_report 스키마 오류)가 트리거.
**해결 후보**:
1. build_view `description.md`에 "반드시 build_report 출력 결과만 입력. 직접 ReportSchema 구성 금지" 명시
2. build_view 입력 검증에 "build_report를 먼저 호출하셨습니까?" 가이드 포함
3. build_report 실패 시 에러 메시지에 "build_view 직접 호출 금지" 명시
4. (근본) D9 해결 (모델 교체 또는 chain 강제) → LLM이 우회 시도 자체를 안 함
**우선순위**: 🔴 P0 — build_report chain 완전 붕괴 시나리오. D9와 함께 해결 필요.

### D11. 🟡 build_schema input shape 위반 — `user_intent` 를 `data_results[0]` 안쪽으로 nest (LLM 결함, 코드 수정 보류)
**발생 시점**: 2026-04-30 (Cycle 2 시나리오 1 라이브 회귀 — "오늘 직원별 출근 현황을 간트차트로 만들어줘")
**증상**:
- LM Studio 모델이 build_schema 호출 시 `{data_results: [{columns, rows, user_intent: "..."}]}` 형태로 nest. 정상은 `{user_intent: str, data_results: [{columns, rows}]}`.
- `backend/tools/build_schema/tool.py:166 user_intent = input["user_intent"]` → KeyError raise → tool result error
- retry 시 LM Studio가 raw string fallback `<channel|><|tool_call>call:build_schema{...}` 출력 (Harmony 마커 정규화 실패, A1 변종) — tool_calls 미파싱 → chain 진행 불가
- **2026-04-30 시나리오 2 회귀에서 `report_generate`에서도 동일 결함 재현** (`tool.py:71 user_intent = input["user_intent"]` KeyError). LLM이 `{report_schema: {...}}`만 보내고 user_intent 누락. 결함 범위 = `{user_intent, ...}` 인풋 패턴을 가진 모든 sub-agent 도구 (build_schema + report_generate). build_view는 `{report_schema}` 단일 필드라 자연 회피.
**본질**: instruct 모델의 도구 호출 능력 한계. Tool input contract 자체는 명확히 정의됨 (top-level user_intent + data_results array). SKILL.md/system.md에 더 명시화하거나 tool.py에 defensive fallback 추가하는 건 모델 한계 과적합 → **본 케이스는 코드 수정 보류** (memory `feedback_no_llm_overfit.md` 적용)
**위치**:
- `backend/tools/build_schema/tool.py:166` — input contract 위반 시 KeyError raise (정상 동작)
- `backend/llm/lm_studio.py` — Harmony 마커 fallback 실패 (A1 변종)
**해결 후보**:
1. **(권장)** Provider/모델 교체 — Claude Sonnet/Opus로 재회귀 시 재현 여부 확인. 재현 X면 본 케이스 영구 보류.
2. (보류) build_schema/tool.py defensive fallback (`input.get("user_intent") or input["data_results"][0].get("user_intent")`) — 사용자 결정으로 보류 (과적합 방지)
3. (보류) SKILL.md Examples에 정확한 호출 shape 1건 + 흔한 오류 1건 명시 — 효과 미지수 (모델이 system prompt 따르지 못 하는 결함이라)
**연관**: D9 (instruct 모델 verbose reasoning) + D10 (chain 우회) 기반. circuit breaker B4 부재 시 무한 retry 위험.
**우선순위**: 🟡 P2 (모델 한계 — 코드 결함 아님). Claude provider 회귀에서 재현 X 확인되면 close. 재현 시 P0 승격 + 코드 결함 재진단.

---

## E. 시스템 프롬프트 / 문서 격차

### E1. 🟠 system_base.md TOP N 강제 규칙 부재 — Step 1 rules/result-size.md 추가 (prompt only, code cap 별도 사이클)
**위치**: `backend/prompts/system_base.md`
**현 상태**: db_query description.md에만 부드러운 권고 ("Keep result size reasonable"). LLM이 무시 가능.
**해결**: `## Result size` 섹션 신설 + 1000행 hard cap 명시. plan Fix-E.
**우선순위**: 🔴 P0

### E2. 🟢 build_report description.md block 필수 필드 표 부재 — Phase 10 Step 3 SKILL.md `## Rules` + system.md hardening
**위치**: `backend/tools/build_report/description.md`
**증상**: D1 직접 원인
**해결**: plan Fix-F.

### E3. 🟢 후속턴 도메인 schema 누락 (sticky 미적용)
**박제 위치**: snapshot §6 Fix 1
**상태**: hotfix 완료 — `_session_domain` dict 도입, follow-up은 sticky 매칭
**위치**: `backend/main.py`, `backend/domains/loader.py`

### E4. 🟢 도구 실행 history 폐기
**박제 위치**: snapshot §6 Fix 2
**상태**: hotfix 완료 — `_conversations`에 tool_use/tool_result pair 보존, MAX_HISTORY pair-safe trim
**위치**: `backend/agent/history.py`, `backend/main.py`, `backend/agent/loop.py:get_final_messages()`

### E5. 🟢 도구 결과 행수 meta 부재
**박제 위치**: snapshot §6 Fix 3
**상태**: hotfix 완료 — `[meta] rows={N}` prepend
**위치**: `backend/agent/loop.py:213-217`

### E6. 🟢 'Invalid column name' 회복 가이드 부재
**박제 위치**: snapshot §6 Fix 4 + 보강 A
**상태**: hotfix 완료 — system_base.md `## Error recovery` 섹션 + 3단계 우선순위
**위치**: `backend/prompts/system_base.md:37-43`

### E7. 🟠 한글 컬럼 사전 금지 규칙 부재 (proactive guidance gap) — Step 1 rules/korean-sql.md 신설 + system_base.md 인용
**발생 시점**: 2026-04-30 회귀 — D7 16턴 트랩의 상위 원인 중 하나
**증상**: LLM이 SQL을 짤 때 한글 토큰을 어디까지 쓸 수 있는지 모름. system_base.md / db_query description.md 어디에도 명시적 금지 조항 없음. LLM은 한글 alias 예시만 보고 "한글 = 자유"로 일반화 → bare Korean column reference 또는 single-quoted Korean literal에서 가드 적중 후에야 학습 (그마저 D7-수반으로 잘못 학습).
**위치**:
- `backend/prompts/system_base.md` — `## Name resolution` (예시는 있으나 금지 규칙 없음), `## Anti-hallucination` (일반 환각만)
- `backend/tools/db_query/description.md` — 일반 invent identifier 금지뿐
**본질**: **사후 가드(reactive)** + **사전 가이드(proactive)** 양쪽 모두 fix해야 root 차단.
- D7 fix만 하면: LLM이 여전히 bare Korean column 시도 → 가드(수정된)에 적중 → retry → 도메인 schema에서 ASCII 명 찾기까지 N턴 손실
- E7 fix만 하면: LLM이 시도 안 함 → 가드 안 부딪힘 → 효율↑. 그러나 prompt 무시 케이스 대비 가드는 여전히 필요

**해결 — 추가할 규칙안 (system_base.md 신규 섹션)**:
```markdown
## Korean text in SQL (strict)

- Database identifiers (table/column names) are **always ASCII** — e.g. `wb_Title`, `td_myUid`, `LZXP310T`. Korean tokens NEVER appear as bare identifiers. Verify against the domain schema or `list_tables` before SELECT.
- Korean text is allowed ONLY in:
  1. **Aliases**: `AS [한글명]` (square brackets) or `AS "한글명"` — to display Korean labels in the result
  2. **String literals**: `WHERE col LIKE '%한글%'`, `CASE WHEN col LIKE '%한글%' THEN '한글카테고리'` — single-quoted
  3. **Comments**: `-- 설명`
- DO NOT write `SELECT 담당자명 FROM ...` (bare Korean = invalid identifier — no such column exists). Use the ASCII column from the domain schema, optionally with `AS [한글명]` alias.
- The server enforces this with an automatic guard — violations are rejected. Recovery: do NOT add more aliases; rewrite the SELECT with actual ASCII column names from the domain schema.
```

**`db_query/description.md`에도 1줄 추가**:
```markdown
- Korean column identifiers do not exist — all DB columns are ASCII. Use Korean only in `AS [한글명]` aliases, single-quoted string literals (`'한글'`), or comments. See system prompt §"Korean text in SQL" for details.
```

**우선순위**: 🔴 P0 — D7 가드 fix와 함께 묶음 처리. **둘 다 있어야 본질 해결**.

---

## F. 프론트엔드 / 영속화

### F1. 🟠 build_view 실패 시 인라인 ReportContainer 미렌더 → markdown fallback
**발생 시점**: 2026-04-30 T2 — build_view KeyError 후 LLM이 final markdown 텍스트로 종결
**증상**: 사용자 화면에 표 + 인사이트 markdown만 노출, ReportContainer 인라인 렌더 안 됨. 본질은 B1·C1 chain.
**위치**: `frontend/src/framework/pages/AgentChatPage.tsx` splitMessagesForReports + ReportContainer
**해결**: B 카테고리 fix로 자동 해소 예상.
**우선순위**: 🟠 (B 처리 후 검증)

### F2. 🟢 `<think>` 블록 strip 부재 → JSON parse 실패
**박제 위치**: snapshot §10 hotfix
**상태**: hotfix 완료 (`e2197d1`) — `_THINK_RE` regex로 build_report·build_view 모두 strip
**위치**: `backend/tools/build_report/tool.py`, `backend/tools/build_view/tool.py`

### F3. 🟢 SubAgentProgress error 상태 미구현
**박제 위치**: snapshot §10 hotfix
**상태**: hotfix 완료 — Stage.status union에 `"error"` 추가, IconAlert + danger 색상

### F4. ⚪ 다른 reasoning 마커 (`<reasoning>`, `<scratchpad>`) 출현 가능성
**박제 위치**: snapshot §11 함정
**상태**: 발견 시 F2와 동일 패턴 적용. 현재 미관찰.

### F5. 🔵 "생각 과정" 빈 렌더 (ThinkBlock empty)
**발생 시점**: 2026-04-30 — "직원별 최근 업무 일지 ... 시각화 해봐" 회귀 중 (스크린샷 첨부)
**증상**:
- UI "생각 과정" 섹션은 표시되나 본문 영역 완전 공백
- 같은 메시지에서 `db_query turn 1 (10 rows)` + `Agent Trace 2 steps completed` 정상
- "처리 중..." 칩 지속 (final 미도착)
- backend 콘솔에는 `🧠 [THINK]` 마커는 출력됨 (terminal logger가 think_delta 감지)
**위치 후보**:
- `backend/llm/lm_studio.py:_HarmonyTransformer` — open marker 감지 후 close 도착 전 chunk 경계에서 buffer만 쌓고 emit 0
- `backend/agent/loop.py` think_delta event emit 경로 — 빈 문자열도 전송하는지
- `frontend/src/design/components/MessageThread.tsx` ThinkBlock — 빈 문자열일 때 placeholder 표시 vs 숨김 정책
**가설**:
1. 모델이 `<think></think>` 빈 페어 emit (qwen 계열 + tool calling 동시 사용 시 thought 생략)
2. HarmonyTransformer가 partial open marker 감지 후 content를 HOLDBACK에 묶어두고 close 도착 전 stream 종료 → flush()에서 close만 추가, content 0
3. Frontend ThinkBlock이 빈 think 문자열을 빈 영역으로 그리고 collapse 안 함
**연관**: A2(완전 빈 응답)와는 다름 — 본 케이스는 도구 호출은 정상, "think 영역만" 비어있음
**관찰 항목**:
- backend 로그에서 `🧠 [THINK]` 다음 char 수 / chunks 측정
- frontend network DevTools에서 `text_delta` event payload 확인 (think 부분이 정말 빈 문자열인지, 아예 event가 안 오는지)
- 같은 모델 + 같은 시나리오 재현 빈도
**해결 후보**:
1. (frontend) ThinkBlock이 빈 content면 섹션 자체를 hide
2. (frontend) 빈 think 시 placeholder 텍스트 ("생각 없이 즉시 도구 호출")
3. (backend) HarmonyTransformer가 content 0인 think 페어를 emit 안 하도록 가드
4. (관찰) 모델 교체(A1 후속)로 자연 해소되는지 먼저 확인 — 본 모델 chat_template 문제 가능성
**우선순위**: 🟠 P1 (UX 손상 但 기능적 차단 X). "처리 중..." 칩 지속 문제는 별도 케이스로 분리 검토 필요.

### F6. 🔵 "처리 중..." 칩 지속 / final 미도착 (long-tail latency 또는 stall)
**발생 시점**: 2026-04-30 F5와 동시 화면 (스크린샷)
**증상**: tool 완료 + Agent Trace completed 표시 후에도 "처리 중..." 칩 사라지지 않음
**가설**:
1. 단순 latency — 이후 LLM 호출이 진행 중이고 시간만 걸림 (에러 아님)
2. SSE final 이벤트 미도착 — backend 측에서 final emit 누락 또는 stream 조기 종료
3. frontend traceEvents 종결 처리에 final 의존 — final 안 오면 스피너 영구
4. A1·A3 같은 LLM 측 에러가 stream에 ERROR event로 전달됐는데 frontend 핸들링 부재
**관찰 항목**: backend 로그 끝까지(turn N final 또는 ERROR) + frontend SSE 마지막 event type
**우선순위**: 🟠 (본 화면이 영구 stall로 끝나면 🔴, 단순 지연이면 ⚪로 강등)

### F7. 🟠 Reasoning 모델에서 도구 호출 전 빈 `💬` 메시지 전송 → 빈 assistant bubble — Phase 11 Frontend AssistantBubble null guard 적용 (라이브 검증 대기)
**발생 시점**: 2026-04-30 — reasoning 모델(`qwen3.5-27b`) 사용 시 관찰
**증상**: 백엔드 터미널에서 `🧠 [THINK]` 다음 `💬 ` (내용 없이 개행만) 출력. 도구 호출 전 LLM text output이 빈 문자열 또는 whitespace만.
**위치**: `backend/agent/loop.py` text_delta emit → frontend AssistantBubble
**가설**: Reasoning 모델은 `<think>` 블록 이후 도구 호출로 즉시 전환 — 도구 호출 전 추가 텍스트가 없음. 그러나 AgentLoop가 빈 string ""도 text_delta로 emit하여 프론트에서 빈 버블 렌더 가능성.
**연관**: F5 (빈 ThinkBlock)와 유사 패턴이나 위치가 다름. A3 fix 후 전체 pipeline 완료되면 자연 검증 가능.
**해결 후보**: AgentLoop에서 text content가 whitespace-only이면 text_delta event emit 스킵.
**우선순위**: ⚪ (A3 fix 후 렌더 결과 확인 시점까지 관찰 보류)

---

## G. 환경 / 설정

### G1. 🟠 LM_STUDIO_MODEL env 미설정 (cosmetic)
**참조**: A4

### G2. 🔴 httpx timeout 환경변수화 안 됨
**참조**: A3

### G7. 🟢 SSE event_generator heartbeat 없음 → LLM 처리 중 무음 구간에서 연결 종료 위험 — Phase 11 heartbeat 15s 적용 (`aaaef43`)
**발생 시점**: 2026-04-30 — reasoning 모델 사용 시 "프론트에서 요청 대기 시간이 굉장히 짧은거 같다" 관찰
**증상**: 사용자 쿼리 제출 후 LLM이 응답하기 전 일정 시간 후 프론트엔드에서 SSE 연결 종료.
**위치**:
- `backend/main.py:559-576` — `event_generator()` + `StreamingResponse`
- `frontend/vite.config.ts:8-13` — Vite proxy 설정 (`timeout`/`proxyTimeout` 미설정)
**본질**:
```python
# event_generator 핵심 루프
while True:
    events = _sessions[stream_key]
    while sent < len(events):
        yield ...  # 이벤트 있을 때만 전송
    await asyncio.sleep(0.05)  # 없으면 50ms 대기 후 재폴링
```
LLM이 처리 중일 때(특히 reasoning 모델의 chain-of-thought 단계, 30~120s+) `_sessions[stream_key]`에 이벤트가 없음 → event_generator는 50ms 루프를 돌지만 클라이언트에 아무것도 전송 안 함 → SSE 연결이 수십 초 동안 **완전 무음** 상태.

이 무음 구간이 A3 (httpx 120s timeout)과 합쳐질 때:
1. LM Studio가 reasoning 중 → backend → frontend 방향으로 이벤트 0
2. A3 타임아웃 → backend가 ErrorEvent를 append → event_generator가 감지하여 전송 → SSE 종료
3. 사용자 입장: "쿼리 보냈는데 잠깐 기다리다 에러" → **120s가 체감상 굉장히 짧게 느껴짐**

추가: SSE spec은 서버가 `: (comment)` 형태의 heartbeat를 보내도록 권고. heartbeat 없으면:
- 일부 nginx/reverse proxy: 기본 60s idle 후 연결 끊기
- Vite dev proxy (`http-proxy`): `timeout`/`proxyTimeout` 기본값 0이나, Node.js socket idle timeout 적용 가능
- 브라우저 EventSource: 대부분 재연결 시도하나, Vite proxy가 먼저 끊으면 무의미

**Vite proxy 상태**: `vite.config.ts`에 SSE 관련 설정 없음. `timeout`/`proxyTimeout` 모두 미설정(기본 0 = no timeout). Vite proxy 자체는 timeout 없으나, Node.js 소켓 레벨 idle timeout은 환경마다 다름.
**해결 후보**:
1. **(즉시, backend)** event_generator에 heartbeat 추가 — 이벤트 없을 때 15s마다 SSE comment 라인 전송:
   ```python
   # 전송할 내용 없을 때
   if idle_seconds >= 15:
       yield ": heartbeat\n\n"
       idle_seconds = 0
   ```
2. **(즉시, backend)** A3 fix와 묶음 — httpx timeout 600s로 연장 시 무음 구간이 더 길어지므로 heartbeat가 필수
3. **(보완, vite)** Vite proxy에 명시적 SSE 안전 설정 추가:
   ```ts
   proxy: { "/api": { target: "...", changeOrigin: true, timeout: 0, proxyTimeout: 0 } }
   ```
**우선순위**: 🔴 P0 — **A3 fix(httpx timeout 연장)를 적용하면 무음 구간이 더 길어져 G7이 더 심해짐. A3 + G7은 반드시 묶음 fix 필요**.

### G3. ⚪ 다른 reasoning 마커 미처리
**참조**: F4

### G4. 🟢 Startup banner가 active provider 미표시 (LM Studio probe만 표시)
**발생 시점**: 2026-04-30 — 사용자가 `LLM_PROVIDER=claude`로 설정했음에도 banner는 LM Studio URL + 모델 목록만 출력 → "claude로 라우팅 안 됨"으로 오인
**위치**: `backend/main.py:88-127` lifespan
**본질**: banner 로직이 `LM_STUDIO_BASE_URL`만 probe. 실제 활성 provider(`LLM_PROVIDER` env) 정보 출력 없음.
**부수 발견 — .env override 함정**: `main.py:18-21` `load_dotenv(_root_env, override=True)` — PowerShell에서 `$env:LLM_PROVIDER="claude"` 해도 root `.env` 파일이 우선 (override). PS env vs .env file 우선순위 혼동 위험.
**해결**: 본 사이클에 supervisor 직접 fix (commit 미정 — 본 paste 직후 커밋 예정).
- `Provider : <name>` 라인 신설
- claude path 분기: `ANTHROPIC_API_KEY` 존재 + `CLAUDE_MODEL` 표시 (값 노출 X, ✔/✘만)
- 알 수 없는 provider 명시적 ✘ 표시
**우선순위**: 🟢 본 사이클 처리

### G5. 🟢 LLM Provider 예외 catch 좁음 (specific type만)
**발생 시점**: 2026-04-30 — "Failed to fetch" 증상 + backend 터미널 로그 침묵 관찰
**위치**:
- `backend/llm/claude.py:151-153` — `except anthropic.APIError`만 catch
- `backend/llm/lm_studio.py:315-317` (complete) + `375-377` (fallback) — `except httpx.HTTPError`만 catch
**본질**: 위 type 외 예외(`AttributeError`, `KeyError`, `ValueError`, SDK 내부 다른 예외 등)는 silent propagate. logger.exception 호출 안 됨. 사용자 측에는 "ERROR event 없이 stream 종결" → frontend "Failed to fetch".
**해결**: bare `except Exception` 추가 (각 위치). `f"{type(exc).__name__}: {exc}"` 형식으로 LLM ERROR event message에도 type 정보 포함. 본 사이클 supervisor 직접 fix.
**우선순위**: 🟢 본 사이클 처리

### G6. ⚪ "Failed to fetch" 본질 — 별개 진단 필요
**발생 시점**: 2026-04-30 (스크린샷)
**증상**: Frontend에 빈 agent 버블 2개 + "Failed to fetch" 표시. backend 터미널 로그 0줄.
**가설**:
- (a) 백엔드 미기동 또는 startup 단계 silent crash
- (b) 백엔드 활성 but `/api/query` 도달 전 네트워크 reset
- (c) G5 (좁은 예외 catch)로 SDK-level 예외 silent propagate → stream 끊김
**진단 절차**: G4·G5 fix + backend 재기동 후 재현 시도. 새 banner로 active provider 확인. 새 broader catch가 logger.exception 발사하는지 관찰.
**우선순위**: 🟠 (G4·G5 fix 후 재현 결과로 root 결정)

---

## H. 미분류 / 관찰 보류

### H1. ⚪ AS현안 4턴 통합 회귀 미실행
**박제 위치**: snapshot §7·§9·§11
**상태**: Phase 9 close 시점부터 미수행. Fix 1·2·3·4 + 한글 가드 + hotfix 종합 효과 미검증.
**우선순위**: 🟠 (사용자 환경 의존)

### H2. ⚪ 모델 교체 후 행동 일관성
**가설**: A1 회피 차원 모델 교체 시 다른 모델은 지금까지 가정한 동작(`<think>` strip 패턴, tool calling 호환성, 한글 응답)을 모두 충족하는지 미검증.
**관찰 항목**: Qwen3 / Qwen2.5-Coder / Llama 3.x 후보 중 1개 선정 후 회귀 케이스 1·2 재실행.

### H3. ⚪ build_report retry 로직의 비대칭 잔재
**위치**: `backend/tools/build_report/tool.py:160-185` 1회 retry
**가설**: retry 시 첫 시도 JSON + 에러 메시지를 conversation에 append. 이게 `<think>` strip 후의 잔재 또는 fence strip 후의 sanitized 형태인지 검증 필요. retry가 같은 환각을 반복할 위험.
**우선순위**: 🟠 (재현 시 진단)

### H4. ⚪ 동시 sub-agent 호출 시 race condition
**가설**: build_report·build_view가 동시에 실행되는 경로는 현재 설계상 없음(직렬 chain). 그러나 향후 SubAgent 카탈로그화(snapshot §11 중기 #9) 시 검토 필요.
**우선순위**: ⚪ (현재 N/A)

---

## 구조적 테마 (Structural Themes) — 케이스 → root cause 종합

> 30+ 케이스를 카테고리별 분류 외에 **근본 원인별로 재그룹**. 동일 root는 같은 구조적 fix로 일괄 해소 가능. Phase 10 SKILL Architecture(`plans/PHASE10-skill-architecture.md`)의 입력 자료.

### Theme 1 — 프롬프트 파편화 (rule이 들어갈 곳이 모호하거나 없음)
**해당 케이스**: E1 (TOP N), E2 (block 필수 필드), E7 (한글 SQL 금지), D1 (highlight.message), D5 (block type enum 환각), C2 (텍스트 본문 raw SELECT)
**현상**: 새 rule을 어디에 적을지 결정할 때마다 supervisor 판단 필요. system_base.md만 비대해지고, 도구별 description.md는 너무 짧아 못 담음. cross-cutting rule(예: 한글 SQL)이 둘 곳 없음.
**root cause**: 프롬프트 자산이 3 layer(system_base + description + tool.py inline)로 분산되었으나 **layer 책임 분리 원칙이 없음**. 도구·sub-agent·cross-cutting rule이 같은 슬롯을 두고 경쟁.
**구조적 fix**: SKILL.md 표준 + `prompts/rules/` 디렉토리 (Phase 10 옵션 A)

### Theme 2 — Sub-agent system prompt 인라인 (외부화 안 됨)
**해당 케이스**: D5·D6 (build_report 출력 품질), D1 (highlight.message), F2 (`<think>` strip)
**현상**: build_report·build_view의 sub-agent 자체 시스템 프롬프트가 `tool.py:28-52` 같은 Python f-string 안에 박힘. 프롬프트 변경이 코드 diff에 묻혀 review·diff·history 추적 불리. ReportSchema 스키마 변경 시 프롬프트 동기화 누락 위험.
**root cause**: sub-agent를 "tool wrapper로 보이는 도구"로 설계했으나, **내부 LLM 호출 프롬프트를 외부화할 슬롯을 미설정**.
**구조적 fix**: `backend/agents/<name>/system.md` 또는 SKILL의 `## System Prompt` 섹션

### Theme 3 — Reactive guard 없는 proactive guidance (혹은 그 역)
**해당 케이스**: D7 + E7 (한글 SQL — 가드만 있고 prompt 규칙 없음), C1 + E1 (row cap — code 가드 없고 description 권고만), D5 (block type enum — 검증만, prompt 가이드 없음)
**현상**: 한 쌍이어야 할 (가드, 프롬프트 규칙)이 한쪽만 존재. LLM은 prompt 무시하거나 가드 메시지로만 학습 → 잘못된 진단 학습(D7-수반).
**root cause**: 가드(`tool.py`)와 prompt 규칙(`system_base.md` or `description.md`)의 **소유권이 다른 파일에 분리**. "이 도구의 안전망과 가이드는 한 곳에 본다"는 원칙 부재.
**구조적 fix**: SKILL.md에 `## Rules` (proactive prompt) + `## Guards` (reactive code) 짝 명시. 한 도구의 모든 안전 자산을 같은 위치에서 본다.

### Theme 4 — 가드 에러 메시지가 진단 도구로 작동 안 함
**해당 케이스**: D7-수반 (한글 가드 메시지가 잘못된 진단 주입), B1·B2·B3 (raw KeyError 노출), D1 (validation 메시지 LLM에 전달 OK이나 1회 retry 한정)
**현상**: 가드는 적발하지만 LLM이 회복할 단서를 못 받거나 잘못 받음.
**root cause**: 가드 에러 메시지를 작성할 때 **LLM이 자기 회복할 수 있는 형태**로 설계하는 표준이 없음. exception → str(exc) 그대로 흘려보냄.
**구조적 fix**: 가드별 ErrorContract 정의 — 어떤 에러는 어떤 회복 단서를 함께 반환할지 SKILL.md `## Errors` 섹션에 명시.

### Theme 5 — 미래 SubAgent 카탈로그화 시 debt 폭증
**해당 케이스**: 현재 단일 케이스 없으나 snapshot §11 중기 #9 (anomaly_detector 등 추가) 시 build_report·build_view 인라인 패턴을 N회 반복 필요
**root cause**: 현 구조에서 새 sub-agent 추가 = tool.py 신설 + system_base.md 가이드 추가 + description.md 추가 + tool.py 안에 인라인 시스템 프롬프트 추가. 4 위치 동시 수정. 마찰 高.
**구조적 fix**: SKILL.md 1 슬롯 1 sub-agent 표준 → 새 추가는 디렉토리 1개 신설로 끝. 마찰 ↓.

### 종합 — 옵션 A의 정당성

위 5개 테마가 모두 같은 root: **"per-tool / per-subagent / per-rule" 자산의 격리·표준 슬롯이 없음**. E7 같은 한 case 단발 fix로는 동일 패턴이 N번 더 발생. SKILL.md 표준 채택 시:

- Theme 1·5: 자동 해소 (slot 표준화)
- Theme 2: `## System Prompt` 섹션 명세로 자동 외부화
- Theme 3: `## Rules` + `## Guards` 짝 표준
- Theme 4: `## Errors` 섹션으로 ErrorContract 표준

→ **개별 hotfix 비용 < 한 번 구조 fix 비용**의 임계점 도달. Phase 10 옵션 A 진행 권장.

---

## 갱신 이력

- **2026-04-30**: 최초 작성. Phase 9 hotfix 후 multi-turn 회귀 1차 결과 + LM Studio Jinja 에러 추가 박제.
- **2026-04-30 (#2)**: F5 (ThinkBlock empty 렌더) + F6 (처리 중... 칩 지속) 추가. 직원 업무일지 회귀 재현 스크린샷 기반.
- **2026-04-30 (#3)**: D5 (block type 환각 `metric_group`) + D6 (build_report invalid JSON escape) + **D7 (한글 가드 false positive — single-quoted literal 미strip — Phase 9 보강 B 결함)** + D8 (SQL retry degeneration) + B4 (AgentLoop retry trap circuit breaker 부재) 추가. **D7이 본 사이클 가장 critical 신규 발견** — plan 즉시 추가 권장.
- **2026-04-30 (#4)**: 16턴 trap 실측 로그 추가 박제. D7 강화(14턴 연속 차단 실측), **D7-수반 신설 (가드 에러 메시지가 LLM에 잘못된 진단 주입 → self-correction 영구 실패)**, D8 보강(`LIKE→LINE` 일관 오타), B5 신설 (continue_callback 정책 부재로 turn limit 무력화), B4 강화(16턴 실측), A2 분기(A2-a warmup vs A2-b context bloat). **D7 + D7-수반 + B4 묶음 fix 강력 권장** — 이 셋 없이는 모든 분류·집계 분석 시나리오가 무한 트랩.
- **2026-04-30 (#5)**: **E7 신설** — 한글 컬럼 proactive 금지 규칙이 system_base.md / db_query description.md 어디에도 없음. D7 가드 fix는 reactive, E7 prompt 추가는 proactive. **양쪽 묶음 fix가 본질 해결**. E7 추가만으로도 D7·D7-수반·B4·A2-b·D8 트리거 빈도 즉시 큰 감소 예상.
- **2026-04-30 (#6)**: Phase 10 Step 1+2 머지 완료 (`8366824` + `ffababa` + merge `86ed1dd`). D7·D7-수반·E7·D5·D6·E1 → 🟠 (proactive prompt + reactive guard 짝 fix 적용, 라이브 multi-turn 회귀 대기). C2·D8·A2-b는 D7 자연 해소 종속. 잔재 P0: A3 (httpx timeout), B4 (circuit breaker), C1 (db_query 코드 cap), A1 (LM Studio Jinja — 모델 교체 후 재현 검증).
- **2026-04-30 (#7)**: 사용자 회귀 시도 중 "Failed to fetch" + backend 터미널 침묵 발견. G4 (startup banner active provider 미표시) + G5 (provider 예외 catch 좁음) 박제 + 본 사이클 supervisor 직접 fix. G6 (Failed to fetch 본질)은 G4·G5 fix 후 재현 결과로 root 결정. 부수 발견: `.env` `override=True` 함정 (PS `$env:` < .env 파일).
- **2026-04-30 (#8)**: instruct 모델 회귀 로그 분석. **D9 신설** (instruct 모델 출력 격리 실패 — 중간 추론 전체가 사용자 가시 텍스트로 노출) + **D10 신설** (build_report 2회 실패 후 LLM이 build_view 직접 수동 호출 — chain 우회). **중요: 로그의 D7 트랩은 FALSE REGRESSION** — Phase 10 Step 1 fix가 코드에 정상 적용됨이 `tool.py` 직접 확인으로 입증. 로그의 구 에러 메시지는 백엔드 미재시작 증거.
- **2026-04-30 (#9)**: reasoning 모델(`qwen3.5-27b-reasoning-distilled` 등) 전환 후 회귀 로그 분석. **D7 fix 정상 작동 확인** (T1 SQL 200행 쿼리 통과 — 백엔드 재시작 확인, system_len 15797로 Phase 10 rules/ 로드 확인). **D9 🔴 → 🟠**: reasoning 모델이 `<think>` 블록 격리 작동 — 중간 추론 user-visible 문제 대폭 개선. **A3 🔵 → 🔴 격상**: reasoning 모델의 thinking 단계(chain-of-thought)가 120s 초과 → 200행 소규모 쿼리에서도 트리거. 즉시 fix 없이는 모든 분석 쿼리 차단 수준. **F7 신규 관찰 추가**: reasoning 모델에서 도구 호출 전 `💬` (빈 string) 전송 → 빈 assistant bubble 렌더 가능성.
- **2026-04-30 (#10)**: "프론트에서 요청 대기 시간이 굉장히 짧은거 같다" 관찰 분석. `backend/main.py:559-576` event_generator + `vite.config.ts` 코드 검토. **G7 신설**: SSE heartbeat 없음 → LLM reasoning 무음 구간(30~120s+)에서 연결 종료 위험. **A3 + G7 반드시 묶음 fix** — httpx timeout 연장(A3)만 하면 무음 구간이 더 길어져 G7이 악화됨.
- **2026-04-30 (#11)**: Phase 11 Backend 사이클 머지 완료 (`464d74d` + `f2ac33a` + `8d11067` + `61d0e9c` + `aaaef43` + merge `7a45c17`). **🟢 처리완료**: A3 (httpx timeout 환경변수화), G7 (SSE heartbeat 15s), C2 (build_report input cap). **🟠 부분처리** (라이브 회귀 대기): D6 (max_tokens 가변 + cap), D5 (block enum strict), D1 (highlight.message), A6 (SDK max_retries=0로 폭주만 차단, agent-level backoff 별도). **잔재 P0**: B4 (circuit breaker), C1 (db_query 코드 cap), B1·B2·B3 (tool input validation), 그리고 frontend 영역 — B-6 (TweaksPanel UI), F7 (빈 💬 검증), vite.config.ts SSE proxy 보강은 Front/View 위임으로 별도. Phase 12 후보: main.py 3-split + LLM helper 추출 (외부 진단 박제 — supervisorSnapshot.md §11 참조).
- **2026-04-30 (#12)**: Phase 11 Frontend (B-6) 머지 완료 (`a2ca3b4` + `eb03c01` + `c7830ef` + `daf513b` + `323a9b6` + merge `4a529d1`). **🟠 부분처리**: F7 (AssistantBubble 정밀 null guard 적용, 라이브 검증 대기). 사용자 환경에서 max_tokens slider + thinking toggle UI 노출 + reasoning 모델 도구 호출 직전 빈 bubble 미표시 검증 시 🟢. Phase 11 + Step 3 머지 완료된 시점에 통합 회귀 권장 (D6/D5/D1/A6/F7 일괄 검증).
- **2026-04-30 (#13)**: Phase 10 Step 3 머지 완료 (`bb4bcc3` + `ad92719` + `c899aef` + `5fcf13a` + `2705913` + merge `f9c1e39`). **구조적 테마 🟢 일괄 처리**: Theme 1 (프롬프트 파편화 — rules/ + SKILL.md + loader 자동 합성), Theme 2 (sub-agent 인라인 — system.md 외부화 + loader.get_subagent_system), Theme 3 (reactive guard ↔ proactive prompt 분리 — SKILL.md `## Rules` + `## Guards` 짝 표준), Theme 5 (미래 SubAgent debt — SKILL.md 표준화로 새 도구 추가 디렉토리 1개로 끝). **🟢 추가**: E2 (build_report description.md block 필수 필드 — SKILL.md `## Rules` + system.md hardening). **Theme 4 (가드 메시지가 회복 단서)** 는 SKILL.md `## Errors` 섹션 표준 도입으로 framework 마련됨, individual error 메시지 갱신은 case-by-case로 별도 사이클. system_total_len 12087 chars baseline 측정.

## 신규 케이스 추가 가이드

1. 카테고리 결정 (A~H, 새 카테고리 필요 시 추가)
2. ID 부여 (`<카테고리><번호>`, 카테고리별 단조 증가)
3. 상태 이모지 (⚪🔵🟠🟢🔴)
4. 필수 필드: 발생 시점 / 증상 / 위치(file:line) / 가설·본질 / 해결 후보 / 우선순위
5. 처리 완료 시 🟢 + hotfix commit hash 또는 plan ID 인용. 본문 그대로 두고 상태만 갱신.
