"""BuildViewTool — maps ReportSchema to ViewBundle with chart axis enrichment."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from llm.base import LLMEventType, LLMProvider, Message, ToolSchema
from prompts.loader import get_subagent_system
from tools.base import Tool
from tools.build_schema.schema import ChartBlock, ReportSchema

from .schema import ViewBlockSpec, ViewBundle, resolve_component

logger = logging.getLogger(__name__)

# Strip qwen-style <think>...</think> reasoning blocks before json.loads.
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _fallback_axis(viz_hint: str, col_names: list[str]) -> dict[str, Any]:
    """Heuristic axis assignment when no LLM is available."""
    if len(col_names) < 2 or viz_hint in ("number", "table"):
        return {}
    return {"x": col_names[0], "y": col_names[1]}


class BuildViewTool(Tool):
    """Deterministic ReportSchema → ViewBundle mapper with optional LLM chart enrichment."""

    def __init__(self, llm: LLMProvider | None = None) -> None:
        self._llm = llm
        self._llm_options: dict = {}

    def set_llm_options(self, **kwargs) -> None:
        """Receive llm options from AgentLoop; forwarded to provider.complete."""
        self._llm_options = {k: v for k, v in kwargs.items() if v is not None}

    @property
    def name(self) -> str:
        return "build_view"

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
                },
                "required": ["report_schema"],
            },
        }

    async def execute(self, input: dict[str, Any]) -> dict:
        report = ReportSchema.model_validate(input["report_schema"])

        # Enrich chart blocks with x/y if missing
        for block in report.blocks:
            if not isinstance(block, ChartBlock):
                continue
            if block.x is not None and block.y is not None:
                continue

            # Get columns from referenced data_ref
            ref_idx = block.data_ref
            if ref_idx < 0 or ref_idx >= len(report.data_refs):
                continue
            ref = report.data_refs[ref_idx]
            col_names = [c.name for c in ref.columns]
            if not col_names:
                continue

            axis = await self._infer_axis(block.viz_hint, col_names)
            if "x" in axis and block.x is None:
                block.x = axis["x"]
            if "y" in axis and block.y is None:
                block.y = axis["y"]
            if "group_by" in axis and axis["group_by"] and block.group_by is None:
                block.group_by = axis["group_by"]

        # Build ViewBlockSpec list — chart.viz_hint=gantt/radar route to
        # dedicated components; other block types use the static map.
        view_blocks = [
            ViewBlockSpec(index=i, component=resolve_component(block))
            for i, block in enumerate(report.blocks)
        ]

        bundle = ViewBundle(schema_=report, blocks=view_blocks)
        return bundle.model_dump(by_alias=True)

    async def _infer_axis(self, viz_hint: str, col_names: list[str]) -> dict[str, Any]:
        """Infer x/y/group_by via LLM or fallback heuristic."""
        if self._llm is None:
            return _fallback_axis(viz_hint, col_names)

        try:
            messages: list[Message] = [
                {"role": "system", "content": get_subagent_system("build_view")},
                {"role": "user", "content": json.dumps(
                    {"viz_hint": viz_hint, "columns": col_names},
                    ensure_ascii=False,
                )},
            ]

            collected: list[str] = []
            async for event in self._llm.complete(messages, tools=[], **self._llm_options):
                if event.type == LLMEventType.TEXT_DELTA:
                    collected.append(event.delta)
                elif event.type == LLMEventType.ERROR:
                    logger.warning("LLM error during axis inference: %s", event.message)
                    return _fallback_axis(viz_hint, col_names)

            raw = "".join(collected).strip()
            # Strip reasoning blocks before parse
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

            return json.loads(raw)
        except Exception as exc:
            logger.warning("Axis inference failed, using fallback: %s", exc)
            return _fallback_axis(viz_hint, col_names)
