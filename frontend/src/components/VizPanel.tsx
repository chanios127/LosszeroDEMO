import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";
import type { FinalEvent, VizHint } from "../types/events";

const COLORS = [
  "#0ea5e9",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#fb923c",
  "#818cf8",
];

export const VIZ_ICON_MAP: Record<VizHint, string> = {
  bar_chart: "▊",
  line_chart: "∿",
  pie_chart: "◕",
  table: "⊞",
  number: "#",
};

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------
function DataTable({ data }: { data: Record<string, unknown>[] }) {
  const columns = Object.keys(data[0] ?? {});
  return (
    <div className="overflow-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800 text-xs uppercase text-slate-400">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr
              key={ri}
              className="border-t border-slate-800 hover:bg-slate-800/50"
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className="px-4 py-2 whitespace-nowrap text-slate-300"
                >
                  {row[col] == null ? (
                    <span className="text-slate-600 italic">NULL</span>
                  ) : (
                    String(row[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NumberCard
// ---------------------------------------------------------------------------
function NumberCard({ data }: { data: Record<string, unknown>[] }) {
  const row = data[0] ?? {};
  const entries = Object.entries(row);
  return (
    <div className="flex flex-wrap gap-4">
      {entries.map(([key, val]) => (
        <div
          key={key}
          className="flex flex-col items-center rounded-lg border border-slate-800 bg-slate-900 px-8 py-6"
        >
          <span className="text-3xl font-bold text-brand-500">
            {val != null ? String(val) : "N/A"}
          </span>
          <span className="mt-1 text-xs text-slate-400">{key}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------
function detectColumns(data: Record<string, unknown>[]) {
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
  const { numerics } = detectColumns(data);
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

function ChartBarViz({ data }: { data: Record<string, unknown>[] }) {
  const { label, numerics } = useMemo(() => detectColumns(data), [data]);
  const [focusBar, setFocusBar] = useState<number | null>(null);
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey={label} tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
          }}
        />
        <Legend />
        {numerics.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={COLORS[i % COLORS.length]}
            onClick={(_d: unknown, idx: number) =>
              setFocusBar(idx === focusBar ? null : idx)
            }
            style={{ cursor: "pointer" }}
          >
            {data.map((_, rowIdx) => (
              <Cell
                key={rowIdx}
                fill={COLORS[i % COLORS.length]}
                opacity={focusBar === null || focusBar === rowIdx ? 1 : 0.35}
              />
            ))}
          </Bar>
        ))}
        <Brush
          dataKey={label}
          height={20}
          stroke="#334155"
          fill="#1e293b"
          travellerWidth={8}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartLineViz({ data }: { data: Record<string, unknown>[] }) {
  const { label, numerics } = useMemo(() => detectColumns(data), [data]);
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey={label} tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
          }}
        />
        <Legend />
        {numerics.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        ))}
        <Brush
          dataKey={label}
          height={20}
          stroke="#334155"
          fill="#1e293b"
          travellerWidth={8}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartPieViz({ data }: { data: Record<string, unknown>[] }) {
  const { label, numerics } = useMemo(() => detectColumns(data), [data]);
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);
  const valueKey = numerics[0];
  if (!valueKey) return <DataTable data={data} />;
  return (
    <ResponsiveContainer width="100%" height={360}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={label}
          cx="50%"
          cy="50%"
          outerRadius={130}
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
          onClick={(_d: unknown, idx: number) =>
            setActivePieIndex(idx === activePieIndex ? null : idx)
          }
          style={{ cursor: "pointer" }}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={COLORS[i % COLORS.length]}
              opacity={
                activePieIndex === null || activePieIndex === i ? 1 : 0.35
              }
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Shared exports
// ---------------------------------------------------------------------------

export const VIZ_MAP: Record<
  VizHint,
  React.FC<{ data: Record<string, unknown>[] }>
> = {
  bar_chart: ChartBarViz,
  line_chart: ChartLineViz,
  pie_chart: ChartPieViz,
  table: DataTable,
  number: NumberCard,
};

export { DataTable, NumberCard, ChartBarViz, ChartLineViz, ChartPieViz };

/** Visualization with chart type switcher. */
export function SwitchableViz({
  data,
  initialHint,
}: {
  data: Record<string, unknown>[];
  initialHint: VizHint;
}) {
  const [activeHint, setActiveHint] = useState<VizHint>(initialHint);
  const applicable = useMemo(() => getApplicableHints(data), [data]);
  const Viz = VIZ_MAP[activeHint] ?? DataTable;

  return (
    <div>
      {applicable.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {applicable.map((hint) => (
            <button
              key={hint}
              onClick={() => setActiveHint(hint)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors ${
                activeHint === hint
                  ? "border-brand-500 bg-brand-500/20 text-brand-500"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>{VIZ_ICON_MAP[hint]}</span>
              <span>
                {hint === "bar_chart"
                  ? "Bar"
                  : hint === "line_chart"
                    ? "Line"
                    : hint === "pie_chart"
                      ? "Pie"
                      : hint === "table"
                        ? "Table"
                        : "#"}
              </span>
            </button>
          ))}
        </div>
      )}
      <Viz data={data} />
    </div>
  );
}

/** Inline visualization for embedding in chat message bubbles. */
export function InlineViz({
  data,
  vizHint,
}: {
  data: Record<string, unknown>[];
  vizHint: VizHint;
}) {
  if (!data.length) return null;
  return (
    <div className="mt-3">
      <SwitchableViz data={data} initialHint={vizHint} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VizPanel (standalone, backward compat)
// ---------------------------------------------------------------------------
interface VizPanelProps {
  finalEvent: FinalEvent | null;
}

export default function VizPanel({ finalEvent }: VizPanelProps) {
  if (!finalEvent?.data?.length) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Result
        </h3>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          {finalEvent.viz_hint} / {finalEvent.data.length} rows
        </span>
      </div>
      <SwitchableViz data={finalEvent.data} initialHint={finalEvent.viz_hint} />

      {finalEvent.viz_hint !== "table" && finalEvent.viz_hint !== "number" && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
            Raw Data Table
          </summary>
          <div className="mt-2">
            <DataTable data={finalEvent.data} />
          </div>
        </details>
      )}
    </div>
  );
}
