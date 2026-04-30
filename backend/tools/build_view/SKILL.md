---
name: build_view
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

ReportSchema(build_report 출력)를 받아 ViewBundle을 생성한다. 각 block을 프론트엔드 컴포넌트에 매핑하고, chart block의 x/y/group_by가 누락된 경우 데이터 컬럼에서 추론한다.

**호출 조건**: `build_report` 출력 직후에만 호출. `build_report`를 먼저 호출하지 않은 상태에서 호출 금지.

**호출 순서**: `db_query` → `build_report` → `build_view` → final.

**입력**:
- `report_schema`: build_report가 반환한 ReportSchema JSON object

**출력**: ViewBundle JSON — enriched ReportSchema(chart 축 채워짐) + 컴포넌트 라우팅 힌트.

## Rules

- The only legitimate input is a ReportSchema **returned by `build_report`** in the same chain. Do NOT hand-craft a ReportSchema (you will likely get the discriminator/enum wrong).
- If `build_report` failed, do NOT call `build_view` to "recover" — surface the failure to the user instead.

## Guards

- `ReportSchema.model_validate(input["report_schema"])` validates the entire input upfront. Errors show the exact pydantic discriminator/enum mismatch.

## Errors

| Error | Recovery hint for the LLM |
|---|---|
| `KeyError: 'report_schema'` | Re-issue the call with `report_schema` set to the dict returned by `build_report`. |
| `Unable to extract tag using discriminator 'mode'` | The input was likely hand-crafted. Re-run `build_report` and pass through its output unchanged. |
| `union_tag_invalid` (e.g. block.type='bar_chart') | Block types are limited to `markdown`/`metric`/`chart`/`highlight`. `bar_chart`/`pie_chart` go in `chart.viz_hint`, not `block.type`. |
