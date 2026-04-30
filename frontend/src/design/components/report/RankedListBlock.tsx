import type { ReportBlock, DataRef, RankedRow } from "../../types/report";
import { BlockHeader, ColorDot, Tag } from "./_atoms";

type RankedListBlockType = Extract<ReportBlock, { type: "ranked_list" }>;

interface Props {
  block: RankedListBlockType;
  dataRef: DataRef | undefined;
}

const RANK_COLORS = ["var(--brand-300)", "var(--brand-400)", "var(--brand-500)"];

function RankBadge({ rank, highlighted }: { rank: number; highlighted: boolean }) {
  const color = RANK_COLORS[Math.min(rank - 1, 2)];
  const bg = highlighted
    ? `color-mix(in oklch, ${color} 22%, transparent)`
    : "var(--bg-elev-2)";
  const fg = highlighted ? "var(--brand-200)" : "var(--text-muted)";
  return (
    <span
      className="mono tnum"
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        display: "grid",
        placeItems: "center",
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {rank}
    </span>
  );
}

function RankRow({
  row,
  rank,
  highlighted,
}: {
  row: RankedRow;
  rank: number;
  highlighted: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto auto 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderBottom: "1px solid var(--border-subtle)",
        background: highlighted
          ? "color-mix(in oklch, var(--brand-500) 5%, transparent)"
          : "transparent",
      }}
    >
      <RankBadge rank={rank} highlighted={highlighted} />
      {row.color_dot ? <ColorDot color={row.color_dot} /> : <span />}
      <div
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-strong)",
            }}
          >
            {row.name}
          </span>
          {row.secondary && (
            <span
              className="mono tnum"
              style={{ fontSize: 11, color: "var(--text-muted)" }}
            >
              {row.secondary}
            </span>
          )}
        </div>
        {row.tags && row.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {row.tags.map((t, i) => (
              <Tag key={i} hue={(i * 60 + 180) % 360}>
                {t}
              </Tag>
            ))}
          </div>
        )}
      </div>
      <span
        className="tnum"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-strong)",
          textAlign: "right",
        }}
      >
        {row.primary}
      </span>
    </div>
  );
}

function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function rowsFromDataRef(
  dataRef: DataRef | undefined,
  fields: RankedListBlockType["fields"],
): RankedRow[] {
  if (!dataRef || dataRef.mode !== "embed") return [];
  return dataRef.rows.map((r) => {
    const tagsRaw = fields.tags ? r[fields.tags] : undefined;
    const tags = Array.isArray(tagsRaw)
      ? (tagsRaw.filter((t) => typeof t === "string") as string[])
      : typeof tagsRaw === "string"
        ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    const primaryRaw = r[fields.primary];
    return {
      name: asString(r[fields.name]) ?? "",
      primary:
        typeof primaryRaw === "number"
          ? primaryRaw
          : (asString(primaryRaw) ?? ""),
      secondary: fields.secondary ? asString(r[fields.secondary]) : undefined,
      tags,
      color_dot: fields.color_dot ? asString(r[fields.color_dot]) : undefined,
    };
  });
}

export function RankedListBlock({ block, dataRef }: Props) {
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
        ranked_list block references data_ref={block.data_ref} which does not exist
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

  const rows = rowsFromDataRef(dataRef, block.fields);
  const limit = block.limit ?? rows.length;
  const highlightTop = block.highlight_top ?? 0;
  const display = rows.slice(0, limit);

  return (
    <div className="card" style={{ padding: "var(--space-4)", paddingBottom: 0 }}>
      <BlockHeader
        title={block.title ?? ""}
        right={
          block.subtitle ? (
            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--text-faint)" }}
            >
              {block.subtitle}
            </span>
          ) : undefined
        }
      />
      <div style={{ marginLeft: -12, marginRight: -12 }}>
        {display.map((r, i) => (
          <RankRow key={i} row={r} rank={i + 1} highlighted={i < highlightTop} />
        ))}
      </div>
    </div>
  );
}
