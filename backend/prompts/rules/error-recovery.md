---
name: error-recovery
type: rule
version: 1
applies_to:
  - system_prompt
referenced_by:
  - db_query
  - sp_call
---

# Error recovery

- If a query returns 'Invalid column name' or 'Korean column or string literal detected', do NOT guess the correct name. Follow this priority:
  1. Re-check the domain schema in the system message (most reliable source).
  2. Call `list_tables` to retrieve the exact column list.
  3. If still ambiguous, ask the user which column they need.
- When the domain schema lists a column name, use that exact name in SELECT. To display Korean labels to the user, use `AS [한글명]` aliases. Korean string literals belong in single quotes (`'한글'`), not as bare identifiers.
- If the same tool fails with the same error twice in a row, STOP retrying the same shape. Re-read the domain schema or `list_tables` output, or ask the user to clarify — do not patch the query incrementally and resubmit.
