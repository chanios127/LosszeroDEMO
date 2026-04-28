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
