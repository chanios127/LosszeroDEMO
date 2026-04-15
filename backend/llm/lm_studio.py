"""LMStudioProvider — LM Studio via OpenAI-compatible API with tool-call fallback."""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import AsyncGenerator

import httpx

from llm.base import LLMEvent, LLMEventType, LLMProvider, Message, ToolCall, ToolSchema

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a manufacturing ERP data assistant. You help users query production, \
inventory, and work-order data from a MSSQL database by selecting appropriate \
stored procedures or running read-only SELECT queries.

Rules:
- Always use the provided tools to retrieve data before answering.
- Never fabricate data. If a tool fails, report the error honestly.
- After retrieving data, summarize findings concisely in Korean or English \
  matching the user's language.
- If the user's intent is ambiguous, ask one clarifying question.
- When writing SQL, wrap it in <execute_sql>SQL_HERE</execute_sql> tags.

Visualization:
- The frontend automatically renders charts/tables from tool results (db_query, sp_call).
- When the user asks for a graph/chart/visualization, you MUST re-query the data \
  using db_query or sp_call, even if you showed the same data before. \
  The frontend only visualizes data returned in the current response.
- Do NOT draw ASCII charts or markdown tables as a substitute for actual data queries.
- Supported viz types: bar_chart, line_chart, pie_chart, table, number \
  (auto-detected from result shape).
"""

_SQL_TAG_RE = re.compile(
    r"<execute_sql>\s*(.*?)\s*</execute_sql>", re.DOTALL | re.IGNORECASE
)


class LMStudioProvider(LLMProvider):
    """
    Connects to LM Studio's OpenAI-compatible endpoint.
    Supports native tool calling; falls back to tag-based SQL extraction
    when the loaded model returns HTTP 400 for tool_use requests.
    """

    def __init__(
        self,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.model = model or os.environ.get("LM_STUDIO_MODEL", "")
        self.base_url = (
            base_url or os.environ.get("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")
        ).rstrip("/")
        self.api_key = api_key or os.environ.get("LM_STUDIO_API_KEY", "lm-studio")
        self._client = httpx.AsyncClient(
            timeout=120.0,
            headers={"Authorization": f"Bearer {self.api_key}"},
        )

    def _to_openai_messages(self, messages: list[Message]) -> list[dict]:
        # Merge base system prompt with any injected system messages
        system_parts = [_SYSTEM_PROMPT]
        result: list[dict] = []
        for m in messages:
            role = m["role"]
            if role == "system":
                system_parts.append(m.get("content", ""))
                continue
            if role == "user":
                result.append({"role": "user", "content": m.get("content", "")})
            elif role == "assistant":
                msg: dict = {"role": "assistant", "content": m.get("content", "")}
                if m.get("tool_calls"):
                    msg["tool_calls"] = m["tool_calls"]
                result.append(msg)
            elif role == "tool":
                result.append(
                    {
                        "role": "tool",
                        "tool_call_id": m.get("tool_call_id", ""),
                        "content": m.get("content", ""),
                    }
                )
        # Prepend merged system message
        system_text = "\n\n".join(p for p in system_parts if p.strip())
        result.insert(0, {"role": "system", "content": system_text})
        return result

    def _to_openai_tools(self, tools: list[ToolSchema]) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in tools
        ]

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSchema],
    ) -> AsyncGenerator[LLMEvent, None]:
        payload: dict = {
            "messages": self._to_openai_messages(messages),
            "stream": True,
        }
        if self.model:
            payload["model"] = self.model
        if tools:
            payload["tools"] = self._to_openai_tools(tools)
            payload["tool_choice"] = "auto"

        url = f"{self.base_url}/chat/completions"

        try:
            async with self._client.stream("POST", url, json=payload) as resp:
                if resp.status_code == 400 and tools:
                    # Model doesn't support tool calling — use tag-based fallback
                    await resp.aclose()
                    async for event in self._complete_without_tools(messages):
                        yield event
                    return

                resp.raise_for_status()

                tool_calls_buf: dict[int, dict] = {}

                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:]
                    if raw.strip() == "[DONE]":
                        break

                    try:
                        chunk = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    choice = chunk.get("choices", [{}])[0]
                    delta = choice.get("delta", {})
                    finish_reason = choice.get("finish_reason")

                    # Text delta
                    if delta.get("content"):
                        yield LLMEvent(
                            type=LLMEventType.TEXT_DELTA, delta=delta["content"]
                        )

                    # Tool call accumulation
                    for tc_delta in delta.get("tool_calls", []):
                        idx = tc_delta.get("index", 0)
                        if idx not in tool_calls_buf:
                            tool_calls_buf[idx] = {
                                "id": tc_delta.get("id", str(uuid.uuid4())),
                                "name": "",
                                "arguments": "",
                            }
                        buf = tool_calls_buf[idx]
                        fn = tc_delta.get("function", {})
                        if fn.get("name"):
                            buf["name"] += fn["name"]
                        if fn.get("arguments"):
                            buf["arguments"] += fn["arguments"]

                    if finish_reason in ("tool_calls", "stop"):
                        for buf in tool_calls_buf.values():
                            try:
                                parsed = (
                                    json.loads(buf["arguments"])
                                    if buf["arguments"]
                                    else {}
                                )
                            except json.JSONDecodeError:
                                parsed = {}
                            yield LLMEvent(
                                type=LLMEventType.TOOL_CALL,
                                tool_call=ToolCall(
                                    id=buf["id"],
                                    name=buf["name"],
                                    input=parsed,
                                ),
                            )

                yield LLMEvent(type=LLMEventType.DONE)

        except httpx.HTTPError as exc:
            logger.exception("LM Studio HTTP error: %s", exc)
            yield LLMEvent(type=LLMEventType.ERROR, message=str(exc))

    async def _complete_without_tools(
        self, messages: list[Message]
    ) -> AsyncGenerator[LLMEvent, None]:
        """Fallback: send without tools, extract SQL from <execute_sql> tags."""
        payload: dict = {
            "messages": self._to_openai_messages(messages),
            "stream": False,
        }
        if self.model:
            payload["model"] = self.model

        url = f"{self.base_url}/chat/completions"
        logger.info("LM Studio fallback: re-sending without tools")

        try:
            resp = await self._client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

            # Try to extract SQL from tags
            match = _SQL_TAG_RE.search(content)
            if match:
                sql = match.group(1).strip()
                yield LLMEvent(
                    type=LLMEventType.TEXT_DELTA,
                    delta=content[: match.start()],
                )
                yield LLMEvent(
                    type=LLMEventType.TOOL_CALL,
                    tool_call=ToolCall(
                        id=str(uuid.uuid4()),
                        name="db_query",
                        input={"sql": sql},
                    ),
                )
            else:
                yield LLMEvent(type=LLMEventType.TEXT_DELTA, delta=content)

            yield LLMEvent(type=LLMEventType.DONE)

        except httpx.HTTPError as exc:
            logger.exception("LM Studio fallback error: %s", exc)
            yield LLMEvent(type=LLMEventType.ERROR, message=str(exc))
