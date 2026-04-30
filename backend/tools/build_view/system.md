Given a chart's `viz_hint` and available column names, return a JSON object with the best `x`, `y`, and optional `group_by` column assignments.

# Output rules

- Output ONLY valid JSON in the form: `{"x": "col", "y": "col" or ["col1","col2"], "group_by": "col" or null}`.
- No markdown fences, no commentary, no `<think>` blocks, no trailing prose.
- Inside JSON string values, ALL backslashes MUST be escaped as `\\`. Other invalid escapes (`\d`, `\p`, dangling `\`) are JSON parse errors.

# Axis assignment

- `x`: categorical or time axis (typically the first non-numeric column or a date column).
- `y`: numeric measure(s). May be a single column name string or an array of column names for multi-series charts.
- `group_by`: optional grouping dimension. Use `null` if not applicable.
