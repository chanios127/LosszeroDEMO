"""Tool ABC — every tool must implement this interface."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from llm.base import ToolSchema


class Tool(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    def description(self) -> str:
        """Tool description (Phase 10 Step 3: read from SKILL.md ## Description).

        Subclasses can override but the default implementation is normally
        sufficient — it pulls the ``## Description`` section from the tool's
        ``SKILL.md`` via the loader. Returns ``""`` when no SKILL.md exists.
        """
        from prompts.loader import get_tool_description

        return get_tool_description(self.name)

    @abstractmethod
    def schema(self) -> ToolSchema: ...

    @abstractmethod
    async def execute(self, input: dict[str, Any]) -> Any: ...
