---
name: db_query
type: tool
version: 1
applies_to:
  - tool_description
  - system_prompt_addendum
required_rules:
  - korean-sql
  - result-size
  - error-recovery
---

## Description

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

## Rules

- Database identifiers (table/column names) are **always ASCII**. Korean is allowed only inside `AS [한글]` aliases, single-quoted `'한글'` literals, and comments. See the Korean text in SQL section in this prompt.
- Always cap result size — `TOP N` (default `TOP 100`, `TOP 1000` only when downstream aggregation needs it). See the Result size section.
- Do NOT issue an unbounded SELECT against transactional tables; reformulate "전체"/"모든" requests as aggregates.

## Guards

- `_assert_read_only(sql)` — rejects any DML/DDL keyword (INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/EXEC/EXECUTE/MERGE/REPLACE/CALL/GRANT/REVOKE/COMMIT/ROLLBACK).
- `_assert_no_korean_in_select(sql)` — strips single-quoted literals first, then rejects Korean text outside `AS <alias>` regions in the SELECT clause (anti-hallucination).

## Errors

| Error | Recovery hint for the LLM |
|---|---|
| `Blocked keyword 'X' detected` | Drop the DML keyword. Only SELECT is allowed. If the user asked to mutate data, explain that and stop. |
| `Korean column or string literal detected outside alias/literal context` | Re-check the domain schema for the correct ASCII column name. Wrap Korean values in single quotes (`'한글'`) when used in `WHERE`/`CASE WHEN ... THEN`. Do NOT just add more aliases. |
| `Invalid column name 'X'` (MSSQL) | Re-check the domain schema; if missing, call `list_tables`. Never guess a similar name from prior knowledge. |

## Examples

```sql
-- 회원별 최근 업무일지 (정상)
SELECT TOP 10 td.td_myUid, u.uName AS [담당자],
       CASE WHEN td.td_Today LIKE '%ERP%' THEN '시스템개발'
            ELSE '기타' END AS [업무분류]
FROM TGW_TaskDailyLog td
LEFT JOIN LZXP310T u ON td.td_myUid = u.Uid
ORDER BY td.td_writeDt DESC
```
