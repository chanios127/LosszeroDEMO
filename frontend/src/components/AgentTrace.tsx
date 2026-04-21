import { useState } from "react";
import type { AgentEvent, VizHint } from "../types/events";
import { InlineViz } from "./VizPanel";

interface AgentTraceProps {
  events: AgentEvent[];
  answer: string;
  isStreaming: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferVizHint(data: Record<string, unknown>[]): VizHint {
  if (!data.length) return "table";
  if (data.length === 1 && Object.keys(data[0]).length === 1) return "number";
  const keys = Object.keys(data[0]);
  const numericCols = keys.filter((k) => typeof data[0][k] === "number");
  if (numericCols.length >= 1 && keys.length >= 2) {
    const dateHints = ["date", "month", "week", "year", "time", "일", "월", "주"];
    if (keys.some((k) => dateHints.some((h) => k.toLowerCase().includes(h)))) {
      return "line_chart";
    }
    return "bar_chart";
  }
  return "table";
}

// ---------------------------------------------------------------------------
// ToolStep — single tool_start / tool_result row
// ---------------------------------------------------------------------------

export function ToolStep({ event }: { event: AgentEvent }) {
  if (event.type === "tool_start") {
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-yellow-400" />
        <div className="min-w-0 flex-1">
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
        <div className="min-w-0 flex-1">
          <span className={`font-medium ${hasError ? "text-red-300" : "text-green-300"}`}>
            {event.tool}
          </span>
          {event.rows != null && (
            <span className="ml-2 text-slate-400">{event.rows} rows</span>
          )}
          {hasError && <p className="mt-1 text-xs text-red-400">{event.error}</p>}
        </div>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// ToolResultInlineViz — render chart/table directly from tool_result data
// ---------------------------------------------------------------------------

function ToolResultInlineViz({
  data,
  rows,
  tool,
  turn,
}: {
  data: Record<string, unknown>[];
  rows: number | null;
  tool: string;
  turn: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const vizHint = inferVizHint(data);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800/50"
      >
        <span className="text-slate-500">{expanded ? "▾" : "▸"}</span>
        <span className="font-medium text-green-300">{tool}</span>
        <span className="text-slate-400">Turn {turn}</span>
        <span className="ml-auto text-slate-500">{rows ?? data.length} rows</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-800 p-3">
          <InlineViz data={data} vizHint={vizHint} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollapsibleTrace — for chat message bubbles
// Shows tool_start + tool_result pairs.
// When tool_result has array data, shows it as an expandable inline chart.
// ---------------------------------------------------------------------------

const _DATA_TOOLS = new Set(["db_query", "sp_call"]);

export function CollapsibleTrace({ events }: { events: AgentEvent[] }) {
  const toolEvents = events.filter(
    (e) => e.type === "tool_start" || e.type === "tool_result",
  );
  if (!toolEvents.length) return null;

  // Separate: metadata-only vs data-bearing results
  const dataResults = events.filter(
    (e): e is Extract<AgentEvent, { type: "tool_result" }> =>
      e.type === "tool_result" &&
      !e.error &&
      _DATA_TOOLS.has(e.tool) &&
      Array.isArray(e.output) &&
      (e.output as unknown[]).length > 0,
  );

  return (
    <div className="space-y-2">
      {/* Inline data visualizations from tool_result events (collapsed by default) */}
      {dataResults.map((ev, i) => (
        <ToolResultInlineViz
          key={`viz-${i}`}
          data={ev.output as Record<string, unknown>[]}
          rows={ev.rows}
          tool={ev.tool}
          turn={ev.turn}
        />
      ))}

      {/* Full agent trace (all steps, always collapsed) */}
      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-slate-500 hover:text-slate-300">
          <span className="inline-block w-3">▸</span>
          <span className="group-open:hidden">Agent Trace ({toolEvents.length} steps)</span>
          <span className="hidden group-open:inline">Agent Trace (접기)</span>
        </summary>
        <div className="mt-2 space-y-2 rounded bg-slate-800/30 p-2">
          {toolEvents.map((e, i) => (
            <ToolStep key={i} event={e} />
          ))}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default AgentTrace (legacy, not used in current UI)
// ---------------------------------------------------------------------------

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
