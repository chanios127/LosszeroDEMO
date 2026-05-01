import type { ReportBlock, DataRef, BubbleCard } from "../../types/report";
import { BlockHeader, ColorDot, Tag } from "./_atoms";

type BubbleBreakdownBlockType = Extract<ReportBlock, { type: "bubble_breakdown" }>;

interface Props {
  block: BubbleBreakdownBlockType;
  dataRef: DataRef | undefined;
}

interface BubbleDatum {
  label: string;
  size: number;
  x: number;
  hue: number;
  count: number;
  tags: string[];
}

const HUE_STEPS = [230, 150, 25, 340, 60, 295, 200, 130, 90];

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function bubblesFromDataRef(
  dataRef: DataRef | undefined,
  bubble: BubbleBreakdownBlockType["bubble"],
): BubbleDatum[] {
  if (!dataRef || dataRef.mode !== "embed") return [];
  return dataRef.rows.map((r, i) => {
    const tagsRaw = r["tags"];
    const tags = Array.isArray(tagsRaw)
      ? (tagsRaw.filter((t) => typeof t === "string") as string[])
      : typeof tagsRaw === "string"
        ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const size = asNumber(r[bubble.size]);
    return {
      label: String(r[bubble.label] ?? ""),
      size,
      x: asNumber(r[bubble.x]),
      hue: HUE_STEPS[i % HUE_STEPS.length],
      count: size,
      tags,
    };
  });
}

function BubbleChart({ data }: { data: BubbleDatum[] }) {
  const maxSize = Math.max(1, ...data.map((d) => d.size));
  // Normalize raw `x` values to 12-88% of canvas so bubbles spread regardless
  // of whether the source column is a percentage (0-100) or a raw count.
  // Single-value or constant-x falls back to the column center.
  const xs = data.map((d) => d.x);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const xRange = xMax - xMin || 1;
  const projectX = (raw: number): number => 12 + ((raw - xMin) / xRange) * 76;
  return (
    <div
      className="card dot-bg"
      style={{
        position: "relative",
        height: 300,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: "16px 16px 28px 16px" }}>
        {[0, 25, 50, 75, 100].map((p) => (
          <div
            key={p}
            style={{
              position: "absolute",
              left: `${p}%`,
              top: 0,
              bottom: 0,
              borderLeft: "1px dashed var(--border-subtle)",
            }}
          />
        ))}
        {data.map((d, i) => {
          const r = 18 + Math.round((d.size / maxSize) * 28);
          const y = 25 + ((i * 19) % 55);
          const xPct = projectX(d.x);
          const color = `oklch(0.74 0.13 ${d.hue})`;
          return (
            <div
              key={d.label}
              style={{
                position: "absolute",
                left: `calc(${xPct}% - ${r}px)`,
                top: `calc(${y}% - ${r}px)`,
                width: r * 2,
                height: r * 2,
                borderRadius: "50%",
                background: `color-mix(in oklch, ${color} 35%, transparent)`,
                border: `1.5px solid ${color}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-strong)",
                fontSize: 11,
                fontWeight: 500,
                textAlign: "center",
                lineHeight: 1.15,
                padding: 4,
              }}
            >
              <span style={{ fontSize: Math.min(11, r / 4 + 6) }}>{d.label}</span>
              <span
                className="mono tnum"
                style={{ fontSize: 10, color: "var(--text-muted)" }}
              >
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryCard({
  card,
  hue,
}: {
  card: BubbleCard;
  hue: number;
}) {
  const color = card.color_dot ?? `oklch(0.74 0.13 ${hue})`;
  return (
    <div
      className="card"
      style={{
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ColorDot color={color} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-strong)",
          }}
        >
          {card.title}
        </span>
      </div>
      <div
        className="mono tnum"
        style={{ fontSize: 11, color: "var(--text-muted)" }}
      >
        {card.primary}
        {card.secondary ? ` · ${card.secondary}` : ""}
      </div>
      {card.tags && card.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {card.tags.map((t) => (
            <Tag key={t} hue={hue}>
              {t}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}

export function BubbleBreakdownBlock({ block, dataRef }: Props) {
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
        bubble_breakdown block references data_ref={block.data_ref} which does
        not exist
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

  const data = bubblesFromDataRef(dataRef, block.bubble);
  const cards = block.cards ?? [];
  const layout = block.layout ?? "row";

  return (
    <div className="card" style={{ padding: "var(--space-4)" }}>
      <BlockHeader
        title={block.title ?? ""}
        right={
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--text-faint)" }}
          >
            버블 크기 = {block.bubble.size} · x = {block.bubble.x}
          </span>
        }
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: layout === "row" ? "1fr 220px" : "1fr",
          gap: "var(--space-4)",
        }}
      >
        <BubbleChart data={data} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 300,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {cards.map((c, i) => (
            <CategoryCard
              key={c.title + i}
              card={c}
              hue={HUE_STEPS[i % HUE_STEPS.length]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
