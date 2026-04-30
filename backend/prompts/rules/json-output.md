# JSON output rules (for LLM-generated JSON)

When emitting JSON (e.g. ReportSchema, axis hints, structured tool input), follow these strict rules:

- Output ONLY valid JSON. No markdown fences (` ```json `), no surrounding commentary, no `<think>` blocks, no trailing prose.
- Inside JSON string values, ALL backslashes MUST be escaped as `\\`. Common pitfalls:
  - Windows paths: write `"C:\\Users\\..."`, not `"C:\Users\..."`.
  - Regex literals: write `"\\d+"`, not `"\d+"`.
  - Markdown bracket escapes inside content: write `"\\[label\\]"`, not `"\[label\]"`.
- The ONLY allowed escape sequences inside JSON strings are: `\\`, `\"`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, and `\uXXXX`. Any other `\x` (e.g. `\d`, `\p`, `\a`, dangling `\`) is a JSON parse error and will be rejected.
- Korean text works fine in JSON without any escape: `"summary": "직원 7명 분석"` is valid. Korean does NOT require `\uXXXX`.
- Use double quotes for JSON string values. Single-quoted Korean is OK only when it appears INSIDE a SQL string embedded in a JSON value (e.g. a markdown block whose content shows a `'%한글%'` SQL literal).
