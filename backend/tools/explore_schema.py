"""ExploreSchemaTool — live DB schema introspection (requires user approval)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from db.connection import get_connection
from llm.base import ToolSchema
from tools.base import Tool

logger = logging.getLogger(__name__)

_MAX_TABLES = 50
_MAX_COLUMNS_PER_TABLE = 30


class ExploreSchemaTool(Tool):
    """
    Queries INFORMATION_SCHEMA to discover tables and columns.
    Requires user approval (HITL) since it can be token-expensive.
    """

    @property
    def name(self) -> str:
        return "explore_schema"

    @property
    def description(self) -> str:
        return (
            "Explore the database schema by querying INFORMATION_SCHEMA. "
            "Use this when no domain registry matches the user's question. "
            "IMPORTANT: This tool requires user approval before execution. "
            "Provide a table_pattern to filter results (e.g. 'WPM%' or '%Order%')."
        )

    @property
    def requires_approval(self) -> bool:
        return True

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "table_pattern": {
                        "type": "string",
                        "description": (
                            "SQL LIKE pattern for table names (e.g. 'WPM%', '%Inventory%'). "
                            "Required to avoid returning all tables."
                        ),
                    },
                    "include_columns": {
                        "type": "boolean",
                        "description": "Include column details for matched tables (default: true).",
                        "default": True,
                    },
                    "include_procedures": {
                        "type": "boolean",
                        "description": "Include stored procedures matching the pattern (default: false).",
                        "default": False,
                    },
                },
                "required": ["table_pattern"],
            },
        }

    async def execute(self, input: dict[str, Any]) -> list[dict]:
        pattern = input.get("table_pattern", "%")
        include_cols = input.get("include_columns", True)
        include_procs = input.get("include_procedures", False)

        results: list[dict] = []

        async with get_connection() as conn:
            loop = asyncio.get_event_loop()

            def _query_tables():
                cursor = conn.cursor()
                # Get tables
                cursor.execute(
                    "SELECT TOP (?) TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE "
                    "FROM INFORMATION_SCHEMA.TABLES "
                    "WHERE TABLE_NAME LIKE ? "
                    "ORDER BY TABLE_NAME",
                    [_MAX_TABLES, pattern],
                )
                tables = [
                    {"schema": r[0], "table": r[1], "type": r[2]}
                    for r in cursor.fetchall()
                ]

                if include_cols and tables:
                    # Get columns for matched tables
                    table_names = [t["table"] for t in tables]
                    placeholders = ",".join("?" * len(table_names))
                    cursor.execute(
                        f"SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE "
                        f"FROM INFORMATION_SCHEMA.COLUMNS "
                        f"WHERE TABLE_NAME IN ({placeholders}) "
                        f"ORDER BY TABLE_NAME, ORDINAL_POSITION",
                        table_names,
                    )
                    col_map: dict[str, list[dict]] = {}
                    for r in cursor.fetchall():
                        tname = r[0]
                        if tname not in col_map:
                            col_map[tname] = []
                        if len(col_map[tname]) < _MAX_COLUMNS_PER_TABLE:
                            col_map[tname].append({
                                "column": r[1],
                                "type": r[2],
                                "nullable": r[3],
                            })

                    for t in tables:
                        t["columns"] = col_map.get(t["table"], [])

                if include_procs:
                    cursor.execute(
                        "SELECT s.name AS [schema], p.name AS [procedure] "
                        "FROM sys.procedures p "
                        "JOIN sys.schemas s ON p.schema_id = s.schema_id "
                        "WHERE p.name LIKE ? "
                        "ORDER BY p.name",
                        [pattern],
                    )
                    procs = [{"schema": r[0], "procedure": r[1]} for r in cursor.fetchall()]

                    if procs:
                        # Get parameters for each procedure
                        proc_names = [p["procedure"] for p in procs[:20]]
                        placeholders = ",".join("?" * len(proc_names))
                        cursor.execute(
                            f"SELECT SPECIFIC_NAME, PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE "
                            f"FROM INFORMATION_SCHEMA.PARAMETERS "
                            f"WHERE SPECIFIC_NAME IN ({placeholders}) "
                            f"ORDER BY SPECIFIC_NAME, ORDINAL_POSITION",
                            proc_names,
                        )
                        param_map: dict[str, list[dict]] = {}
                        for r in cursor.fetchall():
                            pname = r[0]
                            if pname not in param_map:
                                param_map[pname] = []
                            param_map[pname].append({
                                "param": r[1],
                                "type": r[2],
                                "mode": r[3],
                            })
                        for p in procs:
                            p["params"] = param_map.get(p["procedure"], [])

                        results.append({"procedures": procs})

                cursor.close()
                return tables

            tables = await loop.run_in_executor(None, _query_tables)
            results = tables + results

        logger.info("explore_schema: pattern=%s → %d results", pattern, len(results))
        return results
