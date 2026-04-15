"""DBQueryTool — SELECT-only query execution with read-only guard."""
from __future__ import annotations

import asyncio
import re
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


def _assert_read_only(sql: str) -> None:
    match = _BLOCKED.search(sql)
    if match:
        raise ValueError(
            f"Blocked keyword '{match.group()}' detected. "
            "Only SELECT statements are allowed."
        )


class DBQueryTool(Tool):
    @property
    def name(self) -> str:
        return "db_query"

    @property
    def description(self) -> str:
        return (
            "Execute a read-only SELECT query against the MSSQL ERP database. "
            "Returns rows as a list of dicts. Only SELECT is allowed — "
            "any DML/DDL will be rejected."
        )

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
