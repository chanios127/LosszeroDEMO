"""SSE event type definitions for the agent loop."""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class EventType(str, Enum):
    TOOL_START = "tool_start"
    TOOL_RESULT = "tool_result"
    LLM_CHUNK = "llm_chunk"
    FINAL = "final"
    ERROR = "error"
    CONTINUE_PROMPT = "continue_prompt"
    SUBAGENT_START = "subagent_start"
    SUBAGENT_PROGRESS = "subagent_progress"
    SUBAGENT_COMPLETE = "subagent_complete"
    REPORT_PROPOSED = "report_proposed"


# Cycle 2 Phase B — extended to 7 viz hints. gantt/radar are routed by
# build_view to dedicated GanttBlock/RadarBlock components on the frontend.
VizHint = Literal[
    "bar_chart", "line_chart", "pie_chart", "table", "number",
    "gantt", "radar",
]


class ToolStartEvent(BaseModel):
    type: Literal[EventType.TOOL_START] = EventType.TOOL_START
    tool: str
    input: dict[str, Any]
    turn: int


class ToolResultEvent(BaseModel):
    type: Literal[EventType.TOOL_RESULT] = EventType.TOOL_RESULT
    tool: str
    rows: int | None = None
    output: Any
    turn: int
    error: str | None = None


class LLMChunkEvent(BaseModel):
    type: Literal[EventType.LLM_CHUNK] = EventType.LLM_CHUNK
    delta: str


class FinalEvent(BaseModel):
    type: Literal[EventType.FINAL] = EventType.FINAL
    answer: str
    viz_hint: VizHint
    data: list[dict[str, Any]] | None = None


class ErrorEvent(BaseModel):
    type: Literal[EventType.ERROR] = EventType.ERROR
    message: str


class ContinuePromptEvent(BaseModel):
    type: Literal[EventType.CONTINUE_PROMPT] = EventType.CONTINUE_PROMPT
    turn: int
    message: str


class SubAgentStartEvent(BaseModel):
    type: Literal[EventType.SUBAGENT_START] = EventType.SUBAGENT_START
    name: str


class SubAgentProgressEvent(BaseModel):
    type: Literal[EventType.SUBAGENT_PROGRESS] = EventType.SUBAGENT_PROGRESS
    name: str
    stage: str


class SubAgentCompleteEvent(BaseModel):
    type: Literal[EventType.SUBAGENT_COMPLETE] = EventType.SUBAGENT_COMPLETE
    name: str
    output_summary: str


# Cycle 2 Phase B — HITL "save report?" proposal emitted after a build_schema +
# report_generate chain. The schema field is the full ReportSchema dict (not
# typed here to avoid circular import with tools/build_schema/schema.py); the
# proposal sits in main.py's _report_proposals[id_temp] until the user confirms
# (POST /api/reports/confirm/{id_temp}) or rejects (DELETE /api/reports/proposal/{id_temp}).
class ReportProposedMeta(BaseModel):
    blocks: int
    dataRefs: int
    domain: str
    schemaVersion: str


class ReportProposedEvent(BaseModel):
    type: Literal[EventType.REPORT_PROPOSED] = EventType.REPORT_PROPOSED
    id_temp: str
    meta: ReportProposedMeta
    schema_: dict[str, Any] = Field(alias="schema")
    summary: str

    model_config = ConfigDict(populate_by_name=True)


AgentEvent = (
    ToolStartEvent | ToolResultEvent | LLMChunkEvent | FinalEvent
    | ErrorEvent | ContinuePromptEvent
    | SubAgentStartEvent | SubAgentProgressEvent | SubAgentCompleteEvent
    | ReportProposedEvent
)
