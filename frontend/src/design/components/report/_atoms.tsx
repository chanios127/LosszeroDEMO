// Shared atoms used by the cycle-2 report blocks (bubble_breakdown / kpi_grid / ranked_list / gantt / radar).
// Mirrors the mock JSX helpers from design-export/cycle2-output/.

import type { ReactNode, CSSProperties } from "react";

export function BlockHeader({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "var(--space-3)",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-strong)",
        }}
      >
        {title}
      </h3>
      {right ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {right}
        </div>
      ) : null}
    </div>
  );
}

export function ColorDot({
  color,
  size = 8,
  style,
}: {
  color: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export function Tag({
  hue = 200,
  children,
}: {
  hue?: number;
  children: ReactNode;
}) {
  const color = `oklch(0.74 0.13 ${hue})`;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        fontSize: 10,
        borderRadius: 4,
        background: `color-mix(in oklch, ${color} 18%, transparent)`,
        color,
        border: `1px solid color-mix(in oklch, ${color} 35%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
