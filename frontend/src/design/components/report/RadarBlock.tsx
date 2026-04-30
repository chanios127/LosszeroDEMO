import type { ReportBlock, DataRef } from "../../types/report";
import { BlockHeader, ColorDot } from "./_atoms";

type ChartBlockType = Extract<ReportBlock, { type: "chart" }>;

interface Props {
  block: ChartBlockType;
  dataRef: DataRef | undefined;
}

interface Series {
  name: string;
  values: number[];
  color: string;
}

const SERIES_COLORS = [
  "var(--chart-default-1)",
  "var(--chart-default-3)",
  "var(--chart-default-5)",
  "var(--chart-default-2)",
  "var(--chart-default-4)",
  "var(--chart-default-6)",
];

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function buildSeries(
  dataRef: DataRef,
  categoryKey: string,
  valueKey: string | string[],
  groupKey: string | undefined,
): { categories: string[]; series: Series[] } {
  if (dataRef.mode !== "embed") {
    return { categories: [], series: [] };
  }
  const valueKeys = Array.isArray(valueKey) ? valueKey : [valueKey];

  if (groupKey) {
    const categories = Array.from(
      new Set(dataRef.rows.map((r) => String(r[categoryKey] ?? ""))),
    );
    const groups = new Map<string, Map<string, number>>();
    for (const r of dataRef.rows) {
      const g = String(r[groupKey] ?? "");
      const c = String(r[categoryKey] ?? "");
      const v = asNumber(r[valueKeys[0]]);
      if (!groups.has(g)) groups.set(g, new Map());
      groups.get(g)!.set(c, v);
    }
    const series: Series[] = [];
    let i = 0;
    for (const [name, byCat] of groups) {
      series.push({
        name,
        values: categories.map((c) => byCat.get(c) ?? 0),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      });
      i++;
    }
    return { categories, series };
  }

  // No group_by: each value column is its own series
  const categories = dataRef.rows.map((r) => String(r[categoryKey] ?? ""));
  const series: Series[] = valueKeys.map((k, i) => ({
    name: k,
    values: dataRef.rows.map((r) => asNumber(r[k])),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));
  return { categories, series };
}

export function RadarBlock({ block, dataRef }: Props) {
  if (!dataRef) {
    return (
      <div
        className="card"
        style={{
          padding: "var(--space-5)",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        radar block references data_ref={block.data_ref} which does not exist
      </div>
    );
  }
  if (dataRef.mode === "ref") {
    return (
      <div
        className="card"
        style={{
          padding: "var(--space-5)",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        data hydrate pending — ref_id={dataRef.ref_id}, rows={dataRef.row_count}
      </div>
    );
  }

  const categoryKey = block.x ?? "category";
  const valueKey = block.y ?? "value";
  const { categories, series } = buildSeries(
    dataRef,
    categoryKey,
    valueKey,
    block.group_by,
  );

  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 28;
  const n = categories.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));

  const pointAt = (i: number, v: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (v / max) * r;
    return [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];
  };
  const ringRadii = [0.25, 0.5, 0.75, 1].map((p) => r * p);

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <BlockHeader title={block.title ?? "Radar"} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${size}px 1fr`,
          gap: "var(--space-4)",
          alignItems: "center",
        }}
      >
        <svg width={size} height={size} style={{ overflow: "visible" }}>
          {ringRadii.map((rr, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={rr}
              fill="none"
              stroke="var(--border-subtle)"
              strokeDasharray={i === ringRadii.length - 1 ? "none" : "2 3"}
            />
          ))}
          {categories.map((cat, i) => {
            const [x, y] = pointAt(i, max);
            const [lx, ly] = pointAt(i, max * 1.15);
            return (
              <g key={cat + i}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke="var(--border-subtle)"
                />
                <text
                  x={lx}
                  y={ly}
                  fill="var(--text-muted)"
                  fontSize="10"
                  textAnchor={lx < cx - 2 ? "end" : lx > cx + 2 ? "start" : "middle"}
                  dominantBaseline="central"
                >
                  {cat}
                </text>
              </g>
            );
          })}
          {series.map((s) => {
            const points = s.values
              .map((v, i) => pointAt(i, v).join(","))
              .join(" ");
            return (
              <g key={s.name}>
                <polygon
                  points={points}
                  fill={s.color}
                  fillOpacity={0.15}
                  stroke={s.color}
                  strokeWidth={1.5}
                />
                {s.values.map((v, i) => {
                  const [x, y] = pointAt(i, v);
                  return (
                    <circle key={i} cx={x} cy={y} r={2.5} fill={s.color} />
                  );
                })}
              </g>
            );
          })}
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {series.map((s) => (
            <div
              key={s.name}
              className="card"
              style={{
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <ColorDot color={s.color} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-strong)",
                  }}
                >
                  {s.name}
                </span>
              </div>
              <div
                className="mono tnum"
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {s.values.map((v, i) => (
                  <span key={i}>
                    {(categories[i] ?? "").slice(0, 2)} {v}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
