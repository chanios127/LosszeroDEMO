"""ViewBundle pydantic model — enriched ReportSchema + component routing.

Cycle 2 Phase B — extended to 9 components: 4 legacy + 3 new block components
+ 2 chart-viz_hint variants (Gantt/Radar). Mirrors
frontend/src/design/types/view.ts ViewBlockComponent.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from tools.build_schema.schema import ReportBlock, ReportSchema


ViewBlockComponent = Literal[
    "MarkdownBlock", "MetricCard", "ChartBlock", "HighlightCard",
    "BubbleBreakdownBlock", "KpiGridBlock", "RankedListBlock",
    "GanttBlock", "RadarBlock",
]


# Direct block-type → component mapping for non-chart types.
BLOCK_COMPONENT_MAP: dict[str, str] = {
    "markdown": "MarkdownBlock",
    "metric": "MetricCard",
    "chart": "ChartBlock",  # default; refined by viz_hint via resolve_component()
    "highlight": "HighlightCard",
    "bubble_breakdown": "BubbleBreakdownBlock",
    "kpi_grid": "KpiGridBlock",
    "ranked_list": "RankedListBlock",
}

# chart.viz_hint → dedicated component override.
CHART_VIZ_HINT_COMPONENT: dict[str, str] = {
    "gantt": "GanttBlock",
    "radar": "RadarBlock",
}


def resolve_component(block: ReportBlock) -> str:
    """Pick the frontend component for a given ReportBlock.

    Charts dispatch by viz_hint (gantt/radar → dedicated components,
    everything else → ChartBlock). All other block types use the static
    BLOCK_COMPONENT_MAP. Unknown block types fall back to MarkdownBlock so
    the frontend at least shows raw content rather than crashing.
    """
    if block.type == "chart":
        return CHART_VIZ_HINT_COMPONENT.get(block.viz_hint, "ChartBlock")
    return BLOCK_COMPONENT_MAP.get(block.type, "MarkdownBlock")


class ViewBlockSpec(BaseModel):
    index: int
    component: ViewBlockComponent


class ViewBundle(BaseModel):
    schema_: ReportSchema = Field(alias="schema")
    blocks: list[ViewBlockSpec]

    model_config = ConfigDict(populate_by_name=True)
