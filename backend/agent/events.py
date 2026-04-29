"""SSE event type definitions for the agent loop."""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel


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


VizHint = Literal["bar_chart", "line_chart", "pie_chart", "table", "number"]


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


AgentEvent = (
    ToolStartEvent | ToolResultEvent | LLMChunkEvent | FinalEvent
    | ErrorEvent | ContinuePromptEvent
    | SubAgentStartEvent | SubAgentProgressEvent | SubAgentCompleteEvent
)
