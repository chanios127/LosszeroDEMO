"""DomainLookupTool — browse available domain registries (no approval needed)."""
from __future__ import annotations

from typing import Any

from domains.loader import load_all_domains, domain_to_context, get_domain_summary
from llm.base import ToolSchema
from tools.base import Tool


class DomainLookupTool(Tool):
    @property
    def name(self) -> str:
        return "domain_lookup"

    @property
    def description(self) -> str:
        return (
            "Look up available domain registries to find which tables, columns, "
            "and stored procedures are available. Use this FIRST before querying. "
            "Pass domain='all' for a summary, or a specific domain name for full schema."
        )

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": (
                            "Domain name to look up (e.g. 'production'). "
                            "Use 'all' to list all available domains."
                        ),
                        "default": "all",
                    },
                },
            },
        }

    async def execute(self, input: dict[str, Any]) -> str:
        domain_name = input.get("domain", "all").strip().lower()
        domains = load_all_domains()

        if domain_name == "all":
            return get_domain_summary()

        for d in domains:
            if d.get("domain", "").lower() == domain_name:
                return domain_to_context(d)

        available = [d.get("domain", "") for d in domains]
        return f"Domain '{domain_name}' not found. Available: {available}"
