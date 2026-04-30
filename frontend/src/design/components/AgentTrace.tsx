import { useState } from "react";
import type { AgentEvent, VizHint } from "../types/events";
import { InlineViz } from "./VizPanel";
import { Dot } from "./primitives";
import { IconWrench, IconCheck } from "./icons";

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
// ToolEventRow — single tool_start / tool_result row (prototype-style)
// ---------------------------------------------------------------------------

export function ToolStep({ event }: { event: AgentEvent }) {
  if (event.type === "tool_start") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "6px 0",
          fontSize: 12,
        }}
      >
        <div style={{ paddingTop: 5 }}>
          <Dot tone="warning" pulse />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>
            <span
              className="mono"
              style={{ color: "var(--warning)", fontWeight: 500 }}
            >
              {event.tool}
            </span>
            <span
              className="mono"
              style={{
                color: "var(--text-faint)",
                marginLeft: 8,
                fontSize: 10,
              }}
            >
              turn {event.turn}
            </span>
          </div>
          <pre
            className="mono"
            style={{
              margin: "4px 0 0",
              padding: "6px 8px",
              background: "var(--bg)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--text-muted)",
              overflow: "auto",
              maxHeight: 80,
            }}
          >
            {JSON.stringify(event.input, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  if (event.type === "tool_result") {
    const hasError = !!event.error;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 0",
          fontSize: 12,
        }}
      >
        <Dot tone={hasError ? "danger" : "success"} />
        <span
          className="mono"
          style={{
            color: hasError ? "var(--danger)" : "var(--success)",
            fontWeight: 500,
          }}
        >
          {event.tool}
        </span>
        {event.rows != null && (
          <span
            className="mono"
            style={{ color: "var(--text-faint)", fontSize: 10 }}
          >
            {event.rows} rows
          </span>
        )}
        {hasError && (
          <span style={{ color: "var(--danger)", fontSize: 11 }}>
            {event.error}
          </span>
        )}
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// ExecutedSqlBlock — code block with copy button (top-right) for db_query SQL
// ---------------------------------------------------------------------------

function ExecutedSqlBlock({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard API unavailable — silent fail
    }
  };
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{ position: "relative" }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: 10,
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          userSelect: "none",
          padding: "2px 0",
        }}
      >
        Executed SQL
      </summary>
      <div style={{ position: "relative", marginTop: 4 }}>
        <pre
          className="mono"
          style={{
            margin: 0,
            padding: "10px 12px",
            background: "var(--bg-elev-3)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--text-strong)",
            whiteSpace: "pre",
            overflowX: "auto",
          }}
        >
          {sql}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            fontSize: 10,
            fontWeight: 500,
            background: copied ? "var(--success)" : "var(--bg-elev-2)",
            color: copied ? "var(--bg)" : "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            cursor: "pointer",
            transition: "background 120ms, color 120ms",
          }}
          onMouseEnter={(e) => {
            if (!copied) e.currentTarget.style.color = "var(--text-strong)";
          }}
          onMouseLeave={(e) => {
            if (!copied) e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <CopyGlyph />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </details>
  );
}

function CopyGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ToolResultInlineViz — render chart/table directly from tool_result data
// ---------------------------------------------------------------------------

