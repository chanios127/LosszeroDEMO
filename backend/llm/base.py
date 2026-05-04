"""LLMProvider abstract base + shared event types."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from functools import lru_cache
from typing import Any, AsyncGenerator, TypedDict


@lru_cache(maxsize=1)
def load_base_system_prompt() -> str:
    """Load the composed base system prompt.

    Phase 10 Step 3: delegates to ``prompts.loader.build_system_prompt`` so
    that ``system_base.md`` + ``prompts/rules/*.md`` (system_prompt-applies)
    + each tool's ``SKILL.md`` Rules/Guards/Errors addendum are concatenated
    in one place. Lazy import keeps the ``llm`` package import-light and
    avoids any startup-order coupling with the ``tools`` package.
    """
    from prompts.loader import build_system_prompt

    return build_system_prompt()


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
        *,
        max_tokens: int | None = None,
        thinking_enabled: bool | None = None,
        thinking_budget: int | None = None,
        system_base: bool = True,
    ) -> AsyncGenerator[LLMEvent, None]:
        """Stream an LLM completion.

        ``system_base``: when False, the harness's composed base system prompt
        (system_base.md + rules + tool addenda — ~13k chars) is NOT prepended.
        Use for narrow utility calls (microskill detector, classifier helpers)
        where the bundled context is irrelevant and the extra tokens cause
        rate-limit / 400 errors on small models.
        """
        ...
