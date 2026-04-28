import { useCallback, useReducer, useRef } from "react";
import type { AgentEvent, ChatMessage, ResultEntry } from "../../design/types/events";

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

export interface PendingContinue {
  turn: number;
  message: string;
  streamKey: string;
}

interface State {
  messages: ChatMessage[];
  sessionId: string | null;
  streamKey: string | null;
  isStreaming: boolean;
  error: string | null;
  pendingContinue: PendingContinue | null;
  results: ResultEntry[];
  activeResultId: string | null;
}

type Action =
  | { type: "SEND_QUERY"; query: string; id: string }
  | { type: "SET_SESSION"; sessionId: string; streamKey: string }
  | { type: "APPEND_TRACE"; event: AgentEvent }
  | { type: "APPEND_DELTA"; delta: string }
  | { type: "SET_FINAL"; answer: string; data: Record<string, unknown>[] | null; vizHint: string }
  | { type: "SET_ERROR"; message: string }
  | { type: "CONTINUE_PROMPT"; pending: PendingContinue }
  | { type: "CONTINUE_RESOLVED" }
  | { type: "SET_ACTIVE_RESULT"; id: string | null }
  | {
      type: "LOAD_MESSAGES";
      messages: ChatMessage[];
      sessionId?: string | null;
      streamKey?: string | null;
    }
  | { type: "RESUME_STREAM" }
  | { type: "RESET" };

