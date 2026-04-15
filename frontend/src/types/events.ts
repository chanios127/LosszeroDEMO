// Mirror of backend agent/events.py

export type VizHint = "bar_chart" | "line_chart" | "pie_chart" | "table" | "number";

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

export interface ApprovalRequestEvent {
  type: "approval_required";
  tool: string;
  input: Record<string, unknown>;
  turn: number;
  reason: string;
}

export type AgentEvent =
  | ToolStartEvent
  | ToolResultEvent
  | LLMChunkEvent
  | FinalEvent
  | ErrorEvent
  | ApprovalRequestEvent;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>[] | null;
  vizHint?: VizHint;
  traceEvents?: AgentEvent[];
  isStreaming?: boolean;
}
