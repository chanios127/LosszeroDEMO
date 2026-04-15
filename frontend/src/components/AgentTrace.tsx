import type { AgentEvent } from "../types/events";

interface AgentTraceProps {
  events: AgentEvent[];
  answer: string;
  isStreaming: boolean;
}

export function ToolStep({ event }: { event: AgentEvent }) {
  if (event.type === "tool_start") {
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-yellow-400" />
        <div>
          <span className="font-medium text-yellow-300">{event.tool}</span>
          <span className="ml-2 text-slate-400">Turn {event.turn}</span>
          <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-800/50 p-2 text-xs text-slate-400">
            {JSON.stringify(event.input, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  if (event.type === "tool_result") {
    const hasError = !!event.error;
    return (
      <div className="flex items-start gap-2 text-sm">
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
            hasError ? "bg-red-400" : "bg-green-400"
          }`}
        />
        <div>
          <span
            className={`font-medium ${
              hasError ? "text-red-300" : "text-green-300"
            }`}
          >
            {event.tool}
          </span>
          {event.rows != null && (
            <span className="ml-2 text-slate-400">{event.rows} rows</span>
          )}
          {hasError && (
            <p className="mt-1 text-xs text-red-400">{event.error}</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

/** Collapsible trace for embedding inside chat message bubbles. */
export function CollapsibleTrace({ events }: { events: AgentEvent[] }) {
  const toolEvents = events.filter(
    (e) => e.type === "tool_start" || e.type === "tool_result",
  );
  if (!toolEvents.length) return null;

  return (
    <details className="mb-2">
      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
        Agent Trace ({toolEvents.length} steps)
      </summary>
      <div className="mt-2 space-y-2 rounded bg-slate-800/30 p-2">
        {toolEvents.map((e, i) => (
          <ToolStep key={i} event={e} />
        ))}
      </div>
    </details>
  );
}

export default function AgentTrace({
  events,
  answer,
  isStreaming,
}: AgentTraceProps) {
  const toolEvents = events.filter(
    (e) => e.type === "tool_start" || e.type === "tool_result",
  );

  if (toolEvents.length === 0 && !answer && !isStreaming) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Tool call trace */}
      {toolEvents.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Agent Trace
          </h3>
          <div className="space-y-3">
            {toolEvents.map((event, i) => (
              <ToolStep key={i} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Streaming answer */}
      {answer && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Answer
          </h3>
          <p className="whitespace-pre-wrap text-sm text-slate-200">
            {answer}
            {isStreaming && (
              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-brand-500" />
            )}
          </p>
        </div>
      )}
    </div>
  );
}
