"""LLMProvider abstract base + shared event types."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, AsyncGenerator, TypedDict


@lru_cache(maxsize=1)
def load_base_system_prompt() -> str:
    """Load the project-wide base system prompt from backend/prompts/system_base.md."""
    # backend/llm/base.py -> backend/prompts/system_base.md
    path = Path(__file__).resolve().parent.parent / "prompts" / "system_base.md"
    return path.read_text(encoding="utf-8").strip()


# ---------------------------------------------------------------------------
# Message format (OpenAI-compatible superset)
# ---------------------------------------------------------------------------

class Message(TypedDict, total=False):
    role: str           # "user" | "assistant" | "tool" | "system"
    content: str
    tool_calls: list[dict]   # assistant → tool calls
    tool_call_id: str        # tool result


# ---------------------------------------------------------------------------
# Tool schema (JSON Schema subset)
# ---------------------------------------------------------------------------

class ToolSchema(TypedDict):
    name: str
    description: str
    parameters: dict[str, Any]   # JSON Schema object


# ---------------------------------------------------------------------------
# LLM output events
# ---------------------------------------------------------------------------

class LLMEventType(str, Enum):
    TEXT_DELTA = "text_delta"
    TOOL_CALL = "tool_call"
    DONE = "done"
    ERROR = "error"


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class LLMEvent:
    type: LLMEventType
    delta: str = ""
    tool_call: ToolCall | None = None
    message: str = ""     # for ERROR type


# ---------------------------------------------------------------------------
# Abstract provider
# ---------------------------------------------------------------------------

class LLMProvider(ABC):
    """
    Yields LLMEvent instances.  Callers consume with async-for.

    Contract:
    - Zero or more TEXT_DELTA events (streaming text).
    - Zero or one TOOL_CALL event per turn.
    - Exactly one DONE (or ERROR) event at the end.
    """

    @abstractmethod
    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSchema],
    ) -> AsyncGenerator[LLMEvent, None]:
        ...
