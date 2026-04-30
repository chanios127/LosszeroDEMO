# Korean text in SQL (strict)

- Database identifiers (table/column names) are **always ASCII** — e.g. `wb_Title`, `td_myUid`, `LZXP310T`. Korean tokens NEVER appear as bare identifiers. Verify against the domain schema or `list_tables` before SELECT.
- Korean text is allowed ONLY in:
  1. **Aliases**: `AS [한글명]` (square brackets) or `AS "한글명"` — to display Korean labels in the result.
  2. **String literals**: `WHERE col LIKE '%한글%'`, `CASE WHEN col LIKE '%한글%' THEN '한글카테고리'` — single-quoted.
  3. **Comments**: `-- 설명`.
- DO NOT write `SELECT 담당자명 FROM ...` (bare Korean = invalid identifier — no such column exists). Use the ASCII column from the domain schema, optionally with an `AS [한글명]` alias.
- The server enforces this with an automatic guard — violations are rejected. Recovery: do NOT just add more aliases; rewrite the SELECT with actual ASCII column names from the domain schema. If the Korean was intended as a string literal (e.g. inside `CASE WHEN ... THEN '카테고리'`), wrap it in single quotes.
