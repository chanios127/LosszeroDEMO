import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { FinalEvent, VizHint } from "../types/events";
import {
  IconBar,
  IconLine,
  IconPie,
  IconTable,
  IconHash,
  IconClose,
  IconDownload,
} from "./icons";

// ---------------------------------------------------------------------------
// Palette & chart theming (reads CSS vars live → reacts to Tweaks palette swap)
// ---------------------------------------------------------------------------

const PALETTE_VARS: string[] = [
  "var(--chart-default-1)",
  "var(--chart-default-2)",
  "var(--chart-default-3)",
  "var(--chart-default-4)",
  "var(--chart-default-5)",
  "var(--chart-default-6)",
];

function getPalette(): string[] {
  // Return CSS var references so Recharts' SVG fill resolves live when
  // tokens are swapped (Tweaks palette). Fallback via static var defaults.
  return PALETTE_VARS;
}

function tooltipStyle(): CSSProperties {
  return {
    background: "var(--bg-elev-1)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    fontSize: 12,
    padding: "8px 12px",
    boxShadow: "var(--shadow-md)",
    color: "var(--text-strong)",
  };
}

// ---------------------------------------------------------------------------
// Column detection + applicable viz hints
// ---------------------------------------------------------------------------

function detectCols(data: Record<string, unknown>[]) {
  if (!data.length) return { label: "", numerics: [] as string[] };
  const keys = Object.keys(data[0]);
  const numerics = keys.filter((k) =>
    data.every((r) => typeof r[k] === "number"),
  );
  const label = keys.find((k) => !numerics.includes(k)) ?? keys[0];
  return { label, numerics };
}

function getApplicableHints(data: Record<string, unknown>[]): VizHint[] {
  if (!data.length) return ["table"];
  const { numerics } = detectCols(data);
  const hasNumerics = numerics.length > 0;
  const nonNumericCount = Object.keys(data[0]).length - numerics.length;
  const hints: VizHint[] = [];
  if (hasNumerics) hints.push("bar_chart", "line_chart");
  if (hasNumerics && numerics.length === 1 && nonNumericCount >= 1)
    hints.push("pie_chart");
  hints.push("table");
  if (data.length === 1 && hasNumerics) hints.push("number");
  return hints;
}

// ---------------------------------------------------------------------------
// Aggregation engine — client-side GROUP BY + COUNT/SUM/AVG/MIN/MAX
// ---------------------------------------------------------------------------

export type AggFn = "count" | "sum" | "avg" | "min" | "max";

export interface AggSpec {
  groupBy: string | null; // categorical column
  aggFn: AggFn;
  aggCol: string | null; // numeric column (required for non-count)
  topN: number; // keep top N groups (sorted by agg value desc)
}

interface ColMeta {
  name: string;
  cardinality: number;
  kind: "number" | "string" | "boolean" | "null" | "mixed";
  /** true if values look like date/time strings (YYYY-MM-DD...) */
  looksLikeDate: boolean;
}

function analyzeCols(data: Record<string, unknown>[]): ColMeta[] {
  if (!data.length) return [];
  const keys = Object.keys(data[0]);
  return keys.map((k) => {
    const kinds = new Set<string>();
    const distinct = new Set<string>();
    let dateLike = 0;
    for (const r of data) {
      const v = r[k];
      if (v == null) kinds.add("null");
      else {
        kinds.add(typeof v);
        const s = String(v);
        distinct.add(s);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateLike++;
      }
    }
    const kindsNonNull = [...kinds].filter((x) => x !== "null");
    const kind: ColMeta["kind"] =
      kindsNonNull.length === 0
        ? "null"
        : kindsNonNull.length === 1
          ? (kindsNonNull[0] as ColMeta["kind"])
          : "mixed";
    return {
      name: k,
      cardinality: distinct.size,
      kind,
      looksLikeDate: dateLike >= data.length * 0.8,
    };
  });
}

