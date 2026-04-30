import type { ReportBlock, Severity } from "../../types/report";
import { BlockHeader } from "./_atoms";

type KpiGridBlockType = Extract<ReportBlock, { type: "kpi_grid" }>;
type KpiMetric = KpiGridBlockType["metrics"][number];

const SEVERITY_COLOR: Record<Severity, string> = {
  good: "var(--severity-good)",
  neutral: "var(--severity-neutral)",
  warning: "var(--severity-warn)",
  alert: "var(--severity-alert)",
};

function TrendGlyph({ trend }: { trend: NonNullable<KpiMetric["trend"]> }) {
  if (trend === "up") return <span>▲</span>;
  if (trend === "down") return <span>▼</span>;
  return <span>→</span>;
}

function KpiTile({ m }: { m: KpiMetric }) {
  const accent = m.severity ? SEVERITY_COLOR[m.severity] : "transparent";
  const trendColor =
    m.trend === "up"
      ? "var(--success)"
      : m.trend === "down"
        ? "var(--danger)"
        : "var(--text-faint)";

  return (
    <div
      className="card"
      style={{
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {m.severity && m.severity !== "neutral" && (
        <span
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: accent,
          }}
        />
      )}
      <span
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {m.label}
      </span>
      <span
        className="tnum"
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: "var(--text-strong)",
          lineHeight: 1.1,
        }}
      >
        {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
        {m.unit && (
          <span
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginLeft: 4,
              fontWeight: 400,
            }}
          >
            {m.unit}
          </span>
        )}
      </span>
      {(m.delta || m.trend) && (
        <span
          className="mono tnum"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: trendColor,
          }}
        >
          {m.trend && <TrendGlyph trend={m.trend} />}
          {m.delta && <span>{m.delta}</span>}
          {m.severity === "alert" && (
            <span style={{ color: "var(--danger)" }}>· 주의</span>
          )}
        </span>
      )}
    </div>
  );
}

export function KpiGridBlock({ title, columns = 4, metrics }: KpiGridBlockType) {
  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      {title && <BlockHeader title={title} />}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: "var(--space-3)",
        }}
      >
        {metrics.map((m, i) => (
          <KpiTile key={i} m={m} />
        ))}
      </div>
    </div>
  );
}
