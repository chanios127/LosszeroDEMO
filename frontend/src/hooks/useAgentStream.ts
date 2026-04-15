import { useCallback, useReducer, useRef } from "react";
import type { AgentEvent, ChatMessage } from "../types/events";

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

interface State {
  messages: ChatMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  error: string | null;
}

type Action =
  | { type: "SEND_QUERY"; query: string; id: string }
  | { type: "SET_SESSION"; sessionId: string; streamKey: string }
  | { type: "APPEND_TRACE"; event: AgentEvent }
  | { type: "APPEND_DELTA"; delta: string }
  | { type: "SET_FINAL"; answer: string; data: Record<string, unknown>[] | null; vizHint: string }
  | { type: "SET_ERROR"; message: string }
  | { type: "RESET" };

const initialState: State = {
  messages: [],
  sessionId: null,
  isStreaming: false,
  error: null,
};

function updateLastAssistant(
  msgs: ChatMessage[],
  updater: (m: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const result = [...msgs];
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === "assistant") {
      result[i] = updater({ ...result[i] });
      break;
    }
  }
  return result;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SEND_QUERY":
      return {
        ...state,
        isStreaming: true,
        error: null,
        messages: [
          ...state.messages,
          { id: action.id + "-u", role: "user", content: action.query },
          {
            id: action.id + "-a",
            role: "assistant",
            content: "",
            traceEvents: [],
            isStreaming: true,
          },
        ],
      };

    case "SET_SESSION":
      return { ...state, sessionId: action.sessionId };

    case "APPEND_TRACE":
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (m) => ({
          ...m,
          traceEvents: [...(m.traceEvents ?? []), action.event],
        })),
      };

    case "APPEND_DELTA":
      return {
        ...state,
        messages: updateLastAssistant(state.messages, (m) => ({
          ...m,
          content: m.content + action.delta,
        })),
      };

    case "SET_FINAL":
      return {
        ...state,
        isStreaming: false,
        messages: updateLastAssistant(state.messages, (m) => ({
          ...m,
          content: action.answer,
          data: action.data,
          vizHint: action.vizHint as ChatMessage["vizHint"],
          isStreaming: false,
        })),
      };

    case "SET_ERROR":
      return {
        ...state,
        isStreaming: false,
        error: action.message,
        messages: updateLastAssistant(state.messages, (m) => ({
          ...m,
          isStreaming: false,
        })),
      };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const API_BASE = "/api";

export function useAgentStream() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef<EventSource | null>(null);
  const sessionRef = useRef<string | null>(null);

  const send = useCallback(async (query: string) => {
    const msgId = crypto.randomUUID();
    dispatch({ type: "SEND_QUERY", query, id: msgId });

    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          session_id: sessionRef.current,
        }),
      });

      if (!res.ok) {
        throw new Error(`Query failed: ${res.status} ${res.statusText}`);
      }

      const { session_id, status: streamKey } = await res.json();
      sessionRef.current = session_id;
      dispatch({ type: "SET_SESSION", sessionId: session_id, streamKey });

      // SSE stream
      const es = new EventSource(`${API_BASE}/stream/${streamKey}`);
      esRef.current = es;

      const handleEvent = (e: MessageEvent) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);

          if (event.type === "tool_start" || event.type === "tool_result") {
            dispatch({ type: "APPEND_TRACE", event });
          } else if (event.type === "llm_chunk") {
            dispatch({ type: "APPEND_DELTA", delta: event.delta });
          } else if (event.type === "final") {
            dispatch({
              type: "SET_FINAL",
              answer: event.answer,
              data: event.data,
              vizHint: event.viz_hint,
            });
            es.close();
          } else if (event.type === "error") {
            dispatch({ type: "SET_ERROR", message: event.message });
            es.close();
          }
        } catch {
          // skip malformed events
        }
      };

      es.addEventListener("tool_start", handleEvent);
      es.addEventListener("tool_result", handleEvent);
      es.addEventListener("llm_chunk", handleEvent);
      es.addEventListener("final", handleEvent);
      es.addEventListener("error", handleEvent);

      es.onerror = () => {
        dispatch({
          type: "SET_ERROR",
          message: "SSE connection lost",
        });
        es.close();
      };
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  const cancel = useCallback(() => {
    esRef.current?.close();
    dispatch({
      type: "SET_ERROR",
      message: "Cancelled by user",
    });
  }, []);

  const reset = useCallback(() => {
    esRef.current?.close();
    sessionRef.current = null;
    dispatch({ type: "RESET" });
  }, []);

  return { ...state, send, cancel, reset };
}
