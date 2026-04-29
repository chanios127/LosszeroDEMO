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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>[] | null;
  vizHint?: VizHint;
  traceEvents?: AgentEvent[];
  isStreaming?: boolean;
}

export interface ResultEntry {
  id: string;
  query: string;
  timestamp: number;
  answer: string;
  data: Record<string, unknown>[] | null;
  vizHint: VizHint;
  messageId: string;
}

export interface Conversation {
  id: string;
  title: string;
  domain: string;
  domainLabel: string;
  messages: ChatMessage[];
  /** Backend conversation_id (LLM history key). Preserved across reload so
   *  follow-up turns continue the same backend session. */
  sessionId?: string;
  /** Latest in-flight or recently-finished SSE stream key. If the last
   *  assistant message is still `isStreaming: true` when this conversation
   *  is loaded, the frontend will reconnect to this stream and replay
   *  buffered events from the start. */
  streamKey?: string;
  createdAt: number;
  updatedAt: number;
}
