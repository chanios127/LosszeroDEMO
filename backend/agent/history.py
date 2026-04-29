"""Conversation history utilities — pair-safe trimming + persistence normalization."""
from __future__ import annotations

import logging

from llm.base import Message

logger = logging.getLogger(__name__)


def _has_tool_calls(msg: Message) -> bool:
    return msg.get("role") == "assistant" and bool(msg.get("tool_calls"))


def _is_tool_result(msg: Message) -> bool:
    return msg.get("role") == "tool"


def trim_history_safely(messages: list[Message], max_len: int) -> list[Message]:
    """Trim to last *max_len* messages without breaking tool_use/tool_result pairs.

    Cut boundary advances forward if:
      - kept[0] is a tool_result (orphan — its tool_use is in dropped tail)
      - the last dropped message is assistant(tool_use) leaving its tool_result in kept tail
    """
    if len(messages) <= max_len:
        return list(messages)

    cut = len(messages) - max_len

    # Advance past leading tool_result orphans
    while cut < len(messages) and _is_tool_result(messages[cut]):
        cut += 1

    # Advance past assistant(tool_use) → tool_result chain at the boundary
    while (
        cut > 0
        and cut < len(messages)
        and _has_tool_calls(messages[cut - 1])
    ):
        cut += 1
        while cut < len(messages) and _is_tool_result(messages[cut]):
            cut += 1

    return messages[cut:]


def normalize_for_persistence(messages: list[Message]) -> list[Message]:
    """Persistence-boundary filter.

    - Drops system messages (re-injected per-turn from domain context).
    - Future stub: hydrate ref-mode DataRefs to embed mode (no-op for 9.5).
    """
    out: list[Message] = []
    for m in messages:
        if m.get("role") == "system":
            continue
        out.append(m)
    return out
