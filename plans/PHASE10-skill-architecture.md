# Phase 10 — SKILL Architecture (프롬프트 자산 표준화)

> 작성: 2026-04-30 (Phase 9 클로즈 + multi-turn 회귀 16턴 trap 발견 직후)
> 입력 자료: `error-case.md` §"구조적 테마" — 30+ 케이스 → 5 root cause 종합
> 결정 근거: 단발 hotfix 누적 비용 > 한 번 구조 fix 비용 임계점 도달

---

## Context

Phase 9 (Deep Agent Loop) 종료 후 multi-turn 회귀에서 30+ 오류 케이스 누적. `error-case.md` §"구조적 테마"가 5 root cause로 압축:

1. 프롬프트 파편화 — rule을 어디 적을지 매번 ad-hoc 결정
2. Sub-agent system prompt 인라인 (`tool.py:28-52`) — 외부화 안 됨
3. Reactive guard와 proactive prompt rule이 다른 파일 → 짝이 끊김 (D7+E7 사고 패턴)
4. 가드 에러 메시지가 LLM의 회복 단서로 설계되지 않음 (D7-수반: 잘못된 진단 주입)
5. 미래 SubAgent 카탈로그화 시 4 위치 동시 수정 패턴 누적 → debt 폭증

**해결 원칙**: Claude skills(SKILL.md) 패턴 차용. 도구·sub-agent·cross-cutting rule이 각자 자기 슬롯에 자산 보유. loader가 startup에 collect하여 system 프롬프트 합성.

---

## 목표 디렉토리 구조

```
backend/
  prompts/
    system_base.md          # core anti-hallucination + 응답 언어 (다이어트됨)
    rules/                  # cross-cutting (도구 N개에 적용되는 규약)
      korean-sql.md         # E7 — 한글 SQL strict
      result-size.md        # E1 — TOP N + row cap
      report-block-types.md # D5 — ReportSchema block enum
      json-output.md        # D6 — LLM JSON escape rules
      error-recovery.md     # E6 — 'Invalid column name' 회복 (현 system_base §Error recovery 이전)
    loader.py               # SKILL.md scan + system prompt 합성

  tools/
    db_query/
      tool.py
      SKILL.md              # description + rules + guards + errors + examples
      schema.py
    list_tables/
      tool.py
      SKILL.md
    sp_call/
      tool.py
      SKILL.md
    build_report/
      tool.py
      SKILL.md              # tool description (LLM 호출용)
      system.md             # sub-agent 자체 system prompt (외부화 ← tool.py:28-52)
      schema.py
      description.md        # (deprecated, SKILL.md로 통합)
    build_view/
      tool.py
      SKILL.md
      system.md
      schema.py
      description.md        # (deprecated)

  agents/                   # (선택) 향후 SubAgent 카탈로그화 시. Phase 10에서는 신설만
    README.md               # SubAgent 추가 가이드
```

### SKILL.md 표준 (frontmatter + body)

```yaml
---
name: db_query
type: tool                    # tool | sub_agent | rule
version: 1
applies_to:
  - tool_description          # LLM tool list에 description으로 노출
  - system_prompt_addendum    # 시스템 프롬프트에 도구별 섹션으로 추가
required_rules:               # cross-cutting rule 의존성 (rules/ 디렉토리)
  - korean-sql
  - result-size
  - error-recovery
---

## Description
(LLM이 도구 선택 시 보는 brief — 현 description.md 본문)

## Rules (proactive)
- Korean column identifiers do NOT exist...
- Always use TOP N (max 1000)...

## Guards (reactive — code-level enforcement)
- `_assert_read_only(sql)` — SELECT 외 reject
- `_assert_no_korean_in_select(sql)` — bare Korean column reject (single-quoted literal은 strip 후 검사)
- `MAX_ROWS=1000` — over-fetch 시 ValueError raise

## Errors (회복 단서 — LLM-facing)
| Error | 회복 가이드 |
|---|---|
| `Korean column or string literal detected outside alias` | "한글 토큰 위치 확인: `AS [한글]` alias / `'한글'` literal 외에는 사용 불가. 도메인 schema의 ASCII 컬럼명 사용." |
| `Result exceeded 1000 rows` | "TOP N 또는 GROUP BY 추가." |

## Examples
...
```

