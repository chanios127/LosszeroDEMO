"""ReportGenerateTool — sub_agent that produces archival metadata for a ReportSchema.

Triggered when the user asks to *save* / *archive* / *retain* a report (vs.
just analyze it). Outputs ``{title, summary, domain, tags}`` for the proposal
card; main.py wires up the ``report_proposed`` SSE event and the
``_report_proposals`` store.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from llm.base import LLMEventType, LLMProvider, Message, ToolSchema
from prompts.loader import get_subagent_system
from tools.base import Tool
from tools.build_schema.schema import ReportSchema

from .schema import GeneratedReportMeta

logger = logging.getLogger(__name__)

# Strip qwen-style chain-of-thought blocks before json.loads.
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class ReportGenerateTool(Tool):
    """Sub-agent that derives title/summary/domain/tags from a ReportSchema."""

    def __init__(self, llm: LLMProvider | None = None) -> None:
        self._llm = llm
        self._llm_options: dict = {}

    def set_llm_options(self, **kwargs) -> None:
        """Receive llm options from AgentLoop; forwarded to provider.complete."""
        self._llm_options = {k: v for k, v in kwargs.items() if v is not None}

    @property
    def name(self) -> str:
        return "report_generate"

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "report_schema": {
                        "type": "object",
                        "description": "build_schema 출력 ReportSchema dict",
                    },
                    "user_intent": {
                        "type": "string",
                        "description": "원 사용자 질의 (도메인/태그 추론에 사용)",
                    },
                },
                "required": ["report_schema", "user_intent"],
            },
        }

    async def execute(self, input: dict[str, Any]) -> dict:
        if self._llm is None:
            raise RuntimeError(
                "ReportGenerateTool requires an LLMProvider. "
                "Set it via constructor or wait for AgentLoop registration."
            )

        report_dict: dict = input["report_schema"]
        user_intent: str = input["user_intent"]

        # Validate input upfront so we surface schema corruption before paying
        # for an LLM round-trip.
        ReportSchema.model_validate(report_dict)

        user_content = json.dumps({
            "report_schema": report_dict,
            "user_intent": user_intent,
        }, ensure_ascii=False, default=str)

        messages: list[Message] = [
            {"role": "system", "content": get_subagent_system("report_generate")},
            {"role": "user", "content": user_content},
        ]

        meta_dict = await self._call_llm(messages)
        try:
            meta = GeneratedReportMeta.model_validate(meta_dict)
            return meta.model_dump()
        except Exception as first_err:
            logger.warning("report_generate: first attempt validation failed: %s", first_err)

            messages.append({
                "role": "assistant",
                "content": json.dumps(meta_dict, ensure_ascii=False, default=str),
            })
            messages.append({
                "role": "user",
                "content": (
                    f"The previous JSON failed validation:\n{first_err}\n\n"
                    "Fix the issues and output corrected JSON only."
                ),
            })
            meta_dict = await self._call_llm(messages)
            try:
                meta = GeneratedReportMeta.model_validate(meta_dict)
                return meta.model_dump()
            except Exception as second_err:
                raise RuntimeError(
                    f"report_generate failed after 2 attempts. "
                    f"Last error: {second_err}"
                ) from second_err

    async def _call_llm(self, messages: list[Message]) -> dict:
        """Run the LLM and parse its JSON response."""
        assert self._llm is not None

        collected: list[str] = []
        async for event in self._llm.complete(messages, tools=[], **self._llm_options):
            if event.type == LLMEventType.TEXT_DELTA:
                collected.append(event.delta)
            elif event.type == LLMEventType.ERROR:
                raise RuntimeError(f"LLM error during report_generate: {event.message}")

        raw = "".join(collected).strip()
        raw = _THINK_RE.sub("", raw).strip()
        if "<think>" in raw or "</think>" in raw:
            raw = raw.replace("<think>", "").replace("</think>", "").strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            if lines[-1].strip() == "```":
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            raw = "\n".join(lines).strip()

        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"LLM returned invalid JSON: {e}\nRaw output (first 500 chars): {raw[:500]}"
            ) from e
