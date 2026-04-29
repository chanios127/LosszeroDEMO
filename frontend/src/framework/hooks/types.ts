// Phase 9.5 — framework-level extensions to design ChatMessage / Conversation.
// design/types/events.ts is locked (9.4 SSE mirror) so we extend here.
//
// Structural typing means EnrichedChatMessage[] flows into MessageThread's
// `messages: ChatMessage[]` prop unchanged — extra fields are simply ignored
// by the design renderer.

import type { ChatMessage, Conversation } from "../../design/types/events";
import type { ReportSchema } from "../../design/types/report";
import type { ViewBundle } from "../../design/types/view";

export interface EnrichedChatMessage extends ChatMessage {
  /** build_report tool output captured during SSE (persisted to localStorage). */
  reportSchema?: ReportSchema;
  /** build_view tool output captured during SSE. When present,
   *  ReportContainer routes blocks by ViewBlockSpec.component instead of
   *  falling back to ReportBlock.type. */
  viewBundle?: ViewBundle;
}

export interface EnrichedConversation extends Omit<Conversation, "messages"> {
  messages: EnrichedChatMessage[];
}