### Sub-agent SKILL + system.md 분리

`build_report/SKILL.md` (tool description — outer LLM이 호출 시 보는 것):
```yaml
---
name: build_report
type: sub_agent
version: 1
applies_to: [tool_description, system_prompt_addendum]
required_rules: [report-block-types, json-output]
sub_agent_system: ./system.md   # 별도 파일 인용
---
## Description
DB 조회 결과를 받아 ReportSchema 생성...
## Rules
- 호출 조건: "분석" / "보고서" / ... 키워드
## Errors
| ... |
```

`build_report/system.md` (sub-agent 내부 LLM 호출 시 system 메시지):
```markdown
You are a report generation sub-agent. Output a single JSON document conforming to ReportSchema.

## ReportSchema
- block.type ∈ {markdown, metric, chart, highlight}  ← 절대 다른 값 사용 금지 (D5 hardening)
- highlight: {level: "info"|"warning"|"success"|"danger", message: str (REQUIRED), related_data?: int}
- ...

## JSON output rules
- Single-quoted Korean string literals OK
- All backslashes inside string MUST be escaped as `\\`  ← D6 hardening
- ...
```

### Cross-cutting rule 예시 (`prompts/rules/korean-sql.md`)

```yaml
---
name: korean-sql
type: rule
applies_to: [system_prompt]
referenced_by: [db_query]
---

# Korean text in SQL (strict)

- Database identifiers (table/column names) are **always ASCII** — e.g. `wb_Title`, `td_myUid`, `LZXP310T`. Korean tokens NEVER appear as bare identifiers. Verify against the domain schema or `list_tables` before SELECT.
- Korean text is allowed ONLY in:
  1. **Aliases**: `AS [한글명]` (square brackets) or `AS "한글명"`
  2. **String literals**: `WHERE col LIKE '%한글%'`, `THEN '카테고리'`
  3. **Comments**: `-- 설명`
- DO NOT write `SELECT 담당자명 FROM ...` — use ASCII column with `AS [한글명]` alias.
- The server enforces this with an automatic guard. Recovery: rewrite SELECT with ASCII column names from the domain schema (do NOT just add aliases).
```

---

## Loader 동작 (`backend/prompts/loader.py` 신설)

Startup 1회 또는 매 요청:

1. `prompts/system_base.md` 로드 (core)
2. `prompts/rules/*.md` 스캔 → frontmatter `applies_to: [system_prompt]` 만 collect
3. `tools/*/SKILL.md` 스캔 → `applies_to: [system_prompt_addendum]` 의 body에서 `## Rules` / `## Guards` / `## Errors` 추출 → 시스템 프롬프트에 도구별 섹션으로 추가
4. tool description은 OpenAI tool schema의 `description`으로 그대로 (현 description.md 자리)
5. Sub-agent의 `sub_agent_system: ./system.md` 인용 → tool.py가 자기 LLM 호출 시 그 파일 내용을 system 메시지로

```python
# loader.py 개략
def build_system_prompt(tools: list[Tool]) -> str:
    parts = [load("prompts/system_base.md")]
    for rule in load_rules(applies_to="system_prompt"):
        parts.append(rule.body)
    for tool in tools:
        skill = load_skill(tool.skill_path)
        if "system_prompt_addendum" in skill.applies_to:
            parts.append(render_tool_section(skill))
    return "\n\n".join(parts)

def get_subagent_system(name: str) -> str:
    skill = load_skill(f"backend/tools/{name}/SKILL.md")
    return load(skill.frontmatter["sub_agent_system"])
```

---

## 마이그레이션 단계

