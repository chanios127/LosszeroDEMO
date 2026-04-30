import type { AgentEvent } from "../types/events";
import { Dot } from "./primitives";
import { IconAlert, IconCheck, IconSpinner } from "./icons";

export interface SubAgentProgressProps {
  events: AgentEvent[];
  isStreaming: boolean;
}

type Stage = {
  name: string;
  status: "running" | "complete" | "error";
  latestStage?: string;
  outputSummary?: string;
};

const STAGE_LABEL: Record<string, string> = {
  build_schema: "분석 보고서 생성",
  build_view: "시각화 구성",
};

function labelFor(name: string): string {
  return STAGE_LABEL[name] ?? name;
}

function deriveStages(events: AgentEvent[]): Stage[] {
  const stages = new Map<string, Stage>();
  const order: string[] = [];

  for (const event of events) {
    if (event.type === "subagent_start") {
      if (!stages.has(event.name)) order.push(event.name);
      stages.set(event.name, { name: event.name, status: "running" });
    } else if (event.type === "subagent_progress") {
      const s = stages.get(event.name);
      if (s) stages.set(event.name, { ...s, latestStage: event.stage });
    } else if (event.type === "subagent_complete") {
      const s = stages.get(event.name);
      if (s) {
        // backend (loop.py) prefixes failure summaries with "Error:" — branch.
        const isError = event.output_summary.startsWith("Error:");
        stages.set(event.name, {
          ...s,
          status: isError ? "error" : "complete",
          outputSummary: event.output_summary,
        });
      }
    }
  }

  return order.map((name) => stages.get(name)!);
}

export function SubAgentProgress({ events, isStreaming }: SubAgentProgressProps) {
  const stages = deriveStages(events);
  if (stages.length === 0) return null;

  if (!isStreaming) {
    const names = stages.map((s) => labelFor(s.name)).join(", ");
    const hasError = stages.some((s) => s.status === "error");
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "var(--bg-elev-1)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
        }}
      >
        {hasError ? (
          <IconAlert
            width={12}
            height={12}
            style={{ color: "var(--danger)", flexShrink: 0 }}
          />
        ) : (
          <IconCheck
            width={12}
            height={12}
            style={{ color: "var(--success)", flexShrink: 0 }}
          />
        )}
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--text-faint)" }}
        >
          {hasError
            ? `Sub-agent error: ${names}`
            : `${stages.length} sub-agent${stages.length !== 1 ? "s" : ""} complete: ${names}`}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 2,
        }}
      >
        Sub-Agents
      </div>
      {stages.map((stage) => (
        <div
          key={stage.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            minHeight: 20,
          }}
        >
          {stage.status === "running" ? (
            <IconSpinner
              width={13}
              height={13}
              style={{ color: "var(--brand-500)", flexShrink: 0 }}
            />
          ) : stage.status === "error" ? (
            <IconAlert
              width={13}
              height={13}
              style={{ color: "var(--danger)", flexShrink: 0 }}
            />
          ) : (
            <IconCheck
              width={13}
              height={13}
              style={{ color: "var(--success)", flexShrink: 0 }}
            />
          )}
          <span
            className="mono"
            style={{
              color:
                stage.status === "running"
                  ? "var(--text-strong)"
                  : stage.status === "error"
                    ? "var(--danger)"
                    : "var(--text-muted)",
              fontWeight: stage.status === "running" ? 500 : 400,
            }}
          >
            {labelFor(stage.name)}
          </span>
          {stage.status === "running" && stage.latestStage && (
            <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
              — {stage.latestStage}
            </span>
          )}
          {(stage.status === "complete" || stage.status === "error") &&
            stage.outputSummary && (
              <span
                style={{
                  color:
                    stage.status === "error"
                      ? "var(--danger)"
                      : "var(--text-faint)",
                  fontSize: 11,
                }}
              >
                — {stage.outputSummary}
              </span>
            )}
          {stage.status === "running" && (
            <span style={{ marginLeft: "auto" }}>
              <Dot tone="brand" pulse />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
