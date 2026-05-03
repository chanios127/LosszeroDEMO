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
  const s = t.trim();
  if (!s) return null;

  // Reject SQL DATETIME with zero time — '2026-04-30 00:00:00' or '2026-04-30T00:00:00'.
  // The hh:mm:ss being all zero means the source column was date-only and
  // the time portion is meaningless; skip rather than render at midnight.
  if (/\d{4}-\d{2}-\d{2}/.test(s) && /00:00(:00)?/.test(s) &&
      !/\b([01]?\d|2[0-3]):([0-5]?\d)\b/.test(s.replace(/00:00(:00)?/, ""))) {
    return null;
  }

  // HH:MM[:SS] (with colon)
  const mc = s.match(/(\d{1,2}):(\d{2})/);
  if (mc) {
    const h = Number(mc[1]);
    const min = Number(mc[2]);
    if (Number.isFinite(h) && Number.isFinite(min)) {
      return { value: h + min / 60, label: `${String(h).padStart(2, "0")}:${mc[2]}` };
    }
  }
  // HHMMSS (6 digits, no colon — common from SQL char(6) columns)
  const m6 = s.match(/^(\d{2})(\d{2})\d{2}$/);
  if (m6) {
    const h = Number(m6[1]);
    const min = Number(m6[2]);
    if (Number.isFinite(h) && Number.isFinite(min)) {
      return { value: h + min / 60, label: `${m6[1]}:${m6[2]}` };
    }
  }
  // HHMM (4 digits)
  const m4 = s.match(/^(\d{2})(\d{2})$/);
  if (m4) {
    const h = Number(m4[1]);
    const min = Number(m4[2]);
    if (Number.isFinite(h) && Number.isFinite(min)) {
      return { value: h + min / 60, label: `${m4[1]}:${m4[2]}` };
    }
  }
  return null;
}

// Anchor mode: when only a single time column is provided (clock-in / event time),
// render a small marker spanning ANCHOR_SPAN_HOURS for visibility.
const ANCHOR_SPAN_HOURS = 0.25; // 15 minutes

// Greedy lane allocation so chips at adjacent times don't visually overlap.
// Each lane = a stacked vertical row inside the bucket. Returns the lane
// index assigned to each member (0-based).
//
// minSpacingHours: time-equivalent of estimated chip width. Anchor chips
// show just the Korean name (~3 chars + padding ≈ 60-70px). On a
// 7~22시(15h) canvas where 1h ≈ 6.7% width, a 60px chip on a 1000px-wide
// canvas takes ~6%, i.e. ~0.9h time-equivalent. Use 1.0h to leave margin.
function assignLanes(members: Row[], minSpacingHours = 1.0): number[] {
  const laneEnds: number[] = [];
  const out: number[] = [];
  for (const m of members) {
    let lane = laneEnds.findIndex((end) => m.start - end >= minSpacingHours);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(m.start);
    } else {
      laneEnds[lane] = m.start;
    }
    out.push(lane);
  }
  return out;
}