/**
 * Heuristic: pick a reasonable default aggregation spec for arbitrary data.
 * - groupBy: prefer categorical columns closest to "sweet spot" cardinality
 *   (~8 distinct values) over high-cardinality identifiers.
 * - aggFn: count (always safe, always available)
 * - aggCol: null
 */
export function autoAggSpec(data: Record<string, unknown>[]): AggSpec {
  const meta = analyzeCols(data);
  const candidates = meta
    .filter(
      (m) =>
        (m.kind === "string" || m.kind === "boolean" || m.looksLikeDate) &&
        m.cardinality >= 2 &&
        m.cardinality <= Math.min(50, data.length),
    )
    .map((m) => ({
      ...m,
      // Score: prefer 4..15 distinct values. Penalize very high cardinality.
      score:
        m.cardinality <= 3
          ? 10 - m.cardinality // 2→8, 3→7 (small but ok)
          : m.cardinality <= 15
            ? 100 - Math.abs(m.cardinality - 8) // ideal range
            : 40 - Math.min(m.cardinality, 50), // falls off fast
    }))
    .sort((a, b) => b.score - a.score);

  return {
    groupBy: candidates[0]?.name ?? null,
    aggFn: "count",
    aggCol: null,
    topN: 20,
  };
}

export function aggregate(
  data: Record<string, unknown>[],
  spec: AggSpec,
): Record<string, unknown>[] {
  if (!spec.groupBy) return data;
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of data) {
    const key = String(row[spec.groupBy] ?? "(null)");
    const arr = groups.get(key);
    if (arr) arr.push(row);
    else groups.set(key, [row]);
  }
  const out: Record<string, unknown>[] = [];
  const valKey =
    spec.aggFn === "count"
      ? "count"
      : spec.aggCol
        ? `${spec.aggFn}_${spec.aggCol}`
        : null;
  if (!valKey) return data;
  for (const [key, rows] of groups) {
    const obj: Record<string, unknown> = { [spec.groupBy]: key };
    if (spec.aggFn === "count") {
      obj[valKey] = rows.length;
    } else if (spec.aggCol) {
      const vals = rows
        .map((r) => r[spec.aggCol as string])
        .filter((v): v is number => typeof v === "number");
      if (!vals.length) continue;
      const sum = vals.reduce((a, b) => a + b, 0);
      const v =
        spec.aggFn === "sum"
          ? sum
          : spec.aggFn === "avg"
            ? sum / vals.length
            : spec.aggFn === "min"
              ? Math.min(...vals)
              : Math.max(...vals);
      // Round avg to 2 decimals for display, keep others precise
      obj[valKey] = spec.aggFn === "avg" ? Math.round(v * 100) / 100 : v;
    }
    out.push(obj);
  }
  // Sort desc by agg value, limit top N
  out.sort((a, b) => (Number(b[valKey]) || 0) - (Number(a[valKey]) || 0));
  return out.slice(0, spec.topN);
}

// ---------------------------------------------------------------------------
// Bar / Line / Area / Pie
// ---------------------------------------------------------------------------