### Step 1 — 인프라 + cross-cutting rules 신설 (loader 도입 없이도 사용 가능)
1. `backend/prompts/rules/` 디렉토리 신설
2. `korean-sql.md`(E7), `result-size.md`(E1), `report-block-types.md`(D5), `json-output.md`(D6), `error-recovery.md`(E6 이전) 신설
3. `system_base.md`에 임시로 `{{include: rules/korean-sql.md}}` 같은 마커 두지 않음 — Step 1은 **수동 concat**: system_base.md 본문에 rule들을 일단 추가. Step 2에서 loader가 자동화.
4. **D7 가드 fix** — `_assert_no_korean_in_select`에 single-quoted literal strip 추가 + 에러 메시지 갱신 (rule 본문 인용)
5. 검증: 회귀 케이스 1·2 재실행 → trap 해소 확인

**산출**: hotfix 효과 즉시. 구조는 아직 미완이나 자산이 올바른 위치 시작.

### Step 2 — Sub-agent system prompt 외부화
1. `backend/tools/build_report/system.md` 신설 — `tool.py:28-52` 인라인 프롬프트 이전
2. `backend/tools/build_view/system.md` 신설 — 보조 LLM 축 추론 프롬프트 이전
3. tool.py가 startup에 자기 system.md 로드 (간단 helper)
4. ReportSchema block enum / required field / JSON escape 규칙을 system.md에 명시 (D5·D6·D1 동시 해소)

**산출**: sub-agent 프롬프트 review 가능. D5/D6/D1 prompt-side hardening.

### Step 3 — SKILL.md 표준 도입 + loader.py
1. 각 도구에 `SKILL.md` 신설 (description.md 통합 + frontmatter + Rules/Guards/Errors 섹션)
2. `backend/prompts/loader.py` 신설 — frontmatter parsing (yaml) + applies_to 라우팅 + system prompt 합성
3. `backend/main.py`의 `llm = get_provider()` 직후 `system_prompt = build_system_prompt(tools)` 호출 → 매 요청 시 합성 결과 사용 (또는 startup 캐시)
4. `description.md` 제거 (SKILL.md `## Description`이 대체)

**산출**: 옵션 A 완성. 새 도구·sub-agent 추가 = 디렉토리 1개 + SKILL.md 1개로 끝.

### Step 4 (선택) — `agents/` 디렉토리 + SubAgent 카탈로그화
- snapshot §11 중기 #9 후속. 본 plan에서는 README만 작성 + 향후 anomaly_detector 등록 시 SKILL pattern 적용.

---

## 변경 파일 / 영향 범위

| 단계 | 신설 | 수정 | 삭제 |
|---|---|---|---|
| Step 1 | `prompts/rules/*.md` 5개 | `system_base.md`(rule 본문 추가), `tools/db_query/tool.py`(가드 fix + 메시지) | — |
| Step 2 | `tools/build_report/system.md`, `tools/build_view/system.md` | `tools/build_report/tool.py`(인라인 → load), `tools/build_view/tool.py`(동상) | — |
| Step 3 | `tools/*/SKILL.md`, `prompts/loader.py` | `main.py`(loader 사용), `tools/*/__init__.py` (skill_path expose) | `tools/*/description.md`(SKILL.md 통합 후) |
| Step 4 | `agents/README.md` | — | — |

### 잠금 영향 (snapshot §8 Locks Registry)

