"""DBQueryTool — SELECT-only query execution with read-only guard."""
from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any

from db.connection import get_connection
from llm.base import ToolSchema
from tools.base import Tool

# Blocked DML/DDL keywords (case-insensitive, word boundary)
_BLOCKED = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|EXEC|EXECUTE|"
    r"MERGE|REPLACE|CALL|GRANT|REVOKE|COMMIT|ROLLBACK)\b",
    re.IGNORECASE,
)

_DESCRIPTION = (Path(__file__).parent / "description.md").read_text(encoding="utf-8").strip()


def _assert_read_only(sql: str) -> None:
    match = _BLOCKED.search(sql)
    if match:
        raise ValueError(
            f"Blocked keyword '{match.group()}' detected. "
            "Only SELECT statements are allowed."
        )


# Korean character detection (Hangul syllables + Jamo)
_KOREAN = re.compile(r"[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]+")


def _extract_select_clause(sql: str) -> str:
    """Extract SELECT...FROM substring (first match only)."""
    m = re.search(r"\bSELECT\b(.*?)\bFROM\b", sql, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else ""


def _strip_aliases(select_clause: str) -> str:
    """Remove ``AS <alias>`` patterns so only source column identifiers remain."""
    return re.sub(
        r"\bAS\s+(\[[^\]]+\]|\"[^\"]+\"|`[^`]+`|\w+)",
        "",
        select_clause,
        flags=re.IGNORECASE,
    )


def _assert_no_korean_in_select(sql: str) -> None:
    """Reject SELECT queries that use Korean column names (likely hallucinated).

    Aliases via ``AS [한글명]`` and single-quoted Korean string literals
    (``'한글'`` inside ``WHERE``/``CASE WHEN ... THEN``) are allowed — only
    bare source identifiers are checked.
    """
    # Strip single-quoted string literals BEFORE locating the SELECT clause —
    # Korean inside a quoted literal (e.g. CASE WHEN ... THEN '카테고리') is a
    # legitimate value, not a column reference. Replacing them with empty
    # quotes preserves the surrounding SQL structure for the alias-strip pass.
    sql_for_check = re.sub(r"'[^']*'", "''", sql)
    select_part = _extract_select_clause(sql_for_check)
    if not select_part:
        return  # No SELECT...FROM found — other guards will catch issues
    stripped = _strip_aliases(select_part)
    if _KOREAN.search(stripped):
        raise ValueError(
            "Korean column or string literal detected outside alias/literal context. "
            "Korean is allowed ONLY in: AS [한글] aliases, single-quoted '한글' literals, "
            "or comments. If a CASE WHEN ... THEN '카테고리' is what you want, ensure "
            "the Korean is in single quotes. If you intended a column reference, use "
            "the ASCII column name from the domain schema."
        )


class DBQueryTool(Tool):
    @property
    def name(self) -> str:
        return "db_query"

    @property
    def description(self) -> str:
        return _DESCRIPTION

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "A valid T-SQL SELECT statement.",
                    },
                    "params": {
                        "type": "array",
                        "items": {"type": ["string", "number", "boolean", "null"]},
                        "description": "Optional positional parameters for parameterized queries.",
                        "default": [],
                    },
                },
                "required": ["sql"],
            },
        }

    async def execute(self, input: dict[str, Any]) -> list[dict]:
        sql: str = input.get("sql", "")
        params: list = input.get("params", [])

        _assert_read_only(sql)
        _assert_no_korean_in_select(sql)

        async with get_connection() as conn:
            loop = asyncio.get_event_loop()

            def _run():
                cursor = conn.cursor()
                cursor.execute(sql, params or [])
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                cursor.close()
                return [dict(zip(columns, row)) for row in rows]

            return await loop.run_in_executor(None, _run)
