"""BuildViewTool — maps ReportSchema to ViewBundle with chart axis enrichment."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from llm.base import LLMEventType, LLMProvider, Message, ToolSchema
from tools.base import Tool
from tools.build_report.schema import ChartBlock, ReportSchema

from .schema import BLOCK_COMPONENT_MAP, ViewBlockSpec, ViewBundle

logger = logging.getLogger(__name__)

_DESCRIPTION = (Path(__file__).parent / "description.md").read_text(encoding="utf-8").strip()

_AXIS_SYSTEM_PROMPT = """\
Given a chart's viz_hint and available column names, return a JSON object with \
the best x, y, and optional group_by column assignments.

Rules:
- Output ONLY valid JSON: {"x": "col", "y": "col" or ["col1","col2"], "group_by": "col" or null}
- No markdown fences, no commentary.
- x: categorical or time axis. y: numeric measure(s). group_by: optional grouping dimension.
"""


def _fallback_axis(viz_hint: str, col_names: list[str]) -> dict[str, Any]:
    """Heuristic axis assignment when no LLM is available."""
    if len(col_names) < 2 or viz_hint in ("number", "table"):
        return {}
    return {"x": col_names[0], "y": col_names[1]}


class BuildViewTool(Tool):
    """Deterministic ReportSchema → ViewBundle mapper with optional LLM chart enrichment."""

    def __init__(self, llm: LLMProvider | None = None) -> None:
        self._llm = llm

    @property
    def name(self) -> str:
        return "build_view"

    @property
    def description(self) -> str:
        return _DESCRIPTION

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "report_schema": {
                        "type": "object",
                        "description": "build_report 출력 ReportSchema dict",
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

        # Build ViewBlockSpec list
        view_blocks = [
            ViewBlockSpec(
                index=i,
                component=BLOCK_COMPONENT_MAP.get(block.type, "MarkdownBlock"),
            )
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
                {"role": "system", "content": _AXIS_SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(
                    {"viz_hint": viz_hint, "columns": col_names},
                    ensure_ascii=False,
                )},
            ]

            collected: list[str] = []
            async for event in self._llm.complete(messages, tools=[]):
                if event.type == LLMEventType.TEXT_DELTA:
                    collected.append(event.delta)
                elif event.type == LLMEventType.ERROR:
                    logger.warning("LLM error during axis inference: %s", event.message)
                    return _fallback_axis(viz_hint, col_names)

            raw = "".join(collected).strip()
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