- `BuildReportTool` / `BuildViewTool` 인터페이스 잠금 — **무위반**. tool.py의 input/output 시그니처 무변경. 시스템 프롬프트만 외부화.
- `ReportSchema` / `ViewBundle` — 무위반. block enum 강조는 prompt 측, 스키마 자체는 변경 없음.
- design/components/report/* — 무관 (frontend).

---

## 검증

### Step 1 검증 (가장 짧은 사이클)
- 백엔드 `from main import app` import OK
- 회귀 케이스 1: "직원별 최근 업무 일지... 시각화" 재실행 → D7 trap 미발생, build_report·build_view 정상 chain
- 회귀 케이스 2: AS현안 4턴 재실행 → snapshot §11 즉시 #1 항목 ✅ 처리

### Step 2 검증
- `tools/build_report/system.md` 변경 시 코드 변경 없이도 sub-agent 동작 변화 측정 가능
- D5 (block type 환각) 빈도 측정 — system.md에 enum 명시 후 1차 attempt 통과율

### Step 3 검증
- `loader.py` 단위 테스트 — 새 SKILL.md 추가 시 자동 collect 확인
- system 프롬프트 길이 baseline 비교 (현 ~9785 → Step 3 후 안정 기준값)
- 새 도구 mock 추가 → loader 자동 인식 확인

---

## 본 plan과 즉시 hotfix(E7+D7)의 관계

**Step 1이 즉시 hotfix를 자연 흡수**. 별도 hotfix 사이클 안 돌아도 됨:
- E7 = `prompts/rules/korean-sql.md` 신설 + system_base.md 수동 인용
- D7 = `tools/db_query/tool.py` 가드 fix
- 두 가지가 Step 1 단일 사이클에 묶임

D7 단독 hotfix 후 Step 2~3 진입 vs Step 1을 hotfix처럼 묶음 처리 — 후자 권장.

---

## 진행 권장 (사용자 승인 후)

1. **Step 1 (즉시, supervisor 직접 또는 BackEnd Infra 단일 위임)** — 30~60분. 회귀 검증.
2. **Step 2 (다음 사이클, BackEnd Infra)** — 30~60분. sub-agent 프롬프트 외부화.
3. **Step 3 (Phase 10 메인, BackEnd Infra)** — 1~2시간. SKILL.md + loader.
4. **Step 4 (선택, 후속)** — agent 카탈로그 README.

**총 예상**: 3~5시간. 단발 hotfix 4~6회 누적 비용(케이스 발견 → 위치 결정 → patch → 회귀 → 박제 = 회당 30분~1시간)을 1회 구조 fix로 압축.

### 위임 vs 직접

- Step 1: supervisor 직접 (소규모 + 회귀 검증 동반)
- Step 2~3: BackEnd Infra 위임 적합 (영역 명확, 잠금 영향 무, sub-agent 프롬프트 도메인 지식 필요 X). 위임 명세 작성 시 본 plan 통째 첨부.
- Step 4: 별도 사이클로

### 박제 (Phase 10 진입 시)

- supervisorSnapshot.md §11 중기 항목 갱신: "Phase 10 — SKILL Architecture" 추가
- §8 Locks Registry — Step 3 진입 시 SKILL.md 표준 자체를 잠금 후보로 검토
- agent-prompts/README.md — Step 3 후 SKILL.md 영역 권한 가이드 추가

---

## Risk / Open Questions

1. **YAML frontmatter parser 의존성** — 별도 라이브러리 도입(예: PyYAML) 또는 minimal regex parser. 기존 의존성 확인 필요.
2. **Loader 캐시 정책** — startup 1회 vs 파일 변경 감지(dev 편의). 현 dev 플로우는 hot-reload 아님 → startup 1회로 충분.
3. **system.md vs SKILL.md `## System Prompt` 섹션** — 단일 파일에 frontmatter+description+system prompt 모두 담을지(SKILL.md에 `## System Prompt` 섹션) vs 분리(SKILL.md + system.md). 현 plan은 후자 — sub-agent system prompt 길이가 길어 분리 가독성 ↑.
4. **rules/ 의존성 주입 방식** — `required_rules: [korean-sql]`를 SKILL.md에서 인용할 때 rule이 자동 system prompt에 포함되는지, 도구별 섹션에만 들어가는지. 현 plan은 전자 — rule이 글로벌 적용 (cross-cutting 본질).
5. **error-case.md → SKILL.md `## Errors` 매핑** — 기존 30+ 케이스를 어느 SKILL의 Errors 섹션에 넣을지 마이그레이션 비용. Step 3 진입 시 점진 (필요한 것만).

---

## 박제 / 후속

본 plan을 supervisorSnapshot.md §11 중기 항목으로 격상. Step 1 진입 시:

- §10 hotfix를 §10 + §10b로 확장: §10b "Phase 10 Step 1 — rules/ 신설 + D7+E7 fix"
- §11 즉시 항목에 "AS현안 4턴 회귀" 통합 검증 묶음 처리

Step 3 완료 시:
- SPEC.md / ARCHITECTURE.md 갱신 — SKILL.md 표준 + loader 패턴 박제
- ROADMAP.md — Phase 10 클로즈
- HANDOFF.md — 새 도구·sub-agent 추가 가이드 갱신
