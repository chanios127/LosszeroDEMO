"""ReportSchema pydantic models — 1:1 mirror of frontend/src/design/types/report.ts.

Cycle 2 Phase B — extended to 7 block types:
- 4 legacy: markdown / metric / chart / highlight (signatures locked since Phase 9)
- 3 new: bubble_breakdown / kpi_grid / ranked_list
"""
from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, model_validator

from agent.events import VizHint


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

class Summary(BaseModel):
    headline: str
    insights: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Shared severity + nested models for new blocks
# ---------------------------------------------------------------------------

Severity = Literal["good", "neutral", "warning", "alert"]


class KpiMetric(BaseModel):
    """Single cell in a KpiGridBlock."""
    label: str
    value: int | float | str
    delta: str | None = None
    trend: Literal["up", "down", "flat"] | None = None
    unit: str | None = None
    severity: Severity | None = None


class BubbleCard(BaseModel):
    """Optional summary card alongside a bubble breakdown."""
    title: str
    primary: str | int | float
    secondary: str | None = None
    tags: list[str] | None = None
    color_dot: str | None = None


class BubbleField(BaseModel):
    """Column-name mapping that tells BubbleBreakdownBlock how to read data_ref rows."""
    label: str
    size: str
    x: str
    color: str | None = None


class RankedField(BaseModel):
    """Column-name mapping that tells RankedListBlock how to read data_ref rows."""
    name: str
    primary: str
    secondary: str | None = None
    tags: str | None = None
    color_dot: str | None = None


# ---------------------------------------------------------------------------
# ReportBlock discriminated union (7 types)
# ---------------------------------------------------------------------------

class MarkdownBlock(BaseModel):
    type: Literal["markdown"]
    content: str


class MetricBlock(BaseModel):
    type: Literal["metric"]
    label: str
    value: int | float | str
    delta: str | None = None
    trend: Literal["up", "down", "flat"] | None = None
    unit: str | None = None


class ChartBlock(BaseModel):
    type: Literal["chart"]
    viz_hint: VizHint
    data_ref: int  # index into ReportSchema.data_refs[]
    x: str | None = None
    y: str | list[str] | None = None
    group_by: str | None = None
    title: str | None = None


class HighlightBlock(BaseModel):
    type: Literal["highlight"]
    level: Literal["info", "warning", "alert"]
    message: str
    related_data: int | None = None


class BubbleBreakdownBlock(BaseModel):
    type: Literal["bubble_breakdown"]
    title: str | None = None
    data_ref: int
    bubble: BubbleField
    cards: list[BubbleCard] | None = None
    layout: Literal["row", "stack"] = "row"


class KpiGridBlock(BaseModel):
    type: Literal["kpi_grid"]
    title: str | None = None
    columns: Literal[2, 3, 4] | None = None
    metrics: list[KpiMetric]


class RankedListBlock(BaseModel):
    type: Literal["ranked_list"]
    title: str | None = None
    data_ref: int
    fields: RankedField
    limit: int | None = None
    highlight_top: int | None = None
    subtitle: str | None = None


ReportBlock = Annotated[
    Union[
        MarkdownBlock, MetricBlock, ChartBlock, HighlightBlock,
        BubbleBreakdownBlock, KpiGridBlock, RankedListBlock,
    ],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------
# DataRef discriminated union
# ---------------------------------------------------------------------------

class ColumnSpec(BaseModel):
    name: str
    type: str | None = None


class DataRefEmbed(BaseModel):
    id: int
    mode: Literal["embed"]
    rows: list[dict]
    columns: list[ColumnSpec]


class DataRefRef(BaseModel):
    id: int
    mode: Literal["ref"]
    ref_id: str
    columns: list[ColumnSpec]
    row_count: int


DataRef = Annotated[
    Union[DataRefEmbed, DataRefRef],
    Field(discriminator="mode"),
]


# ---------------------------------------------------------------------------
# Top-level schema
# ---------------------------------------------------------------------------

class ReportSchema(BaseModel):
    title: str
    generated_from: str
    summary: Summary
    blocks: list[ReportBlock]
    data_refs: list[DataRef]

    @model_validator(mode="after")
    def _validate_data_ref_indices(self) -> "ReportSchema":
        """Ensure data_ref / related_data indices on every block point inside data_refs.

        Covers chart / bubble_breakdown / ranked_list (data_ref) and
        highlight (related_data). hasattr() lets new block types opt in
        automatically without touching this validator.
        """
        n = len(self.data_refs)
        for i, block in enumerate(self.blocks):
            if hasattr(block, "data_ref") and block.data_ref is not None:
                if block.data_ref < 0 or block.data_ref >= n:
                    raise ValueError(
                        f"blocks[{i}].data_ref={block.data_ref} is out of range "
                        f"(data_refs has {n} entries)"
                    )
            if hasattr(block, "related_data") and block.related_data is not None:
                if block.related_data < 0 or block.related_data >= n:
                    raise ValueError(
                        f"blocks[{i}].related_data={block.related_data} is out of range "
                        f"(data_refs has {n} entries)"
                    )
        return self
