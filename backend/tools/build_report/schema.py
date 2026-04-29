"""ReportSchema pydantic models — 1:1 mirror of frontend/src/design/types/report.ts."""
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
# ReportBlock discriminated union
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


ReportBlock = Annotated[
    Union[MarkdownBlock, MetricBlock, ChartBlock, HighlightBlock],
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
        """Ensure chart.data_ref and highlight.related_data point to valid data_refs indices."""
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