function ToolResultInlineViz({
  data,
  rows,
  tool,
  turn,
  executedSql,
}: {
  data: Record<string, unknown>[];
  rows: number | null;
  tool: string;
  turn: number;
  executedSql?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const vizHint = inferVizHint(data);

  return (
    <div
      style={{
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          fontSize: 11,
          transition: "background 120ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-elev-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{ color: "var(--text-faint)" }}>
          {expanded ? "▾" : "▸"}
        </span>
        <Dot tone="success" />
        <span
          className="mono"
          style={{ color: "var(--success)", fontWeight: 500 }}
        >
          {tool}
        </span>
        <span className="mono" style={{ color: "var(--text-faint)" }}>
          turn {turn}
        </span>
        <span
          className="mono"
          style={{
            marginLeft: "auto",
            color: "var(--text-dim)",
            fontSize: 10,
          }}
        >
          {rows ?? data.length} rows
        </span>
      </button>

      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {executedSql && <ExecutedSqlBlock sql={executedSql} />}
          <InlineViz data={data} vizHint={vizHint} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollapsibleTrace — for chat message bubbles (prototype header style)
// ---------------------------------------------------------------------------

const _DATA_TOOLS = new Set(["db_query", "sp_call"]);

export function CollapsibleTrace({ events }: { events: AgentEvent[] }) {
  const [open, setOpen] = useState(false);
  const toolEvents = events.filter(
    (e) => e.type === "tool_start" || e.type === "tool_result",
  );
  if (!toolEvents.length) return null;

  const dataResults = events.filter(
    (e): e is Extract<AgentEvent, { type: "tool_result" }> =>
      e.type === "tool_result" &&
      !e.error &&
      _DATA_TOOLS.has(e.tool) &&
      Array.isArray(e.output) &&
      (e.output as unknown[]).length > 0,
  );

  // Pair each dataResult with its tool_start (matched by turn + tool) to
  // surface invocation inputs (e.g. the executed SQL for db_query).
  const inputByTurnTool = new Map<string, Record<string, unknown>>();
  for (const ev of events) {
    if (ev.type === "tool_start") {
      inputByTurnTool.set(`${ev.turn}:${ev.tool}`, ev.input);
    }
  }

  const isStillRunning = toolEvents.some((e, i) => {
    if (e.type !== "tool_start") return false;
    // Check if there's a matching tool_result after
    const later = toolEvents.slice(i + 1);
    return !later.some(
      (r) => r.type === "tool_result" && r.turn === e.turn && r.tool === e.tool,
    );
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Inline data visualizations from tool_result events */}
      {dataResults.map((ev, i) => {
        const input = inputByTurnTool.get(`${ev.turn}:${ev.tool}`);
        const sql =
          ev.tool === "db_query" && typeof input?.sql === "string"
            ? (input.sql as string)
            : undefined;
        return (
          <ToolResultInlineViz
            key={`viz-${i}`}
            data={ev.output as Record<string, unknown>[]}
            rows={ev.rows}
            tool={ev.tool}
            turn={ev.turn}
            executedSql={sql}
          />
        );
      })}

      {/* Full trace (collapsed by default) */}
      <div
        style={{
          background: "var(--bg-elev-1)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "8px 12px",
            fontSize: 11,
          }}
        >
          <span style={{ color: "var(--text-faint)" }}>
            {open ? "▾" : "▸"}
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            <IconWrench />
          </span>
          <span
            className="mono"
            style={{ color: "var(--text-muted)", fontWeight: 500 }}
          >
            Agent Trace
          </span>
          <span className="mono" style={{ color: "var(--text-faint)" }}>
            {toolEvents.length} steps
          </span>
          <span
            className="mono"
            style={{
              marginLeft: "auto",
              color: isStillRunning ? "var(--warning)" : "var(--success)",
              fontSize: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {isStillRunning ? (
              <>
                <Dot tone="warning" pulse />
                running
              </>
            ) : (
              <>
                <IconCheck />
                completed
              </>
            )}
          </span>
        </button>
        {open && (
          <div
            style={{
              padding: "0 12px 10px",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {toolEvents.map((e, i) => (
              <ToolStep key={i} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default AgentTrace (legacy, kept for compat — unused in current UI)
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {toolEvents.length > 0 && (
        <CollapsibleTrace events={events} />
      )}
      {answer && (
        <div
          style={{
            padding: 16,
            background: "var(--bg-elev-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <div
            className="mono"
            style={{
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-dim)",
            }}
          >
            Answer
          </div>
          <p
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontSize: 14,
              color: "var(--text-strong)",
            }}
          >
            {answer}
            {isStreaming && <span className="caret-blink" />}
          </p>
        </div>
      )}
    </div>
  );
}
