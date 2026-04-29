import type { ReportBlock } from "../../types/report";
import { IconAlert, IconCheck } from "../icons";

type HighlightBlock = Extract<ReportBlock, { type: "highlight" }>;
type Level = HighlightBlock["level"];

const LEVEL_TOKEN: Record<Level, string> = {
  info: "var(--info)",
  warning: "var(--warning)",
  alert: "var(--danger)",
};

const LEVEL_LABEL: Record<Level, string> = {
  info: "INFO",
  warning: "WARNING",
  alert: "ALERT",
};

function LevelIcon({ level }: { level: Level }) {
  if (level === "info") return <IconCheck />;
  return <IconAlert />;
}

export function HighlightCard({ level, message }: HighlightBlock) {
  const color = LEVEL_TOKEN[level];
  return (
    <div
      className="card"
      style={{
        position: "relative",
        padding: "var(--space-4)",
        paddingLeft: "calc(var(--space-4) + 4px)",
        borderLeft: `4px solid ${color}`,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: `color-mix(in oklch, ${color} 6%, var(--bg-elev-1))`,
      }}
    >
      <span
        style={{
          color,
          display: "inline-flex",
          alignItems: "center",
          marginTop: 1,
        }}
      >
        <LevelIcon level={level} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            fontWeight: 600,
            color,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 2,
          }}
        >
          {LEVEL_LABEL[level]}
        </div>
        <div style={{ fontSize: 13, color: "var(--text)" }}>{message}</div>
      </div>
    </div>
  );
}
