---
name: build_schema
type: sub_agent
version: 1
applies_to:
  - tool_description
  - system_prompt_addendum
required_rules:
  - report-block-types
  - json-output
sub_agent_system: ./system.md
---

## Description

DB 조회 결과(`data_results`)를 받아 구조화된 분석 보고서 schema를 생성한다.

**호출 조건**: 사용자 의도에 "분석", "보고서", "요약", "현황 정리", "리포트", "레포트" 같은 키워드가 명시적으로 있을 때만 호출.
단순 질의(예: "어제 출근자 몇 명?")는 `db_query` 후 `final` 답변으로 종료하고 본 도구를 호출하지 말 것.

**호출 순서**: `db_query` (또는 `list_tables`/`sp_call`) → `build_schema` → `build_view` → `final`.

**입력**:
- `user_intent`: 원 질의를 그대로 echo (보고서 의도를 명시)
- `data_results`: 직전 도구 출력의 `rows` + `columns` 배열 (1개 이상)

**출력**: ReportSchema JSON. 후속 단계에서 `build_view`가 받아 ViewBundle로 매핑.

도구 실패 시 에러가 표면화됨. LLM은 실패 메시지를 보고 재시도 또는 사용자에게 명시적으로 안내.

## Rules

- Call **only** when the user explicitly requested 분석/보고서/요약/현황/리포트. Do NOT call for plain factual queries — answer with the `db_query` result directly.
- Always followed immediately by `build_view` in the same chain. Do NOT call `build_view` without first running `build_schema`, and never construct ReportSchema by hand inside an `build_view` call.
- Pass through real `rows`/`columns` from the prior `db_query`/`sp_call` output. The server caps cell length and row count before LLM ingestion (BUILD_REPORT_MAX_CELL_CHARS / BUILD_REPORT_MAX_ROWS) and surfaces the truncation in `sampling_meta`.

## Guards

- Pydantic `ReportSchema.model_validate` rejects unknown block types, missing required fields (e.g. `highlight.message`), and out-of-range `chart.data_ref` indices.
- `_truncate_data_results()` caps long-text cells and row count before the inner LLM call; truncated cells appear as `"...(truncated, N chars)"`.
- `_THINK_RE` strips `<think>...</think>` reasoning blocks and stray markdown fences before `json.loads`.

## Errors

| Error | Recovery hint for the LLM |
|---|---|
| `KeyError: 'user_intent'` / `KeyError: 'data_results'` | Re-issue the call with both keys filled. `user_intent` is the original user query; `data_results` is the prior tool's `rows`/`columns`. |
| `Field required` validation failure (e.g. `highlight.message`) | Re-emit the JSON with the missing required field. Consult the ReportSchema block enum and required fields table. |
| `LLM returned invalid JSON: Invalid \escape` | Re-emit the JSON with all backslashes inside string values escaped as `\\`. See JSON output rules. |
| `build_schema failed after 2 attempts` | Surface the underlying validation error to the user; do NOT try to construct `build_view` input by hand. Fall back to a plain markdown answer using the raw query results. |
