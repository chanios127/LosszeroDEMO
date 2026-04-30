"""BuildSchemaTool — generates a structured ReportSchema from query results via LLM."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from llm.base import LLMEvent, LLMEventType, LLMProvider, Message, ToolSchema
from prompts.loader import get_subagent_system
from tools.base import Tool

from .schema import ReportSchema

logger = logging.getLogger(__name__)

# Threshold for switching from embed to ref mode
_EMBED_MAX_ROWS = 1000
_EMBED_MAX_BYTES = 100_000  # ~100 KB

# Reasoning model chain-of-thought marker (qwen-style). Some LM Studio models emit
# `<think>...</think>` blocks before the actual JSON payload despite system prompt
# instructions. Strip defensively before json.loads.
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _build_data_refs(data_results: list[dict]) -> list[dict]:
    """Convert data_results input into data_refs array (embed mode only for 9.2)."""
    refs = []
    for i, dr in enumerate(data_results):
        rows = dr.get("rows", [])
        columns = dr.get("columns", [])

        # Infer columns from row keys if not provided
        if not columns and rows:
            columns = [{"name": k} for k in rows[0].keys()]

        refs.append({
            "id": i,
            "mode": "embed",
            "rows": rows,
            "columns": columns,
        })
    return refs


def _estimate_size(data_refs: list[dict]) -> tuple[int, int]:
    """Return (total_rows, estimated_bytes) across all refs."""
    total_rows = sum(len(r.get("rows", [])) for r in data_refs)
    try:
        estimated_bytes = len(json.dumps(data_refs, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError):
        estimated_bytes = 0
    return total_rows, estimated_bytes


def _truncate_data_results(
    data_results: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Cap per-cell text length and per-result row count before LLM ingestion.

    Returns (truncated_results, sampling_meta). Sampling_meta is one entry per
    data_results item, recording original/kept row counts and whether cells
    were truncated. Long-text columns inflate the LLM prompt with no useful
    signal — capping them keeps build_schema inside the model's context budget
    and prevents max_tokens-induced JSON cutoffs (D6).
    """
    max_chars = int(os.environ.get("BUILD_REPORT_MAX_CELL_CHARS", "200"))
    max_rows = int(os.environ.get("BUILD_REPORT_MAX_ROWS", "30"))

    truncated_results: list[dict] = []
    sampling_meta: list[dict] = []

    for idx, dr in enumerate(data_results):
        rows = dr.get("rows", []) or []
        columns = dr.get("columns", [])
        original_n = len(rows)
        kept_rows = rows[:max_rows]

        cell_truncations = 0
        new_rows: list[dict] = []
        for row in kept_rows:
            if not isinstance(row, dict):
                new_rows.append(row)
                continue
            new_row: dict = {}
            for k, v in row.items():
                if isinstance(v, str) and len(v) > max_chars:
                    new_row[k] = (
                        v[:max_chars]
                        + f"...(truncated, {len(v)} chars)"
                    )
                    cell_truncations += 1
                else:
                    new_row[k] = v
            new_rows.append(new_row)

        truncated_results.append({"rows": new_rows, "columns": columns})
        sampling_meta.append({
            "ref_id": idx,
            "original_n": original_n,
            "kept": len(new_rows),
            "row_truncated": original_n > len(new_rows),
            "cell_truncations": cell_truncations,
            "max_cell_chars": max_chars,
            "max_rows": max_rows,
        })

    return truncated_results, sampling_meta


