import type { ReportBlock, DataRef } from "../../types/report";
import { BlockHeader, ColorDot } from "./_atoms";

type ChartBlockType = Extract<ReportBlock, { type: "chart" }>;

interface Props {
  block: ChartBlockType;
  dataRef: DataRef | undefined;
}

interface Row {
  label: string;
  group?: string;
  start: number; // hour-of-day, fractional
  end: number;
  startLabel: string;
  endLabel: string;
}

const HOUR_START = 7;
const HOUR_END = 22;
const HOURS = HOUR_END - HOUR_START;

const TEAM_HUES = [230, 150, 340, 60, 295, 200];

function parseT(t: unknown): { value: number; label: string } | null {
  if (typeof t !== "string") return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return { value: h + min / 60, label: `${m[1].padStart(2, "0")}:${m[2]}` };
}

function rowsFrom(
  dataRef: DataRef | undefined,
  fields: { label: string; start: string; end: string; group?: string },
): Row[] {
  if (!dataRef || dataRef.mode !== "embed") return [];
  const out: Row[] = [];
  for (const r of dataRef.rows) {
    const start = parseT(r[fields.start]);
    const end = parseT(r[fields.end]);
    if (!start || !end) continue;
    out.push({
      label: String(r[fields.label] ?? ""),
      group: fields.group ? String(r[fields.group] ?? "") : undefined,
      start: start.value,
      end: end.value,
      startLabel: start.label,
      endLabel: end.label,
    });
  }
  return out;
}

export function GanttBlock({ block, dataRef }: Props) {
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
        gantt block references data_ref={block.data_ref} which does not exist
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

  const labelKey = block.x ?? "label";
  const startKey = Array.isArray(block.y) ? block.y[0] : (block.y ?? "start");
  const endKey = Array.isArray(block.y) ? (block.y[1] ?? "end") : "end";
  const groupKey = block.group_by;

  const rows = rowsFrom(dataRef, {
    label: labelKey,
    start: startKey,
    end: endKey,
    group: groupKey,
  });

  const groupColor = new Map<string, string>();
  let hueIdx = 0;
  for (const r of rows) {
    if (r.group && !groupColor.has(r.group)) {
      groupColor.set(r.group, `oklch(0.74 0.13 ${TEAM_HUES[hueIdx % TEAM_HUES.length]})`);
      hueIdx++;
    }
  }

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <BlockHeader title={block.title ?? "Gantt"} />

      {/* Hour ruler */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "92px 1fr",
          gap: 12,
          marginBottom: 4,
        }}
      >
        <div />
        <div
          className="mono"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${HOURS + 1}, 1fr)`,
            fontSize: 10,
            color: "var(--text-faint)",
          }}
        >
          {Array.from({ length: HOURS + 1 }).map((_, i) => (
            <span key={i} style={{ textAlign: "left" }}>
              {HOUR_START + i}시
            </span>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => {
          const left = Math.max(0, ((r.start - HOUR_START) / HOURS) * 100);
          const width = Math.max(0.5, ((r.end - r.start) / HOURS) * 100);
          const color =
            (r.group && groupColor.get(r.group)) || "var(--brand-500)";
          return (
            <div
              key={`${r.label}-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "92px 1fr",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 4,
                    height: 22,
                    borderRadius: 2,
                    background: color,
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-strong)",
                    }}
                  >
                    {r.label}
                  </span>
                  {r.group && (
                    <span
                      className="mono"
                      style={{ fontSize: 9, color: "var(--text-faint)" }}
                    >
                      {r.group}
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  position: "relative",
                  height: 26,
                  background:
                    "color-mix(in oklch, var(--bg) 60%, var(--bg-elev-1))",
                  borderRadius: 6,
                  backgroundImage:
                    "linear-gradient(to right, var(--border-subtle) 1px, transparent 1px)",
                  backgroundSize: `${100 / HOURS}% 100%`,
                }}
              >
                <div
                  className="mono tnum"
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: 3,
                    bottom: 3,
                    background: `color-mix(in oklch, ${color} 55%, transparent)`,
                    border: `1px solid ${color}`,
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-strong)",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {r.startLabel} – {r.endLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {groupColor.size > 0 && (
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginTop: "var(--space-3)",
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          {Array.from(groupColor.entries()).map(([group, c]) => (
            <div
              key={group}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <ColorDot color={c} size={9} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {group}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
