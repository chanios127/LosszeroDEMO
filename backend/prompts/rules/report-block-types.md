# ReportSchema block types (strict enum)

The `blocks` array in ReportSchema accepts EXACTLY these four `type` values. No other types are valid (no `metric_group`, `kpi_grid`, `table`, `comparison`, `card`, etc.):

| `type` | required fields | optional fields |
|---|---|---|
| `markdown` | `content` (str) | — |
| `metric` | `label` (str), `value` (str / int / float) | `delta` (str), `trend` (`"up"` / `"down"` / `"flat"`), `unit` (str) |
| `chart` | `viz_hint` (`"bar_chart"` / `"line_chart"` / `"pie_chart"` / `"table"` / `"number"`), `data_ref` (int — index into `data_refs`) | `x` (str), `y` (str or list[str]), `group_by` (str), `title` (str) |
| `highlight` | `level` (`"info"` / `"warning"` / `"alert"`), `message` (str — REQUIRED) | `related_data` (int — index into `data_refs`) |

Rules:
- For multiple metrics, emit MULTIPLE `metric` blocks. Never invent a `metric_group` block or put an array of metrics inside a single block.
- `highlight.message` is REQUIRED in every highlight block. The `level` describes severity; `message` carries the actual user-facing text.
- `highlight.level` enum is `"info" | "warning" | "alert"` — `"success"` and `"danger"` are NOT valid values. Use `"info"` for positive notes.
- `chart.data_ref` is an integer index, not a column name or table name. The `data_refs` array must contain that index.
- `chart.viz_hint` enum is exactly the 5 values listed above. Anything else (`"area_chart"`, `"scatter"`, `"heatmap"`, etc.) is invalid.
