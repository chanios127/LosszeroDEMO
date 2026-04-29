import type { ReportBlock } from "../../types/report";
import { IconArrowUp, IconArrowDown, IconArrowR } from "../icons";

type MetricBlock = Extract<ReportBlock, { type: "metric" }>;

const TREND_COLOR: Record<NonNullable<MetricBlock["trend"]>, string> = {
  up: "var(--success)",
  down: "var(--danger)",
  flat: "var(--text-faint)",
};

function TrendIcon({ trend }: { trend: NonNullable<MetricBlock["trend"]> }) {
  if (trend === "up") return <IconArrowUp />;
  if (trend === "down") return <IconArrowDown />;
  return <IconArrowR />;
}

function formatValue(value: MetricBlock["value"], unit?: string): string {
  let body: string;
  if (typeof value === "number") {
    body = new Intl.NumberFormat().format(value);
  } else {
    body = value;
  }
  return unit ? `${body} ${unit}` : body;
}

export function MetricCard({ label, value, delta, trend, unit }: MetricBlock) {
  const color = trend ? TREND_COLOR[trend] : "var(--text-faint)";
  return (
    <div
      className="card"
      style={{
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <span
        className="tnum"
        style={{
          fontSize: 26,
          fontWeight: 600,
          color: "var(--text-strong)",
          lineHeight: 1.1,
        }}
      >
        {formatValue(value, unit)}
      </span>
      {(delta || trend) && (
        <span
          className="mono tnum"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color,
          }}
        >
          {trend && <TrendIcon trend={trend} />}
          {delta && <span>{delta}</span>}
        </span>
      )}
    </div>
  );
}