export function ChartBarViz({
  data,
  height = 300,
}: {
  data: Record<string, unknown>[];
  height?: number;
}) {
  const { label, numerics } = useMemo(() => detectCols(data), [data]);
  const colors = getPalette();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle)"
          vertical={false}
        />
        <XAxis
          dataKey={label}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle()}
          cursor={{
            fill: "color-mix(in oklch, var(--brand-500) 10%, transparent)",
          }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
        />
        {numerics.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            fill={colors[i % colors.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartLineViz({
  data,
  height = 300,
}: {
  data: Record<string, unknown>[];
  height?: number;
}) {
  const { label, numerics } = useMemo(() => detectCols(data), [data]);
  const colors = getPalette();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 12, right: 16, bottom: 4, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border-subtle)"
          vertical={false}
        />
        <XAxis
          dataKey={label}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={tooltipStyle()} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
        />
        {numerics.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={colors[i % colors.length]}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: colors[i % colors.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaViz({
  data,
  height = 160,
  dataKey,
}: {
  data: Record<string, unknown>[];
  height?: number;
  dataKey?: string;
}) {
  const { label, numerics } = useMemo(() => detectCols(data), [data]);
  const colors = getPalette();
  const key = dataKey || numerics[0];
  if (!key) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="viz-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors[0]} stopOpacity={0.4} />
            <stop offset="100%" stopColor={colors[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey={label}
          tick={{ fill: "var(--text-faint)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip contentStyle={tooltipStyle()} />
        <Area
          type="monotone"
          dataKey={key}
          stroke={colors[0]}
          strokeWidth={2}
          fill="url(#viz-area-grad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ChartPieViz({
  data,
  height = 300,
}: {
  data: Record<string, unknown>[];
  height?: number;
}) {
  const { label, numerics } = useMemo(() => detectCols(data), [data]);
  const colors = getPalette();
  const valueKey = numerics[0];
  if (!valueKey) return <DataTable data={data} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={label}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={110}
          paddingAngle={2}
          label={({ name, percent }) =>
            `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={colors[i % colors.length]}
              stroke="var(--bg)"
              strokeWidth={2}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle()} />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function DataTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return null;
  const cols = Object.keys(data[0]);
  return (
    <div
      style={{
        overflow: "auto",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-md)",
      }}
    >
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr style={{ background: "var(--bg-elev-2)" }}>
            {cols.map((c) => (
              <th
                key={c}
                className="mono"
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  fontWeight: 500,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "1px solid var(--border-subtle)",
                  whiteSpace: "nowrap",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              {cols.map((c) => {
                const v = row[c];
                const isNum = typeof v === "number";
                return (
                  <td
                    key={c}
                    className={isNum ? "mono tnum" : ""}
                    style={{
                      padding: "8px 12px",
                      color: isNum ? "var(--text-strong)" : "var(--text)",
                      textAlign: isNum ? "right" : "left",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {v == null ? (
                      <span
                        style={{
                          color: "var(--text-faint)",
                          fontStyle: "italic",
                        }}
                      >
                        NULL
                      </span>
                    ) : (
                      String(v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Number — first stat brand-highlighted
// ---------------------------------------------------------------------------

export function NumberCard({ data }: { data: Record<string, unknown>[] }) {
  const row = data[0] ?? {};
  const entries = Object.entries(row);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {entries.map(([k, v], i) => (
        <div
          key={k}
          style={{
            flex: "1 1 160px",
            padding: "20px 24px",
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--r-md)",
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              marginBottom: 6,
            }}
          >
            {k}
          </div>
          <div
            className="mono tnum"
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: i === 0 ? "var(--brand-500)" : "var(--text-strong)",
              lineHeight: 1.1,
            }}
          >
            {v != null ? String(v) : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viz hint → component map
// ---------------------------------------------------------------------------

// gantt/radar are routed to dedicated GanttBlock/RadarBlock at the ReportContainer level
// and never reach SwitchableViz. Mapped here only to satisfy Record<VizHint, _> exhaustiveness.
export const VIZ_MAP: Record<
  VizHint,
  React.FC<{ data: Record<string, unknown>[] }>
> = {
  bar_chart: ChartBarViz,
  line_chart: ChartLineViz,
  pie_chart: ChartPieViz,
  table: DataTable,
  number: NumberCard,
  gantt: ChartBarViz,
  radar: ChartBarViz,
};

export const VIZ_ICON_MAP: Record<VizHint, string> = {
  bar_chart: "▊",
  line_chart: "∿",
  pie_chart: "◕",
  table: "⊞",
  number: "#",
  gantt: "▥",
  radar: "◎",
};

const VIZ_LABELS: Record<VizHint, string> = {
  bar_chart: "Bar",
  line_chart: "Line",
  pie_chart: "Pie",
  table: "Table",
  number: "Number",
  gantt: "Gantt",
  radar: "Radar",
};

function iconFor(hint: VizHint) {
  switch (hint) {
    case "bar_chart":
      return <IconBar />;
    case "line_chart":
      return <IconLine />;
    case "pie_chart":
      return <IconPie />;
    case "table":
      return <IconTable />;
    case "number":
      return <IconHash />;
    case "gantt":
    case "radar":
      return <IconBar />;
  }
}

// ---------------------------------------------------------------------------
// Drilldown modal
// ---------------------------------------------------------------------------

function IconExpand() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1={21} y1={3} x2={14} y2={10} />
      <line x1={3} y1={21} x2={10} y2={14} />
    </svg>
  );
}

interface StatSummary {
  min: number;
  max: number;
  avg: number;
  sum: number;
}

function vizStats(
  data: Record<string, unknown>[],
): Record<string, StatSummary> | null {
  if (!data.length) return null;
  const { numerics } = detectCols(data);
  const out: Record<string, StatSummary> = {};
  for (const k of numerics) {
    const vals = data
      .map((r) => r[k])
      .filter((v): v is number => typeof v === "number");
    if (!vals.length) continue;
    const sum = vals.reduce((a, b) => a + b, 0);
    out[k] = {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: sum / vals.length,
      sum,
    };
  }
  return out;
}

function exportCSV(data: Record<string, unknown>[]) {
  if (!data.length) return;
  const cols = Object.keys(data[0]);
  const rows = [
    cols.join(","),
    ...data.map((r) =>
      cols.map((c) => JSON.stringify(r[c] ?? "")).join(","),
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "losszero-export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function DrilldownModal({
  data,
  hint: initialHint,
  onClose,
  title,
}: {
  data: Record<string, unknown>[];
  hint: VizHint;
  onClose: () => void;
  title?: string;
}) {
  const [hint, setHint] = useState<VizHint>(initialHint);
  const applicable = useMemo(() => getApplicableHints(data), [data]);
  const Viz = VIZ_MAP[hint] || DataTable;
  const stats = useMemo(() => vizStats(data), [data]);
  const showRawData = hint !== "table" && hint !== "number";

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fade-in viz-root"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "color-mix(in oklch, var(--bg) 70%, transparent)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 1200,
          height: "88vh",
          background: "var(--bg-elev-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              DRILLDOWN · {data.length} rows
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-strong)",
                marginTop: 2,
              }}
            >
              {title || "결과 상세"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => exportCSV(data)}
              className="focus-ring"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                background: "var(--bg-elev-2)",
              }}
            >
              <IconDownload /> CSV
            </button>
            <button
              onClick={onClose}
              className="focus-ring"
              title="닫기 (Esc)"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-elev-2)",
              }}
            >
              <IconClose />
            </button>
          </div>
        </div>

        {stats && Object.keys(stats).length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 24,
              padding: "12px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-elev-2)",
              overflowX: "auto",
            }}
          >
            {Object.entries(stats).map(([k, s]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: "var(--text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {k}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span
                    className="mono tnum"
                    style={{ fontSize: 12, color: "var(--text-muted)" }}
                  >
                    min{" "}
                    <strong style={{ color: "var(--text-strong)" }}>
                      {s.min.toFixed(2)}
                    </strong>
                  </span>
                  <span
                    className="mono tnum"
                    style={{ fontSize: 12, color: "var(--text-muted)" }}
                  >
                    max{" "}
                    <strong style={{ color: "var(--text-strong)" }}>
                      {s.max.toFixed(2)}
                    </strong>
                  </span>
                  <span
                    className="mono tnum"
                    style={{ fontSize: 12, color: "var(--text-muted)" }}
                  >
                    avg{" "}
                    <strong style={{ color: "var(--brand-500)" }}>
                      {s.avg.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Viz type switcher */}
        {applicable.length > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              flexWrap: "wrap",
            }}
          >
            {applicable.map((h) => {
              const active = hint === h;
              return (
                <button
                  key={h}
                  onClick={() => setHint(h)}
                  className="focus-ring"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: active ? "var(--brand-500)" : "var(--text-muted)",
                    background: active
                      ? "color-mix(in oklch, var(--brand-500) 12%, transparent)"
                      : "transparent",
                    border: `1px solid ${active ? "color-mix(in oklch, var(--brand-500) 35%, transparent)" : "var(--border-subtle)"}`,
                    borderRadius: 999,
                    transition: "all 140ms",
                  }}
                >
                  {iconFor(h)} <span>{VIZ_LABELS[h]}</span>
                </button>
              );
            })}
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <Viz data={data} />
          </div>
          {showRawData && (
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                RAW DATA
              </div>
              <DataTable data={data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aggregate panel — UI for spec selection
// ---------------------------------------------------------------------------

function AggregatePanel({
  data,
  spec,
  onChange,
}: {
  data: Record<string, unknown>[];
  spec: AggSpec;
  onChange: (s: AggSpec) => void;
}) {
  const meta = useMemo(() => analyzeCols(data), [data]);
  const groupOptions = meta.filter(
    (m) =>
      m.kind !== "number" &&
      m.cardinality >= 2 &&
      m.cardinality <= 100,
  );
  const numericOptions = meta.filter((m) => m.kind === "number");

  const selectStyle: CSSProperties = {
    padding: "4px 8px",
    fontSize: 11,
    background: "var(--bg-elev-2)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 6,
    color: "var(--text-strong)",
    fontFamily: "var(--font-sans)",
    outline: "none",
  };
  const labelStyle: CSSProperties = {
    fontSize: 10,
    color: "var(--text-faint)",
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Group by</span>
        <select
          value={spec.groupBy ?? ""}
          onChange={(e) =>
            onChange({ ...spec, groupBy: e.target.value || null })
          }
          style={selectStyle}
        >
          <option value="">(none · raw)</option>
          {groupOptions.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.cardinality})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Fn</span>
        <select
          value={spec.aggFn}
          onChange={(e) =>
            onChange({ ...spec, aggFn: e.target.value as AggFn })
          }
          style={selectStyle}
        >
          <option value="count">count</option>
          <option value="sum" disabled={!numericOptions.length}>sum</option>
          <option value="avg" disabled={!numericOptions.length}>avg</option>
          <option value="min" disabled={!numericOptions.length}>min</option>
          <option value="max" disabled={!numericOptions.length}>max</option>
        </select>
      </div>

      {spec.aggFn !== "count" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={labelStyle}>Col</span>
          <select
            value={spec.aggCol ?? ""}
            onChange={(e) =>
              onChange({ ...spec, aggCol: e.target.value || null })
            }
            style={selectStyle}
          >
            <option value="">—</option>
            {numericOptions.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Top</span>
        <select
          value={spec.topN}
          onChange={(e) =>
            onChange({ ...spec, topN: Number(e.target.value) })
          }
          style={selectStyle}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <span
        className="mono"
        style={{
          marginLeft: "auto",
          fontSize: 10,
          color: "var(--text-faint)",
        }}
      >
        {spec.groupBy
          ? `→ ${spec.aggFn}${spec.aggCol ? `(${spec.aggCol})` : "(*)"} by ${spec.groupBy}`
          : "raw (no grouping)"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SwitchableViz — pill tabs + Drilldown button + aggregate toggle
// ---------------------------------------------------------------------------

export function SwitchableViz({
  data,
  initialHint,
  title,
}: {
  data: Record<string, unknown>[];
  initialHint: VizHint;
  title?: string;
}) {
  const [hint, setHint] = useState<VizHint>(initialHint);
  const [drill, setDrill] = useState(false);
  const [aggOn, setAggOn] = useState(false);
  const [aggSpec, setAggSpec] = useState<AggSpec>(() => autoAggSpec(data));
  // When aggregation is on AND a groupBy is chosen, use aggregated rows
  const displayData = useMemo(
    () => (aggOn && aggSpec.groupBy ? aggregate(data, aggSpec) : data),
    [data, aggOn, aggSpec],
  );
  const applicable = useMemo(
    () => getApplicableHints(displayData),
    [displayData],
  );
  const Viz = VIZ_MAP[hint] ?? DataTable;

  // When user switches to a chart type for the first time, auto-enable
  // aggregation if raw data has no numerics or too many rows for a chart.
  useEffect(() => {
    if (hint === "table") return;
    if (aggOn) return;
    const { numerics } = detectCols(data);
    const needsAgg = data.length > 20 || numerics.length === 0;
    if (needsAgg && aggSpec.groupBy) setAggOn(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint]);

  return (
    <div className="fade-in">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        {applicable.length > 1 &&
          applicable.map((h) => {
            const active = hint === h;
            return (
              <button
                key={h}
                onClick={() => setHint(h)}
                className="focus-ring"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: active ? "var(--brand-500)" : "var(--text-muted)",
                  background: active
                    ? "color-mix(in oklch, var(--brand-500) 12%, transparent)"
                    : "transparent",
                  border: `1px solid ${active ? "color-mix(in oklch, var(--brand-500) 35%, transparent)" : "var(--border-subtle)"}`,
                  borderRadius: 999,
                  transition: "all 140ms",
                }}
              >
                {iconFor(h)} <span>{VIZ_LABELS[h]}</span>
              </button>
            );
          })}
        <button
          onClick={() => setAggOn((v) => !v)}
          className="focus-ring"
          title="집계 (Group by / aggregate)"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 500,
            color: aggOn ? "var(--brand-500)" : "var(--text-muted)",
            background: aggOn
              ? "color-mix(in oklch, var(--brand-500) 12%, transparent)"
              : "transparent",
            border: `1px solid ${aggOn ? "color-mix(in oklch, var(--brand-500) 35%, transparent)" : "var(--border-subtle)"}`,
            borderRadius: 999,
            transition: "all 140ms",
          }}
        >
          <span className="mono">Σ</span> <span>집계</span>
        </button>
        <button
          onClick={() => setDrill(true)}
          className="focus-ring"
          title="자세히 보기 (drilldown)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 999,
            transition: "all 140ms",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--brand-500)";
            e.currentTarget.style.borderColor =
              "color-mix(in oklch, var(--brand-500) 35%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        >
          <IconExpand /> <span>Drilldown</span>
        </button>
      </div>
      {aggOn && (
        <AggregatePanel data={data} spec={aggSpec} onChange={setAggSpec} />
      )}
      <Viz data={displayData} />
      {drill && (
        <DrilldownModal
          data={displayData}
          hint={hint}
          title={title}
          onClose={() => setDrill(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline viz — for chat bubble embedding
// ---------------------------------------------------------------------------

export function InlineViz({
  data,
  vizHint,
}: {
  data: Record<string, unknown>[];
  vizHint: VizHint;
}) {
  if (!data.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <SwitchableViz data={data} initialHint={vizHint} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VizPanel (standalone) — backward compat
// ---------------------------------------------------------------------------

interface VizPanelProps {
  finalEvent: FinalEvent | null;
}

export default function VizPanel({ finalEvent }: VizPanelProps) {
  if (!finalEvent?.data?.length) return null;
  return (
    <div
      className="card"
      style={{ padding: 16 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <h3
          className="mono"
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-faint)",
          }}
        >
          Result
        </h3>
        <span
          className="mono"
          style={{
            padding: "2px 8px",
            fontSize: 11,
            background: "var(--bg-elev-2)",
            color: "var(--text-muted)",
            borderRadius: 999,
          }}
        >
          {finalEvent.viz_hint} · {finalEvent.data.length} rows
        </span>
      </div>
      <SwitchableViz data={finalEvent.data} initialHint={finalEvent.viz_hint} />
    </div>
  );
}
