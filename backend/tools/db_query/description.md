Execute a read-only SELECT query against the MSSQL database. Returns rows as a list of dicts.

Rules:
- Only SELECT is allowed. Any DML/DDL (INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/EXEC/MERGE/...) will be rejected by the server.
- Use tables and columns that actually exist in the provided domain schema or in `list_tables` results. Do not invent identifiers.
- MSSQL (T-SQL) dialect: use `TOP N` instead of `LIMIT N`. Wrap identifiers in `[square brackets]` only when needed (reserved word, special chars).
- For filtered queries against large tables, prefer parameterized form: pass `params` as a positional array bound to `?` placeholders in the SQL.
- Keep result size reasonable — add `TOP`, `WHERE`, or aggregation. The full row set is sent back to the LLM context.

When NOT to use:
- If the user is only asking what tables/schemas exist, call `list_tables` instead — don't `SELECT name FROM sys.tables`.
- If a whitelisted stored procedure covers the same question with better parameters, prefer `sp_call`.
