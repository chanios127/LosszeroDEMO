---
name: sp_call
type: tool
version: 1
applies_to:
  - tool_description
  - system_prompt_addendum
required_rules:
  - error-recovery
  - result-size
---

## Description

Execute a whitelisted MSSQL stored procedure with named parameters. Returns result rows as a list of dicts.

The whitelist is built at runtime from the `stored_procedures` array inside each loaded domain JSON under `backend/schema_registry/domains/`. Any SP not declared there will be rejected by the server. The domain schema (provided in the system prompt) shows the available SPs for the current domain, including their parameters and return shape.

When to use:
- The domain schema lists an SP that directly answers the user's question with fewer moving parts than a raw SELECT.
- Complex business logic lives inside the SP and reproducing it in ad-hoc SQL would be fragile.

Parameters:
- `sp_name`: exact stored procedure name as declared in the domain schema.
- `params`: named parameters as a JSON object, e.g. `{"@sDt": "2026-01-01", "@eDt": "2026-01-31"}`. The leading `@` is optional — both `@sDt` and `sDt` are accepted.

Behavior:
- If the SP returns a result set, you get the rows.
- If the SP has no result set (void), you get a single-row notification message.

## Rules

- Use the **exact** SP name from the domain schema. Casing matters; do not rename or pluralise.
- Pass parameters that are documented in the schema. Extra/unknown params will fail at the database, not at the server.

## Guards

- `is_sp_whitelisted(sp_name)` — rejects calls to any SP not declared in a loaded domain JSON. Error message includes the sorted list of allowed SPs.

## Errors

| Error | Recovery hint for the LLM |
|---|---|
| `'X' is not registered in any loaded domain's stored_procedures` | Re-read the domain schema for the correct SP name. If the user asked for something the schema doesn't expose, fall back to `db_query` or explain the limitation. |
| Database-level error (e.g. parameter type mismatch) | Re-check the SP's parameter list in the domain schema. Don't retry with the same args. |
