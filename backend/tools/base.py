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
    @abstractmethod
    def description(self) -> str: ...

    @abstractmethod
    def schema(self) -> ToolSchema: ...

    @abstractmethod
    async def execute(self, input: dict[str, Any]) -> Any: ...
