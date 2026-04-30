---
name: result-size
type: rule
version: 1
applies_to:
  - system_prompt
referenced_by:
  - db_query
  - sp_call
---

# Result size

- Always cap result size with `TOP N` (T-SQL) — never issue an unbounded SELECT against transactional tables. Default to `TOP 100` for samples; use `TOP 1000` only when downstream aggregation requires more rows.
- Avoid raw text-body columns (long memo / 일지 내용 / report content) in `SELECT` against large tables. Sample with `TOP N` or pull only summary columns, then drill into specific rows by primary key when needed.
- For "전체", "모든", "전부" type requests, reformulate as an aggregate (`COUNT`, `GROUP BY`, `SUM`) — full row dumps bloat the LLM context and slow downstream tool calls.
- If a query unexpectedly returns many rows, prefer `GROUP BY` over enumeration in the next step. Do NOT silently retry the same unbounded SELECT.
