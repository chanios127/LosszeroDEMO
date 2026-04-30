"""ListTablesTool — lightweight table name listing with domain classification."""
from __future__ import annotations

import asyncio
from typing import Any

from db.connection import get_connection
from domains.loader import MODULE_DOMAIN_MAP, parse_table_name
from llm.base import ToolSchema
from tools.base import Tool


class ListTablesTool(Tool):
    @property
    def name(self) -> str:
        return "list_tables"

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": (
                            "Optional SQL LIKE pattern for table names. "
                            "Examples: '%Order%' (name contains 'Order'), 'TGW_%' (specific prefix). "
                            "Omit to list all tables."
                        ),
                    },
                    "include_columns": {
                        "type": "boolean",
                        "description": "If true, include column names for each table. Default: false.",
                        "default": False,
                    },
                },
            },
        }

    async def execute(self, input: dict[str, Any]) -> list[dict]:
        pattern = input.get("pattern", "%")
        include_columns = input.get("include_columns", False)

        async with get_connection() as conn:
            loop = asyncio.get_event_loop()

            def _run():
                cursor = conn.cursor()

                # Get table names
                cursor.execute(
                    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                    "WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE ? "
                    "ORDER BY TABLE_NAME",
                    [pattern],
                )
                tables = [row[0] for row in cursor.fetchall()]

                results = []
                for tname in tables:
                    entry: dict[str, Any] = {"table": tname}

                    # Classify by domain
                    parsed = parse_table_name(tname)
                    if parsed:
                        domain_cd, biz_name = parsed
                        domain_info = MODULE_DOMAIN_MAP.get(domain_cd)
                        if domain_info:
                            entry["domain"] = f"{domain_cd}({domain_info['ko']})"

                    results.append(entry)

                # Optionally include columns
                if include_columns and tables:
                    placeholders = ",".join("?" * len(tables))
                    cursor.execute(
                        f"SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE "
                        f"FROM INFORMATION_SCHEMA.COLUMNS "
                        f"WHERE TABLE_NAME IN ({placeholders}) "
                        f"ORDER BY TABLE_NAME, ORDINAL_POSITION",
                        tables,
                    )
                    col_map: dict[str, list[str]] = {}
                    for row in cursor.fetchall():
                        tbl = row[0]
                        if tbl not in col_map:
                            col_map[tbl] = []
                        col_map[tbl].append(f"{row[1]}({row[2]})")

                    for entry in results:
                        entry["columns"] = col_map.get(entry["table"], [])

                cursor.close()
                return results

            return await loop.run_in_executor(None, _run)
