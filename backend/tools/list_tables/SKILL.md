---
name: list_tables
type: tool
version: 1
applies_to:
  - tool_description
  - system_prompt_addendum
required_rules: []
---

## Description

List table names from the database, optionally filtered by a SQL LIKE pattern. Each result includes an inferred domain classification when the table name matches a known prefix convention.

When to use:
- The domain schema in the system prompt does NOT cover the tables needed for the user's question, and you need to discover what else exists.
- The user explicitly asks what tables are available.

When NOT to use:
- The domain schema already lists the tables you need. Prefer it — the schema has columns, joins, and descriptions that `list_tables` does not.
- You already called `list_tables` in the current turn with the same or broader pattern. Reuse that result.

Parameters:
- `pattern`: optional SQL LIKE pattern. Omit to list all tables. Examples: `'%Order%'` (name contains "Order"), `'TGW_%'` (specific prefix).
- `include_columns`: defaults to `false`. Only set to `true` if you actually need column names — with a broad pattern it can return thousands of rows and bloat the context.

Tips:
- Start narrow with a pattern before using `include_columns=true` on a broad match.

## Rules

- Prefer the domain schema in the system message when the answer is already there — `list_tables` is a discovery tool, not a routine lookup.
- When the user asks "어떤 테이블이 있나" / "what tables exist", reach for `list_tables` rather than `SELECT name FROM sys.tables`.

## Guards

- No code-level guards beyond the standard read-only DB connection. The risk is context bloat from `include_columns=true` on broad patterns — see Rules.

## Errors

| Error | Recovery hint for the LLM |
|---|---|
| Empty result list | The pattern matched zero tables. Re-check the pattern or call without one to see all tables. |
