---
name: report_generate
type: sub_agent
version: 1
applies_to:
  - tool_description
  - system_prompt_addendum
required_rules:
  - json-output
sub_agent_system: ./system.md
---

## Description

`build_schema`가 만든 ReportSchema를 받아 보관용 메타데이터(title / summary / domain / tags)를 자동 생성한다. 이후 사용자 confirm 시 archive에 저장된다.

**호출 조건**: 사용자 의도에 "보고서 만들어줘", "저장해줘", "보관해", "정리해서 남겨줘" 같은 **보존/저장** 의도가 있을 때만 호출. 단순 분석 요청("분석해줘", "현황 알려줘")으로 끝나는 경우는 build_schema → build_view → final 후 종료하고 본 도구 호출 X.

**호출 순서**: `db_query` (또는 `list_tables`/`sp_call`) → `build_schema` → (`build_view` 동시 또는 직후) → `report_generate` → `final`.

**입력**:
- `report_schema`: build_schema가 반환한 ReportSchema dict
- `user_intent`: 원 사용자 질의 (도메인/태그 추론에 사용)

**출력**: `{title, summary, domain, tags}` JSON. 후속 단계에서 main.py가 `_report_proposals[id_temp]`에 저장하고 `report_proposed` SSE 이벤트를 발행 → 프론트가 ProposalCard 렌더 → 사용자 confirm/reject.

도구 실패 시 LLM은 fallback으로 schema.title 그대로 사용 또는 사용자에게 안내.

## Rules

- Call **only** when the user explicitly requested 보관/저장/아카이브/정리. Pure analysis or factual queries do NOT need this step.
- Always called **after** `build_schema`. Do NOT hand-construct ReportSchema input — use the dict returned by `build_schema` unchanged.
- Title should be concise (≤ 40 chars) and describe the *report content*, not the user query.
- Tags: 3~5 items, each ≤ 10 chars (e.g. `"근태"`, `"우수사원"`, `"VIP대응"`).
- Domain: match the matched-domain code if known (e.g. `"3z_mes"`, `"groupware"`); otherwise empty string.

## Guards

- `GeneratedReportMeta.model_validate` rejects missing title/summary, non-list tags, or non-string domain.
- The `_THINK_RE` strip and markdown-fence trimming inside `tool.py` defensively clean LLM output before parse.

## Errors

| Error | Recovery hint for the LLM |
|---|---|
| `KeyError: 'report_schema'` | Re-issue the call with `report_schema` set to the dict returned by `build_schema`. |
| `Field required` (title / summary) | Re-emit JSON with both `title` and `summary` filled. They are mandatory. |
| `LLM returned invalid JSON` | Re-emit the JSON with all backslashes escaped as `\\`. See JSON output rules. |
