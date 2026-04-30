"""AgentLoop: generator-pattern multi-turn agent with tool dispatch."""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator, Callable, Awaitable

from agent.events import (
    AgentEvent,
    ContinuePromptEvent,
    ErrorEvent,
    FinalEvent,
    LLMChunkEvent,
    SubAgentCompleteEvent,
    SubAgentStartEvent,
    ToolResultEvent,
    ToolStartEvent,
    VizHint,
)
from llm.base import LLMProvider, LLMEvent, LLMEventType, Message, ToolCall
from tools.base import Tool

# Callback: () → bool (True = continue, False = stop)
ContinueCallback = Callable[[], Awaitable[bool]]

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
    Multi-turn agentic loop:
      LLM call → tool_call? → dispatch → inject result → repeat
    Yields AgentEvent instances for SSE streaming.
    """

    def __init__(
        self,
        llm: LLMProvider,
        tools: list[Tool],
        max_turns: int = 10,
        domain_context: str = "",
        continue_callback: ContinueCallback | None = None,
        *,
        max_tokens: int | None = None,
        thinking_enabled: bool | None = None,
        thinking_budget: int | None = None,
    ) -> None:
        self.llm = llm
        self.tools: dict[str, Tool] = {t.name: t for t in tools}
        self.max_turns = max_turns
        self._domain_context = domain_context
        self._continue_callback = continue_callback
        self._final_messages: list[Message] = []
        self.max_tokens = max_tokens
        self.thinking_enabled = thinking_enabled
        self.thinking_budget = thinking_budget

    def _llm_kwargs(self) -> dict:
        """Keyword args forwarded to provider.complete on every turn."""
        kwargs: dict = {}
        if self.max_tokens is not None:
            kwargs["max_tokens"] = self.max_tokens
        if self.thinking_enabled is not None:
            kwargs["thinking_enabled"] = self.thinking_enabled
        if self.thinking_budget is not None:
            kwargs["thinking_budget"] = self.thinking_budget
        return kwargs

    def _propagate_llm_options(self) -> None:
        """Push current llm options to every sub-agent tool that supports it."""
        kwargs = self._llm_kwargs()
        for tool in self.tools.values():
            setter = getattr(tool, "set_llm_options", None)
            if callable(setter):
                setter(**kwargs)

    def get_final_messages(self) -> list[Message]:
        """Snapshot of messages at end of last run() — includes system, user, assistant, tool."""
        return self._final_messages

    async def run(
        self, user_input: str, history: list[Message] | None = None
    ) -> AsyncGenerator[AgentEvent, None]:
        messages: list[Message] = list(history) if history else []
        # Inject domain context as system message
        if self._domain_context:
            messages.insert(0, {"role": "system", "content": self._domain_context})
        messages.append({"role": "user", "content": user_input})

        tool_schemas = [t.schema() for t in self.tools.values()]
        last_data: list[dict] | None = None
        answer_parts: list[str] = []
        turn = 0
        turn_limit = self.max_turns

        # Observability: one-shot snapshot of what we're sending into the loop
        system_total_len = sum(
            len(m.get("content", "")) for m in messages if m.get("role") == "system"
        )
        non_system = [m for m in messages if m.get("role") != "system"]
        logger.info(
            "AgentLoop start: messages=%d (system=%d, other=%d) system_total_len=%d tools=%d",
            len(messages),
            len(messages) - len(non_system),
            len(non_system),
            system_total_len,
            len(tool_schemas),
        )

        # Propagate llm options to sub-agent tools (build_report/build_view)
        # so their internal LLM calls inherit max_tokens / thinking config.
        self._propagate_llm_options()
        llm_kwargs = self._llm_kwargs()

        while turn < turn_limit:
            turn += 1
            pending_tool_call: ToolCall | None = None
            text_buf: list[str] = []

            async for llm_event in self.llm.complete(
                messages, tool_schemas, **llm_kwargs
            ):
                if llm_event.type == LLMEventType.TEXT_DELTA:
                    text_buf.append(llm_event.delta)
                    yield LLMChunkEvent(delta=llm_event.delta)

                elif llm_event.type == LLMEventType.TOOL_CALL:
                    pending_tool_call = llm_event.tool_call

                elif llm_event.type == LLMEventType.DONE:
                    break

                elif llm_event.type == LLMEventType.ERROR:
                    self._final_messages = list(messages)
                    yield ErrorEvent(message=llm_event.message)
                    return

            full_text = "".join(text_buf)
            if full_text:
                answer_parts.append(full_text)

            # No tool call → final answer
            if pending_tool_call is None:
                if full_text:
                    messages.append({"role": "assistant", "content": full_text})
                viz_hint: VizHint = (
                    _infer_viz_hint(last_data) if last_data else "table"
                )
                answer = full_text or " ".join(answer_parts)
                if not answer.strip():
                    logger.warning(
                        "AgentLoop: empty LLM response on turn %d (no text, no tool_call). "
                        "system_total_len=%d messages=%d tools=%d",
                        turn, system_total_len, len(messages), len(tool_schemas),
                    )
                    answer = "(LLM returned empty response)"
                self._final_messages = list(messages)
                yield FinalEvent(
                    answer=answer,
                    viz_hint=viz_hint,
                    data=last_data,
                )
                return

            # --- Tool dispatch ---
            tc = pending_tool_call
            yield ToolStartEvent(tool=tc.name, input=tc.input, turn=turn)

            # assistant(tool_use) must come BEFORE tool result
            messages.append(_make_assistant_tool_msg(full_text, tc))

            tool = self.tools.get(tc.name)
            if tool is None:
                err_msg = f"Unknown tool: {tc.name}"
                yield ToolResultEvent(
                    tool=tc.name, output=None, turn=turn, error=err_msg
                )
                messages.append(_make_tool_result_msg(tc.id, err_msg))
                continue

            # Tools whose results should be treated as visualizable data
            _DATA_TOOLS = {"db_query", "sp_call"}
            _SUBAGENT_TOOLS = {"build_report", "build_view"}

            if tc.name in _SUBAGENT_TOOLS:
                yield SubAgentStartEvent(name=tc.name)

            try:
                result = await tool.execute(tc.input)
                rows = len(result) if isinstance(result, list) else None
                # Only store as viz data if it's a data tool (not metadata like list_tables)
                if tc.name in _DATA_TOOLS and isinstance(result, list):
                    last_data = result

                yield ToolResultEvent(
                    tool=tc.name, output=result, rows=rows, turn=turn,
                )

                # Fix 3: prepend row count meta for list results
                result_str = json.dumps(result, ensure_ascii=False, default=str)
                if isinstance(result, list):
                    result_str = f"[meta] rows={len(result)}\n" + result_str
                messages.append(_make_tool_result_msg(tc.id, result_str))

                if tc.name in _SUBAGENT_TOOLS:
                    summary = f"{tc.name} completed"
                    if isinstance(result, dict) and "title" in result:
                        summary = result["title"]
                    yield SubAgentCompleteEvent(name=tc.name, output_summary=summary)

            except Exception as exc:
                logger.exception("Tool %s raised: %s", tc.name, exc)
                err_msg = str(exc)
                yield ToolResultEvent(
                    tool=tc.name, output=None, turn=turn, error=err_msg
                )
                messages.append(_make_tool_result_msg(tc.id, f"Error: {err_msg}"))
                if tc.name in _SUBAGENT_TOOLS:
                    yield SubAgentCompleteEvent(
                        name=tc.name, output_summary=f"Error: {err_msg}"
                    )

            # Check turn limit — ask user to continue if at boundary
            if turn >= turn_limit and pending_tool_call is not None:
                if self._continue_callback:
                    yield ContinuePromptEvent(
                        turn=turn,
                        message=f"{turn}턴 도달. 계속 진행할까요?",
                    )
                    if await self._continue_callback():
                        turn_limit += self.max_turns
                        continue
                # No callback or user declined — fall through to final
                break

        # Loop ended — return whatever we have
        viz_hint_final: VizHint = _infer_viz_hint(last_data) if last_data else "table"
        fallback_answer = " ".join(answer_parts).strip()
        if not fallback_answer:
            logger.warning(
                "AgentLoop: loop ended with empty answer after %d turns "
                "(hit turn_limit=%d with no final text).",
                turn, turn_limit,
            )
            fallback_answer = "(완료 — 텍스트 응답 없음)"
        self._final_messages = list(messages)
        yield FinalEvent(
            answer=fallback_answer,
            viz_hint=viz_hint_final,
            data=last_data,
        )
