// Result domain — DataQuery results board entries.
// Separated from events.ts to keep SSE mirror lock granularity limited to *Event
// classes + AgentEvent union.

import type { VizHint } from "./events";

export interface ResultEntry {
  id: string;
  query: string;
  timestamp: number;
  answer: string;
  data: Record<string, unknown>[] | null;
  vizHint: VizHint;
  messageId: string;
}
