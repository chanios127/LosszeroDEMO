---
name: report-block-types
type: rule
version: 2
applies_to:
  - sub_agent_prompt
referenced_by:
  - build_schema
---

# ReportSchema block types (strict enum)

The `blocks` array in ReportSchema accepts EXACTLY these seven `type` values. No other types are valid (no `metric_group`, `table_block`, `comparison`, `card`, etc.):

| `type` | required fields | optional fields |
|---|---|---|
| `markdown` | `content` (str) | — |
| `metric` | `label` (str), `value` (str / int / float) | `delta` (str), `trend` (`"up"` / `"down"` / `"flat"`), `unit` (str) |
| `chart` | `viz_hint` (see chart.viz_hint enum below), `data_ref` (int — index into `data_refs`) | `x` (str), `y` (str or list[str]), `group_by` (str), `title` (str) |
| `highlight` | `level` (`"info"` / `"warning"` / `"alert"`), `message` (str — REQUIRED) | `related_data` (int — index into `data_refs`) |
| `bubble_breakdown` | `data_ref` (int), `bubble` (object: `{label, size, x, color?}`) | `title` (str), `cards` (list of BubbleCard), `layout` (`"row"` / `"stack"`, default `"row"`) |
| `kpi_grid` | `metrics` (list of KpiMetric) | `title` (str), `columns` (`2` / `3` / `4`) |
| `ranked_list` | `data_ref` (int), `fields` (object: `{name, primary, secondary?, tags?, color_dot?}`) | `title` (str), `subtitle` (str), `limit` (int), `highlight_top` (int) |

`chart.viz_hint` enum (exactly seven values): `"bar_chart"` / `"line_chart"` / `"pie_chart"` / `"table"` / `"number"` / `"gantt"` / `"radar"`. Anything else (`"area_chart"`, `"scatter"`, `"heatmap"`, etc.) is invalid.

`chart` with `viz_hint: "gantt"` accepts two shapes:
- **span** (start + end 둘 다): `y: ["<start_col>", "<end_col>"]` (배열).
- **anchor** (단일 시각만, 예: 출근 시각만): `y: "<time_col>"` (단일 string). 컴포넌트가 15분 anchor marker로 자동 렌더.
- `group_by`는 색상 그룹 전용 — 시간 컬럼을 절대 `group_by`에 넣지 말 것.

`KpiMetric`: `{label, value, delta?, trend?, unit?, severity?}`. `severity` enum: `"good" | "neutral" | "warning" | "alert"`.

Rules:
- For multiple related KPIs (3+), prefer a single `kpi_grid` block over separate `metric` blocks. Use `metric` only for an isolated headline KPI.
- `highlight.message` is REQUIRED in every highlight block. The `level` describes severity; `message` carries the actual user-facing text.
- `highlight.level` enum is `"info" | "warning" | "alert"` — `"success"` and `"danger"` are NOT valid values. Use `"info"` for positive notes.
- `chart.data_ref` / `bubble_breakdown.data_ref` / `ranked_list.data_ref` are integer indices, not column names or table names. The `data_refs` array must contain that index.
- `bubble_breakdown.bubble` and `ranked_list.fields` are column-name mappings: each value is the `name` of a column inside the referenced `data_refs[i].columns` (the frontend extracts that column from each row).
