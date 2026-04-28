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
