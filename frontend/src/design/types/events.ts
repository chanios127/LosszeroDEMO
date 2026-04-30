// Mirror of backend agent/events.py

import type { ReportSchema } from "./report";

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

// Cycle 2 Phase B — HITL "save report?" proposal. Backend wires this up after
// a build_schema + report_generate chain. Frontend renders ReportProposalCard
// + posts to /api/reports/confirm/{id_temp} or DELETE /api/reports/proposal/{id_temp}.
export interface ReportProposedMeta {
  blocks: number;
  dataRefs: number;
  domain: string;
  schemaVersion: string;
}

export interface ReportProposedEvent {
  type: "report_proposed";
  id_temp: string;
  meta: ReportProposedMeta;
  schema: ReportSchema;
  summary: string;
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
  | SubAgentCompleteEvent
  | ReportProposedEvent;
