"""AgentLoop: generator-pattern multi-turn agent with tool dispatch."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator, Callable, Awaitable

from agent.events import (
    AgentEvent,
    ApprovalRequestEvent,
    ErrorEvent,
    FinalEvent,
    LLMChunkEvent,
    ToolResultEvent,
    ToolStartEvent,
    VizHint,
)
from llm.base import LLMProvider, LLMEvent, LLMEventType, Message, ToolCall
from tools.base import Tool

# Type for the approval callback: (tool_name, input) → bool
ApprovalCallback = Callable[[str, dict], Awaitable[bool]]

logger = logging.getLogger(__name__)


def _infer_viz_hint(data: list[dict]) -> VizHint:
    """Heuristic: pick visualization type from result shape."""
    if not data:
        return "table"
    if len(data) == 1 and len(data[0]) == 1:
        return "number"
    keys = list(data[0].keys())
    numeric_cols = [
        k for k in keys
        if isinstance(data[0][k], (int, float))
    ]
    if len(numeric_cols) >= 1 and len(keys) >= 2:
        date_hints = {"date", "month", "week", "year", "time", "일", "월", "주"}
        for k in keys:
            if any(h in k.lower() for h in date_hints):
                return "line_chart"
        return "bar_chart"
    return "table"


def _make_assistant_tool_msg(text: str, tc: ToolCall) -> Message:
    """Build an assistant message that contains a tool_use block."""
    return {
        "role": "assistant",
        "content": text,
        "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.name,
                    "arguments": json.dumps(tc.input),
                },
            }
        ],
    }


def _make_tool_result_msg(tc_id: str, content: str) -> Message:
    """Build a tool-result message."""
    return {
        "role": "tool",
        "tool_call_id": tc_id,
        "content": content,
    }


class AgentLoop:
    """
    Runs a multi-turn agentic loop:
      LLM call → tool_call? → dispatch → inject result → repeat
    Yields AgentEvent instances for SSE streaming.
    """

    def __init__(
        self,
        llm: LLMProvider,
        tools: list[Tool],
        max_turns: int = 10,
        approval_callback: ApprovalCallback | None = None,
        domain_context: str = "",
    ) -> None:
        self.llm = llm
        self.tools: dict[str, Tool] = {t.name: t for t in tools}
        self.max_turns = max_turns
        self._approval_callback = approval_callback
        self._domain_context = domain_context

    async def run(
        self, user_input: str, history: list[Message] | None = None
    ) -> AsyncGenerator[AgentEvent, None]:
        messages: list[Message] = list(history) if history else []
        # Inject domain context as system message at the start
        if self._domain_context:
            messages.insert(0, {"role": "system", "content": self._domain_context})
        messages.append({"role": "user", "content": user_input})
        tool_schemas = [t.schema() for t in self.tools.values()]
        last_data: list[dict] | None = None
        answer_parts: list[str] = []

        for turn in range(1, self.max_turns + 1):
            pending_tool_call: ToolCall | None = None
            text_buf: list[str] = []

            async for llm_event in self.llm.complete(messages, tool_schemas):
                if llm_event.type == LLMEventType.TEXT_DELTA:
                    text_buf.append(llm_event.delta)
                    yield LLMChunkEvent(delta=llm_event.delta)

                elif llm_event.type == LLMEventType.TOOL_CALL:
                    pending_tool_call = llm_event.tool_call

                elif llm_event.type == LLMEventType.DONE:
                    break

                elif llm_event.type == LLMEventType.ERROR:
                    yield ErrorEvent(message=llm_event.message)
                    return

            full_text = "".join(text_buf)
            if full_text:
                answer_parts.append(full_text)

            # No tool call → final answer
            if pending_tool_call is None:
                # If there was text, add assistant msg for history consistency
                if full_text:
                    messages.append({"role": "assistant", "content": full_text})
                viz_hint: VizHint = (
                    _infer_viz_hint(last_data) if last_data else "table"
                )
                yield FinalEvent(
                    answer=full_text or " ".join(answer_parts),
                    viz_hint=viz_hint,
                    data=last_data,
                )
                return

            # --- Tool dispatch ---
            tc = pending_tool_call
            yield ToolStartEvent(tool=tc.name, input=tc.input, turn=turn)

            # Always append assistant(tool_use) FIRST, then tool result
            # This is required by Anthropic's API message ordering
            messages.append(_make_assistant_tool_msg(full_text, tc))

            tool = self.tools.get(tc.name)
            if tool is None:
                err_msg = f"Unknown tool: {tc.name}"
                yield ToolResultEvent(
                    tool=tc.name, output=None, turn=turn, error=err_msg
                )
                messages.append(_make_tool_result_msg(tc.id, err_msg))
                continue

            # HITL: if tool requires approval, pause and wait
            if tool.requires_approval:
                yield ApprovalRequestEvent(
                    tool=tc.name,
                    input=tc.input,
                    turn=turn,
                    reason=f"'{tc.name}' 도구는 DB 스키마를 직접 조회합니다. 승인하시겠습니까?",
                )
                if self._approval_callback:
                    approved = await self._approval_callback(tc.name, tc.input)
                else:
                    approved = False  # no callback = deny by default

                if not approved:
                    deny_msg = "사용자가 이 도구 실행을 거부했습니다."
                    yield ToolResultEvent(
                        tool=tc.name, output=None, turn=turn, error=deny_msg
                    )
                    messages.append(_make_tool_result_msg(tc.id, deny_msg))
                    continue

            try:
                result = await tool.execute(tc.input)
                rows = len(result) if isinstance(result, list) else None
                last_data = result if isinstance(result, list) else None

                yield ToolResultEvent(
                    tool=tc.name, output=result, rows=rows, turn=turn,
                )
                messages.append(_make_tool_result_msg(
                    tc.id,
                    json.dumps(result, ensure_ascii=False, default=str),
                ))

            except Exception as exc:
                logger.exception("Tool %s raised: %s", tc.name, exc)
                err_msg = str(exc)
                yield ToolResultEvent(
                    tool=tc.name, output=None, turn=turn, error=err_msg
                )
                messages.append(_make_tool_result_msg(tc.id, f"Error: {err_msg}"))

        # max_turns exceeded
        yield ErrorEvent(
            message=f"Agent stopped after {self.max_turns} turns without a final answer."
        )