class BuildSchemaTool(Tool):
    """Tool that generates a ReportSchema from query results via internal LLM call."""

    def __init__(self, llm: LLMProvider | None = None) -> None:
        self._llm = llm
        self._llm_options: dict = {}

    def set_llm_options(self, **kwargs) -> None:
        """Receive llm options from AgentLoop; forwarded to provider.complete."""
        self._llm_options = {k: v for k, v in kwargs.items() if v is not None}

    @property
    def name(self) -> str:
        return "build_schema"

    def schema(self) -> ToolSchema:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": {
                    "user_intent": {
                        "type": "string",
                        "description": "원 사용자 질의 echo (보고서 의도 명시)",
                    },
                    "data_results": {
                        "type": "array",
                        "description": "직전 도구 출력의 rows + columns 배열 (1개 이상)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "rows": {"type": "array"},
                                "columns": {
                                    "type": "array",
                                    "items": {"type": "object"},
                                },
                            },
                            "required": ["rows", "columns"],
                        },
                    },
                },
                "required": ["user_intent", "data_results"],
            },
        }

    async def execute(self, input: dict[str, Any]) -> dict:
        if self._llm is None:
            raise RuntimeError(
                "BuildSchemaTool requires an LLMProvider. "
                "Set it via constructor or wait for AgentLoop registration (9.4)."
            )

        user_intent: str = input["user_intent"]
        data_results: list[dict] = input["data_results"]

        # Cap cell length + row count BEFORE building data_refs so the LLM
        # never sees raw long-text columns or oversized samples (A).
        truncated_results, sampling_meta = _truncate_data_results(data_results)
        if any(m["row_truncated"] or m["cell_truncations"] for m in sampling_meta):
            logger.info("build_schema: input truncated — %s", sampling_meta)

        # Build data_refs from truncated input
        data_refs = _build_data_refs(truncated_results)
        total_rows, est_bytes = _estimate_size(data_refs)
        logger.info(
            "build_schema: %d data_results, %d total rows, ~%d bytes",
            len(data_results), total_rows, est_bytes,
        )

        # Construct LLM prompt
        user_content = json.dumps({
            "user_intent": user_intent,
            "data_refs": data_refs,
            "sampling_meta": sampling_meta,
        }, ensure_ascii=False, default=str)

        messages: list[Message] = [
            {"role": "system", "content": get_subagent_system("build_schema")},
            {"role": "user", "content": user_content},
        ]

        # Attempt 1
        report_dict = await self._call_llm_for_report(messages)

        # Validate with pydantic
        try:
            report = ReportSchema.model_validate(report_dict)
            return report.model_dump()
        except Exception as first_err:
            logger.warning("build_schema: first attempt validation failed: %s", first_err)

            # Attempt 2: retry with error context
            messages.append({
                "role": "assistant",
                "content": json.dumps(report_dict, ensure_ascii=False, default=str),
            })
            messages.append({
                "role": "user",
                "content": (
                    f"The previous JSON failed validation:\n{first_err}\n\n"
                    "Fix the issues and output corrected JSON only."
                ),
            })

            report_dict = await self._call_llm_for_report(messages)
            try:
                report = ReportSchema.model_validate(report_dict)
                return report.model_dump()
            except Exception as second_err:
                raise RuntimeError(
                    f"build_schema failed after 2 attempts. "
                    f"Last error: {second_err}"
                ) from second_err

    async def _call_llm_for_report(self, messages: list[Message]) -> dict:
        """Call LLM and extract JSON dict from response."""
        assert self._llm is not None

        collected: list[str] = []
        async for event in self._llm.complete(messages, tools=[], **self._llm_options):
            if event.type == LLMEventType.TEXT_DELTA:
                collected.append(event.delta)
            elif event.type == LLMEventType.ERROR:
                raise RuntimeError(f"LLM error during build_schema: {event.message}")

        raw = "".join(collected).strip()

        # Strip <think>...</think> reasoning blocks (qwen-style)
        raw = _THINK_RE.sub("", raw).strip()
        # Some models leave dangling unclosed <think> at the start — drop until
        # the first JSON-looking character.
        if raw.startswith("<think>") and "</think>" not in raw:
            # Unclosed think block — give up on inline parse, keep raw as-is so
            # the retry path captures it in error context.
            pass
        elif "<think>" in raw or "</think>" in raw:
            # Asymmetric residue — strip any remaining tags conservatively.
            raw = raw.replace("<think>", "").replace("</think>", "").strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            # Remove first line (```json) and last line (```)
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
