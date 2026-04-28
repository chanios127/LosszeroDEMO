"""ClaudeProvider — Anthropic SDK with streaming tool_use."""
from __future__ import annotations

import json
import logging
import os
from typing import AsyncGenerator

import anthropic

from llm.base import (
    LLMEvent,
    LLMEventType,
    LLMProvider,
    Message,
    ToolCall,
    ToolSchema,
    load_base_system_prompt,
)

logger = logging.getLogger(__name__)


class ClaudeProvider(LLMProvider):
    def __init__(
        self,
        model: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.model = model or os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
        self.client = anthropic.AsyncAnthropic(
            api_key=api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        )

    def _to_anthropic_tools(self, tools: list[ToolSchema]) -> list[dict]:
        return [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["parameters"],
            }
            for t in tools
        ]

    def _to_anthropic_messages(
        self, messages: list[Message]
    ) -> tuple[str, list[dict]]:
        """Convert generic messages to Anthropic format.
        Returns (system_prompt, messages).
        """
        # Collect system messages and merge with base prompt
        system_parts = [load_base_system_prompt()]
        result: list[dict] = []
        for m in messages:
            role = m["role"]
            if role == "system":
                system_parts.append(m.get("content", ""))
                continue
            if role == "user":
                result.append({"role": "user", "content": m.get("content", "")})
            elif role == "assistant":
                content: list[dict] = []
                if m.get("content"):
                    content.append({"type": "text", "text": m["content"]})
                for tc in m.get("tool_calls", []):
                    content.append(
                        {
                            "type": "tool_use",
                            "id": tc["id"],
                            "name": tc["function"]["name"],
                            "input": json.loads(tc["function"]["arguments"]),
                        }
                    )
                result.append({"role": "assistant", "content": content})
            elif role == "tool":
                # Anthropic expects tool results as user turn
                result.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": m["tool_call_id"],
                                "content": m.get("content", ""),
                            }
                        ],
                    }
                )
        system_prompt = "\n\n".join(p for p in system_parts if p.strip())
        return system_prompt, result

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSchema],
    ) -> AsyncGenerator[LLMEvent, None]:
        system_prompt, anthropic_messages = self._to_anthropic_messages(messages)
        anthropic_tools = self._to_anthropic_tools(tools)

        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=4096,
                system=system_prompt,
                messages=anthropic_messages,
                tools=anthropic_tools if anthropic_tools else anthropic.NOT_GIVEN,
            ) as stream:
                tool_id: str = ""
                tool_name: str = ""
                tool_input_buf: str = ""
                in_tool: bool = False

                async for raw in stream:
                    event_type = raw.type

                    if event_type == "content_block_start":
                        block = raw.content_block
                        if block.type == "tool_use":
                            in_tool = True
                            tool_id = block.id
                            tool_name = block.name
                            tool_input_buf = ""

                    elif event_type == "content_block_delta":
                        delta = raw.delta
                        if delta.type == "text_delta":
                            yield LLMEvent(type=LLMEventType.TEXT_DELTA, delta=delta.text)
                        elif delta.type == "input_json_delta":
                            tool_input_buf += delta.partial_json

                    elif event_type == "content_block_stop":
                        if in_tool:
                            try:
                                parsed_input = json.loads(tool_input_buf) if tool_input_buf else {}
                            except json.JSONDecodeError:
                                parsed_input = {}
                            yield LLMEvent(
                                type=LLMEventType.TOOL_CALL,
                                tool_call=ToolCall(
                                    id=tool_id,
                                    name=tool_name,
                                    input=parsed_input,
                                ),
                            )
                            in_tool = False

                    elif event_type == "message_stop":
                        yield LLMEvent(type=LLMEventType.DONE)
                        return

        except anthropic.APIError as exc:
            logger.exception("Anthropic API error: %s", exc)
            yield LLMEvent(type=LLMEventType.ERROR, message=str(exc))
