import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

export function Slider({ label, min, max, step, value, onChange }: SliderProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-faint)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            fontFamily: "var(--font-mono)",
          }}
        >
          {label}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-strong)" }}>
          {value.toLocaleString()}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: "var(--accent, var(--brand-500))", width: "100%", cursor: "pointer" }}
      />
    </div>
  );
}

export function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BUTTON_VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--brand-500)",
    color: "#0a0a0a",
    border: "1px solid transparent",
  },
  secondary: {
    background: "var(--bg-elev-2)",
    color: "var(--text-strong)",
    border: "1px solid var(--border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid transparent",
  },
  danger: {
    background: "color-mix(in oklch, var(--danger) 15%, transparent)",
    color: "var(--danger)",
    border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)",
  },
};

const BUTTON_SIZES: Record<ButtonSize, CSSProperties> = {
  sm: { padding: "4px 10px", fontSize: 12, borderRadius: 6, height: 26 },
  md: { padding: "6px 14px", fontSize: 13, borderRadius: 8, height: 32 },
  lg: { padding: "10px 18px", fontSize: 14, borderRadius: 10, height: 40 },
};

export function Button({
  variant = "secondary",
  size = "md",
  children,
  className,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cls("focus-ring", className)}
      style={{
        ...BUTTON_VARIANTS[variant],
        ...BUTTON_SIZES[size],
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontWeight: 500,
        transition: "background 120ms, border-color 120ms, color 120ms",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeTone = "brand" | "success" | "warning" | "danger" | "info" | "muted";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  style?: CSSProperties;
}

const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  brand: {
    bg: "color-mix(in oklch, var(--brand-500) 15%, transparent)",
    fg: "var(--brand-500)",
  },
  success: {
    bg: "color-mix(in oklch, var(--success) 16%, transparent)",
    fg: "var(--success)",
  },
  warning: {
    bg: "color-mix(in oklch, var(--warning) 18%, transparent)",
    fg: "var(--warning)",
  },
  danger: {
    bg: "color-mix(in oklch, var(--danger) 18%, transparent)",
    fg: "var(--danger)",
  },
  info: {
    bg: "color-mix(in oklch, var(--info) 15%, transparent)",
    fg: "var(--info)",
  },
  muted: { bg: "var(--bg-elev-2)", fg: "var(--text-muted)" },
};

export function Badge({ tone = "muted", children, style }: BadgeProps) {
  const t = BADGE_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 500,
        background: t.bg,
        color: t.fg,
        borderRadius: 999,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatDelta — numeric trend arrow
// ---------------------------------------------------------------------------

interface StatDeltaProps {
  trend: "up" | "down" | "flat";
  children: ReactNode;
}

export function StatDelta({ trend, children }: StatDeltaProps) {
  const color =
    trend === "up"
      ? "var(--success)"
      : trend === "down"
        ? "var(--danger)"
        : "var(--text-faint)";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "·";
  return (
    <span className="mono tnum" style={{ color, fontSize: 12 }}>
      {arrow} {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// fmtRel — relative time formatter (KR)
// ---------------------------------------------------------------------------

export function fmtRel(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "방금";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}분 전`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}시간 전`;
  const day = Math.floor(d / 86_400_000);
  return `${day}일 전`;
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}

export function SectionHeader({ eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: "var(--space-3)",
      }}
    >
      <div>
        {eyebrow && (
          <div
            className="mono"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h2
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-strong)",
          }}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dot — status indicator
// ---------------------------------------------------------------------------

type DotTone = "brand" | "success" | "warning" | "danger" | "muted";

interface DotProps {
  tone?: DotTone;
  pulse?: boolean;
}

const DOT_COLORS: Record<DotTone, string> = {
  brand: "var(--brand-500)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  muted: "var(--text-faint)",
};

export function Dot({ tone = "brand", pulse }: DotProps) {
  return (
    <span
      className={pulse ? "pulse-dot" : ""}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        background: DOT_COLORS[tone],
      }}
    />
  );
}