const initialState: State = {
  messages: [],
  sessionId: null,
  streamKey: null,
  isStreaming: false,
  error: null,
  pendingContinue: null,
  results: [],
  activeResultId: null,
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
      return {
        ...state,
        sessionId: action.sessionId,
        streamKey: action.streamKey,
      };

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

    case "SET_FINAL": {
      const lastUser = [...state.messages].reverse().find((m) => m.role === "user");
      const lastAssistant = [...state.messages].reverse().find((m) => m.role === "assistant");
      const newResult: ResultEntry = {
        id: crypto.randomUUID(),
        query: lastUser?.content ?? "",
        timestamp: Date.now(),
        answer: action.answer,
        data: action.data,
        vizHint: action.vizHint as ResultEntry["vizHint"],
        messageId: lastAssistant?.id ?? "",
      };
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
        results: [...state.results, newResult],
        activeResultId: newResult.id,
      };
    }

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

    case "CONTINUE_PROMPT":
      return { ...state, pendingContinue: action.pending };

    case "CONTINUE_RESOLVED":
      return { ...state, pendingContinue: null };

    case "SET_ACTIVE_RESULT":
      return { ...state, activeResultId: action.id };

    case "LOAD_MESSAGES":
      return {
        ...state,
        messages: action.messages,
        sessionId: action.sessionId ?? null,
        streamKey: action.streamKey ?? null,
        isStreaming: false,
        error: null,
        pendingContinue: null,
      };

    case "RESUME_STREAM": {
      // Find the last assistant message; if it exists, reset its streamed
      // content so SSE replay can rebuild it cleanly. Otherwise append a
      // fresh placeholder.
      let lastAssistantIdx = -1;
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === "assistant") {
          lastAssistantIdx = i;
          break;
        }
      }
      let newMessages: ChatMessage[];
      if (lastAssistantIdx !== -1) {
        newMessages = [...state.messages];
        newMessages[lastAssistantIdx] = {
          ...newMessages[lastAssistantIdx],
          content: "",
          traceEvents: [],
          data: null,
          vizHint: undefined,
          isStreaming: true,
        };
      } else {
        newMessages = [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            traceEvents: [],
            isStreaming: true,
          },
        ];
      }
      return {
        ...state,
        messages: newMessages,
        isStreaming: true,
        error: null,
        pendingContinue: null,
      };
    }

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

  // Attach an EventSource to the given stream_key. Replay-safe: backend
  // SSE generator yields all buffered events from the start on every new
  // connection, so reconnecting after a disconnect catches up automatically.
  const attachSSE = useCallback((streamKey: string) => {
    esRef.current?.close();
    const es = new EventSource(`${API_BASE}/stream/${streamKey}`);
    esRef.current = es;

    const handleEvent = (e: MessageEvent) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);

        if (event.type === "tool_start" || event.type === "tool_result") {
          dispatch({ type: "APPEND_TRACE", event });
        } else if (event.type === "llm_chunk") {
          dispatch({ type: "APPEND_DELTA", delta: event.delta });
        } else if (event.type === "continue_prompt") {
          dispatch({
            type: "CONTINUE_PROMPT",
            pending: {
              turn: event.turn,
              message: event.message,
              streamKey,
            },
          });
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
    es.addEventListener("continue_prompt", handleEvent);
    es.addEventListener("final", handleEvent);
    es.addEventListener("error", handleEvent);

    es.onerror = () => {
      dispatch({
        type: "SET_ERROR",
        message: "SSE connection lost",
      });
      es.close();
    };
  }, []);

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

      attachSSE(streamKey);
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [attachSSE]);

  const cancel = useCallback(() => {
    esRef.current?.close();
    // Tell the backend to abort the agent task + close the LLM connection.
    // Best-effort: even if this fetch fails (network/backend down) the frontend
    // still drops to error state so the UI doesn't stay stuck on "처리 중...".
    if (sessionRef.current) {
      fetch(`${API_BASE}/cancel/${sessionRef.current}`, { method: "POST" }).catch(
        () => {},
      );
    }
    dispatch({
      type: "SET_ERROR",
      message: "Cancelled by user",
    });
  }, []);

  const respondToContinue = useCallback(async (streamKey: string, proceed: boolean) => {
    dispatch({ type: "CONTINUE_RESOLVED" });
    try {
      await fetch(`${API_BASE}/continue/${streamKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proceed }),
      });
    } catch {
      // non-fatal
    }
  }, []);

  const reset = useCallback(() => {
    esRef.current?.close();
    sessionRef.current = null;
    dispatch({ type: "RESET" });
  }, []);

  const setActiveResult = useCallback((id: string | null) => {
    dispatch({ type: "SET_ACTIVE_RESULT", id });
  }, []);

  const loadMessages = useCallback(
    (
      messages: ChatMessage[],
      sessionId: string | null = null,
      streamKey: string | null = null,
    ) => {
      esRef.current?.close();
      sessionRef.current = sessionId;
      dispatch({ type: "LOAD_MESSAGES", messages, sessionId, streamKey });

      // If the loaded conversation was mid-stream, decide whether to resume
      // or to clean up a stale streaming flag. Validate via backend status
      // first to avoid hanging on a dead stream_key (server restarted, etc.).
      const lastAssistant = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") return messages[i];
        }
        return undefined;
      })();
      if (!streamKey || !lastAssistant?.isStreaming) return;

      // Async validation, fire-and-forget. The dispatched LOAD_MESSAGES has
      // already painted the UI; we'll either resume (replay) or transition
      // to error so the "처리 중..." spinner doesn't stay forever.
      (async () => {
        try {
          const res = await fetch(`${API_BASE}/stream_status/${streamKey}`);
          if (!res.ok) {
            throw new Error(`stream_status ${res.status}`);
          }
          const status = await res.json();
          if (!status.exists) {
            // Server lost the buffer (e.g. restarted) — flush stale streaming flag.
            dispatch({
              type: "SET_ERROR",
              message: "이전 스트림이 만료되었습니다 (재시작/정리됨). 다시 질문해 주세요.",
            });
            return;
          }
          // Buffer alive (in-flight or completed). Replay catches us up to
          // whatever progress happened while we were on another conversation.
          dispatch({ type: "RESUME_STREAM" });
          attachSSE(streamKey);
        } catch {
          dispatch({
            type: "SET_ERROR",
            message: "스트림 상태 확인 실패. 다시 질문해 주세요.",
          });
        }
      })();
    },
    [attachSSE],
  );

  return {
    ...state,
    send,
    cancel,
    reset,
    respondToContinue,
    setActiveResult,
    loadMessages,
  };
}
