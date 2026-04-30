// Chat domain types — separated from events.ts to keep SSE mirror lock granularity
// limited to *Event classes + AgentEvent union.
//
// ChatMessage / Conversation evolve independently from backend SSE.

import type { AgentEvent, VizHint } from "./events";
import type { ReportSchema } from "./report";
import type { ViewBundle } from "./view";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>[] | null;
  vizHint?: VizHint;
  traceEvents?: AgentEvent[];
  isStreaming?: boolean;
  /** build_schema tool output captured during SSE (persisted to localStorage). */
  reportSchema?: ReportSchema;
  /** build_view tool output captured during SSE. When present, ReportContainer
   *  routes blocks by ViewBlockSpec.component instead of falling back to
   *  ReportBlock.type. */
  viewBundle?: ViewBundle;
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
