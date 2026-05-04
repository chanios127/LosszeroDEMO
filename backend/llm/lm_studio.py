"""LMStudioProvider — LM Studio via OpenAI-compatible API with tool-call fallback."""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import AsyncGenerator

import httpx

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

# Appended only when native tool-calling fails and we fall back to tag extraction.
_FALLBACK_TAG_INSTRUCTION = (
    "\n\n## Fallback mode (no native tools)\n"
    "This model does not support native tool calling. "
    "When you need to query data, wrap the SQL in <execute_sql>SQL_HERE</execute_sql> tags. "
    "The server will extract and execute the first tagged SELECT statement."
)

_SQL_TAG_RE = re.compile(
    r"<execute_sql>\s*(.*?)\s*</execute_sql>", re.DOTALL | re.IGNORECASE
)


class _HarmonyTransformer:
    """Streaming transformer: convert Harmony-style channel markers to <think>...</think>.

    Different reasoning models emit different markers around chain-of-thought.
    We normalize them to the standard `<think>...</think>` form so that both
    the terminal parser (main.py) and the frontend's existing think-block UI
    can treat them uniformly.

    Streaming-safe: the transformer holds back partial-marker tails across
    chunk boundaries so a marker split across two deltas isn't emitted half-formed.
    """

    OPEN_MARKERS: tuple[str, ...] = (
        "<|channel|>thought",
        "<|channel|>analysis",
        "<|channel|>commentary",
        "<|channel>thought",
        "<|channel>analysis",
        "<|channel>commentary",
    )
    CLOSE_MARKERS: tuple[str, ...] = (
        "<channel|>",            # observed bare-separator variant
        "<|channel|>final",
        "<|channel>final",
        "<|end|>",
        "</think>",              # passthrough — already standard
    )
    HOLDBACK = max(len(m) for m in OPEN_MARKERS + CLOSE_MARKERS)

    def __init__(self) -> None:
        self._buf = ""
        self._in_think = False

    @staticmethod
    def _find_first(buf: str, markers: tuple[str, ...]) -> tuple[int, str]:
        best_idx, best_marker = -1, ""
        for m in markers:
            i = buf.find(m)
            if i != -1 and (best_idx == -1 or i < best_idx):
                best_idx, best_marker = i, m
        return best_idx, best_marker

    def feed(self, chunk: str) -> str:
        """Append chunk; return text safe to emit (with markers normalized)."""
        self._buf += chunk
        out: list[str] = []
        while True:
            if not self._in_think:
                idx, marker = self._find_first(self._buf, self.OPEN_MARKERS)
                if idx == -1:
                    # No open marker — hold back enough tail to cover a partial marker
                    safe = max(0, len(self._buf) - self.HOLDBACK + 1)
                    if safe > 0:
                        out.append(self._buf[:safe])
                        self._buf = self._buf[safe:]
                    break
                if idx > 0:
                    out.append(self._buf[:idx])
                out.append("<think>")
                self._buf = self._buf[idx + len(marker):]
                self._in_think = True
            else:
                idx, marker = self._find_first(self._buf, self.CLOSE_MARKERS)
                if idx == -1:
                    safe = max(0, len(self._buf) - self.HOLDBACK + 1)
                    if safe > 0:
                        out.append(self._buf[:safe])
                        self._buf = self._buf[safe:]
                    break
                if idx > 0:
                    out.append(self._buf[:idx])
                # If the marker is </think>, keep it; otherwise normalize to </think>
                out.append("</think>" if marker != "</think>" else "</think>")
                self._buf = self._buf[idx + len(marker):]
                self._in_think = False
        return "".join(out)

    def flush(self) -> str:
        """Drain any held-back text at stream end. Closes an open think block."""
        out = self._buf
        if self._in_think:
            out += "</think>"
            self._in_think = False
        self._buf = ""
        return out


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
        # Per-phase httpx timeout: long `read` covers reasoning models that
        # spend tens of seconds inside <think> before emitting any token (A3).
        # Connect/write/pool stay short to surface dead-server cases quickly.
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                connect=float(os.environ.get("LM_STUDIO_TIMEOUT_CONNECT", "10")),
                read=float(os.environ.get("LM_STUDIO_TIMEOUT_READ", "600")),
                write=30.0,
                pool=30.0,
            ),
            headers={"Authorization": f"Bearer {self.api_key}"},
        )

    def _to_openai_messages(
        self, messages: list[Message], *, system_base: bool = True
    ) -> list[dict]:
        # Merge base system prompt (skip when system_base=False) + injected system messages
        system_parts: list[str] = []
        if system_base:
            system_parts.append(load_base_system_prompt())
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
        # Prepend merged system message (only if non-empty)
        system_text = "\n\n".join(p for p in system_parts if p.strip())
        if system_text:
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
        *,
        max_tokens: int | None = None,
        thinking_enabled: bool | None = None,
        thinking_budget: int | None = None,
        system_base: bool = True,
    ) -> AsyncGenerator[LLMEvent, None]:
        if thinking_enabled:
            logger.warning(
                "LM Studio does not support extended thinking; option ignored"
            )

        openai_messages = self._to_openai_messages(messages, system_base=system_base)
        payload: dict = {
            "messages": openai_messages,
            "stream": True,
            "max_tokens": max_tokens or int(
                os.environ.get("LM_STUDIO_MAX_TOKENS", "10000")
            ),
        }
        if self.model:
            payload["model"] = self.model
        if tools:
            payload["tools"] = self._to_openai_tools(tools)
            payload["tool_choice"] = "auto"

        url = f"{self.base_url}/chat/completions"

        sys_len = (
            len(openai_messages[0].get("content", ""))
            if openai_messages and openai_messages[0].get("role") == "system"
            else 0
        )
        logger.info(
            "LM Studio request: model=%r messages=%d tools=%d system_len=%d",
            self.model or "(unset)",
            len(openai_messages),
            len(tools or []),
            sys_len,
        )

        chunk_count = 0
        text_delta_count = 0
        tool_call_emit_count = 0
        transformer = _HarmonyTransformer()

        try:
            async with self._client.stream("POST", url, json=payload) as resp:
                if resp.status_code == 400 and tools:
                    # Model doesn't support tool calling — use tag-based fallback
                    await resp.aclose()
                    async for event in self._complete_without_tools(
                        messages,
                        max_tokens=max_tokens,
                    ):
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
                    chunk_count += 1

                    choice = chunk.get("choices", [{}])[0]
                    delta = choice.get("delta", {})
                    finish_reason = choice.get("finish_reason")

                    # Text delta — normalize Harmony channel markers to <think>...</think>
                    if delta.get("content"):
                        normalized = transformer.feed(delta["content"])
                        if normalized:
                            text_delta_count += 1
                            yield LLMEvent(
                                type=LLMEventType.TEXT_DELTA, delta=normalized
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
                            tool_call_emit_count += 1
                            yield LLMEvent(
                                type=LLMEventType.TOOL_CALL,
                                tool_call=ToolCall(
                                    id=buf["id"],
                                    name=buf["name"],
                                    input=parsed,
                                ),
                            )

                # Drain transformer buffer (closes any open think block)
                tail = transformer.flush()
                if tail:
                    text_delta_count += 1
                    yield LLMEvent(type=LLMEventType.TEXT_DELTA, delta=tail)

                if text_delta_count == 0 and tool_call_emit_count == 0:
                    logger.warning(
                        "LM Studio stream ended with no content: chunks=%d, "
                        "text_deltas=0, tool_calls=0 (model=%r)",
                        chunk_count, self.model or "(unset)",
                    )
                yield LLMEvent(type=LLMEventType.DONE)

        except httpx.HTTPError as exc:
            logger.exception("LM Studio HTTP error: %s", exc)
            yield LLMEvent(type=LLMEventType.ERROR, message=str(exc))
        except Exception as exc:
            logger.exception("LMStudioProvider unexpected error: %s", exc)
            yield LLMEvent(
                type=LLMEventType.ERROR,
                message=f"{type(exc).__name__}: {exc}",
            )

    async def _complete_without_tools(
        self,
        messages: list[Message],
        *,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[LLMEvent, None]:
        """Fallback: send without tools, extract SQL from <execute_sql> tags."""
        openai_messages = self._to_openai_messages(messages)
        # Append fallback-mode instruction onto the system message
        if openai_messages and openai_messages[0].get("role") == "system":
            openai_messages[0]["content"] += _FALLBACK_TAG_INSTRUCTION
        payload: dict = {
            "messages": openai_messages,
            "stream": False,
            "max_tokens": max_tokens or int(
                os.environ.get("LM_STUDIO_MAX_TOKENS", "10000")
            ),
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

            if not content:
                logger.warning(
                    "LM Studio fallback returned empty content (model=%r)",
                    self.model or "(unset)",
                )

            # Normalize Harmony channel markers (single-shot — feed all + flush)
            transformer = _HarmonyTransformer()
            content = transformer.feed(content) + transformer.flush()

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
        except Exception as exc:
            logger.exception("LM Studio fallback unexpected error: %s", exc)
            yield LLMEvent(
                type=LLMEventType.ERROR,
                message=f"{type(exc).__name__}: {exc}",
            )
