"""SPCallTool — whitelist-based stored procedure execution."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from db.connection import get_connection
from domains.loader import is_sp_whitelisted, get_all_whitelisted_sp_names
from llm.base import ToolSchema
from tools.base import Tool

logger = logging.getLogger(__name__)


class SPCallTool(Tool):
    @property
    def name(self) -> str:
        return "sp_call"

    @property
    def description(self) -> str:
        return (
            "Execute a whitelisted MSSQL stored procedure with named parameters. "
            "Only procedures registered in sp_whitelist.json are allowed. "
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
                        "description": "Exact stored procedure name from the whitelist.",
                    },
                    "params": {
                        "type": "object",
                        "description": "Named parameters as key-value pairs (e.g. {'@sDt': '2026-01-01'}).",
                        "additionalProperties": True,
                    },
                },
                "required": ["sp_name"],
            },
        }

    async def execute(self, input: dict[str, Any]) -> list[dict]:
        sp_name: str = input.get("sp_name", "")
        params: dict = input.get("params", {})

        if not is_sp_whitelisted(sp_name):
            allowed = get_all_whitelisted_sp_names()
            raise ValueError(
                f"'{sp_name}' is not in sp_whitelist.json. "
                f"Allowed: {sorted(allowed) if allowed else '(none registered)'}"
            )

        # Strip @ prefix from param keys if present (normalize)
        clean_params = {
            k.lstrip("@"): v for k, v in params.items()
        }
        param_str = ", ".join(f"@{k}=?" for k in clean_params)
        sql = f"EXEC {sp_name} {param_str}".strip()

        async with get_connection() as conn:
            loop = asyncio.get_event_loop()

            def _run():
                cursor = conn.cursor()
                cursor.execute(sql, list(clean_params.values()))
                if cursor.description:
                    columns = [col[0] for col in cursor.description]
                    rows = cursor.fetchall()
                    cursor.close()
                    return [dict(zip(columns, row)) for row in rows]
                cursor.close()
                return [{"message": f"{sp_name} executed (no result set)"}]

            return await loop.run_in_executor(None, _run)