function AnchorRow({
  label,
  color,
  members,
}: {
  label: string;
  color: string;
  members: Row[];
}) {
  const lanes = assignLanes(members);
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
  const rowHeight = Math.max(36, 16 + laneCount * 22);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        alignItems: "stretch",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
        <span
          style={{
            width: 4,
            height: 22,
            borderRadius: 2,
            background: color,
            flexShrink: 0,
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
            {label}
          </span>
          <span
            className="mono"
            style={{ fontSize: 9, color: "var(--text-faint)" }}
          >
            {members.length}명
          </span>
        </div>
      </div>
      <div
        style={{
          position: "relative",
          height: rowHeight,
          background:
            "color-mix(in oklch, var(--bg) 60%, var(--bg-elev-1))",
          borderRadius: 6,
          backgroundImage:
            "linear-gradient(to right, var(--border-subtle) 1px, transparent 1px)",
          backgroundSize: `${100 / HOURS}% 100%`,
        }}
      >
        {members.map((m, idx) => {
          const left = Math.max(0, ((m.start - HOUR_START) / HOURS) * 100);
          const lane = lanes[idx];
          return (
            <div
              key={`${m.label}-${idx}`}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: 4 + lane * 22,
                transform: "translateX(-2px)",
                padding: "2px 7px",
                background: `color-mix(in oklch, ${color} 28%, var(--bg-elev-1))`,
                border: `1px solid ${color}`,
                borderRadius: 4,
                color: "var(--text-strong)",
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}
              title={`${m.label} · ${m.startLabel}`}
            >
              {m.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function rowsFrom(
  dataRef: DataRef | undefined,
  fields: { label: string; start: string; end?: string | null; group?: string },
): Row[] {
  if (!dataRef || dataRef.mode !== "embed") return [];
  const isSpan = !!fields.end;
  const out: Row[] = [];
  for (const r of dataRef.rows) {
    const start = parseT(r[fields.start]);
    if (!start) continue;
    let endValue: number;
    let endLabel: string;
    if (isSpan && fields.end) {
      const end = parseT(r[fields.end]);
      if (!end) continue;
      endValue = end.value;
      endLabel = end.label;
    } else {
      endValue = start.value + ANCHOR_SPAN_HOURS;
      endLabel = "";
    }
    out.push({
      label: String(r[fields.label] ?? ""),
      group: fields.group ? String(r[fields.group] ?? "") : undefined,
      start: start.value,
      end: endValue,
      startLabel: start.label,
      endLabel,
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
  // y as array → span (start, end). y as single string → anchor mode (clock-in).
  // group_by stays a separate axis for color grouping (NOT misused as end-time).
  const yIsArray = Array.isArray(block.y);
  const startKey: string = yIsArray
    ? (block.y as string[])[0]
    : ((block.y as string | undefined) ?? "start");
  const endKey: string | null = yIsArray
    ? ((block.y as string[])[1] ?? null)
    : null;
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

  // Anchor mode: collapse to one row per group (or single "전체" row when no
  // useful group_by). Members render as compact name chips along the time axis.
  // High-cardinality group_by (>8 unique values) means it's not actually a
  // category — we collapse to single row and ignore it.
  const useGroupedAnchor =
    !yIsArray &&
    rows.length > 0 &&
    (groupColor.size === 0 || groupColor.size > 8
      ? false
      : Array.from(groupColor.keys()).every((k) => k.length > 0));

  type GroupBucket = { key: string; color: string; members: Row[] };
  const groupBuckets: GroupBucket[] = (() => {
    if (yIsArray) return [];
    if (!useGroupedAnchor) {
      return [
        {
          key: "전체",
          color: "var(--brand-500)",
          members: [...rows].sort((a, b) => a.start - b.start),
        },
      ];
    }
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.group ?? "(미분류)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([key, members]) => ({
      key,
      color: groupColor.get(key) ?? "var(--brand-500)",
      members: members.sort((a, b) => a.start - b.start),
    }));
  })();

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <BlockHeader title={block.title ?? "Gantt"} />

      {/* Hour ruler */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr",
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
        {!yIsArray
          ? // ── ANCHOR MODE: 1 row per group, members rendered as chips ──
            groupBuckets.map((bucket) => (
              <AnchorRow
                key={bucket.key}
                label={bucket.key}
                color={bucket.color}
                members={bucket.members}
              />
            ))
          : // ── SPAN MODE: 1 row per entity ──
            rows.map((r, i) => {
              const left = Math.max(0, ((r.start - HOUR_START) / HOURS) * 100);
              const width = Math.max(0.5, ((r.end - r.start) / HOURS) * 100);
              const color =
                (r.group && groupColor.get(r.group)) || "var(--brand-500)";
              return (
                <div
                  key={`${r.label}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr",
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
                      {r.endLabel ? `${r.startLabel} – ${r.endLabel}` : r.startLabel}
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
