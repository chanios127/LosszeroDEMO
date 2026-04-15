"""SPCallTool — whitelist-based stored procedure execution."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from db.connection import get_connection
from llm.base import ToolSchema
from tools.base import Tool

logger = logging.getLogger(__name__)


def _get_whitelist() -> list[str]:
    raw = os.environ.get("SP_WHITELIST", "")
    return [s.strip() for s in raw.split(",") if s.strip()]


def _check_whitelist(sp_name: str) -> None:
    whitelist = _get_whitelist()
    if not whitelist:
        # No whitelist configured — allow all (PoC mode)
        return
    for prefix in whitelist:
        if sp_name.lower().startswith(prefix.lower()):
            return
    raise ValueError(
        f"Stored procedure '{sp_name}' is not in the whitelist. "
        f"Allowed prefixes: {whitelist}"
    )


class SPCallTool(Tool):
    @property
    def name(self) -> str:
        return "sp_call"

    @property
    def description(self) -> str:
        return (
            "Execute a whitelisted MSSQL stored procedure with named parameters. "
            "Use this when you know which SP to call and its parameter values. "
            "Returns result rows as a list of dicts."
        )

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "sp_name": {
                        "type": "string",
                        "description": "Exact stored procedure name (e.g. usp_GetProduction).",
                    },
                    "params": {
                        "type": "object",
                        "description": "Named parameters as key-value pairs (e.g. {'StartDate': '2026-01-01'}).",
                        "additionalProperties": True,
                    },
                },
                "required": ["sp_name"],
            },
        }

    async def execute(self, input: dict[str, Any]) -> list[dict]:
        sp_name: str = input.get("sp_name", "")
        params: dict = input.get("params", {})

        _check_whitelist(sp_name)

        param_str = ", ".join(f"@{k}=?" for k in params)
        sql = f"EXEC {sp_name} {param_str}".strip()

        async with get_connection() as conn:
            loop = asyncio.get_event_loop()

            def _run():
                cursor = conn.cursor()
                cursor.execute(sql, list(params.values()))
                if cursor.description:
                    columns = [col[0] for col in cursor.description]
                    rows = cursor.fetchall()
                    cursor.close()
                    return [dict(zip(columns, row)) for row in rows]
                cursor.close()
                return [{"message": f"{sp_name} executed (no result set)"}]

            return await loop.run_in_executor(None, _run)
