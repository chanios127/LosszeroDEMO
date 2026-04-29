"""ViewBundle pydantic model — enriched ReportSchema + component routing."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from tools.build_report.schema import ReportSchema


# Block type → frontend component mapping
BLOCK_COMPONENT_MAP: dict[str, str] = {
    "markdown": "MarkdownBlock",
    "metric": "MetricCard",
    "chart": "ChartBlock",
    "highlight": "HighlightCard",
}


class ViewBlockSpec(BaseModel):
    index: int
    component: Literal["MarkdownBlock", "MetricCard", "ChartBlock", "HighlightCard"]


class ViewBundle(BaseModel):
    schema_: ReportSchema = Field(alias="schema")
    blocks: list[ViewBlockSpec]

    model_config = ConfigDict(populate_by_name=True)
