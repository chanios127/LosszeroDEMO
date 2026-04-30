// Mirror of backend agent/events.py

export type VizHint =
  | "bar_chart"
  | "line_chart"
  | "pie_chart"
  | "table"
  | "number"
  | "gantt"
  | "radar";

export interface ToolStartEvent {
  type: "tool_start";
  tool: string;
  input: Record<string, unknown>;
  turn: number;
}

export interface ToolResultEvent {
  type: "tool_result";
  tool: string;
  rows: number | null;
  output: unknown;
  turn: number;
  error: string | null;
}

export interface LLMChunkEvent {
  type: "llm_chunk";
  delta: string;
}

export interface FinalEvent {
  type: "final";
  answer: string;
  viz_hint: VizHint;
  data: Record<string, unknown>[] | null;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export interface ContinuePromptEvent {
  type: "continue_prompt";
  turn: number;
  message: string;
}

export interface SubAgentStartEvent {
  type: "subagent_start";
  name: string;
}

export interface SubAgentProgressEvent {
  type: "subagent_progress";
  name: string;
  stage: string;
}

export interface SubAgentCompleteEvent {
  type: "subagent_complete";
  name: string;
  output_summary: string;
}

// LOCKED: AgentEvent union and *Event classes mirror backend agent/events.py.
// Modify only when backend SSE event schema changes; chat domain types live in chat.ts.
export type AgentEvent =
  | ToolStartEvent
  | ToolResultEvent
  | LLMChunkEvent
  | FinalEvent
  | ErrorEvent
  | ContinuePromptEvent
  | SubAgentStartEvent
  | SubAgentProgressEvent
  | SubAgentCompleteEvent;
