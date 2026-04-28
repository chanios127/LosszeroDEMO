import type { CSSProperties, ReactNode } from "react";
import { IconSettings, IconClose } from "./icons";
import type {
  ChartPalette,
  Density,
  SidebarStyle,
  ThemeMode,
  Tweaks,
} from "../../framework/hooks/useTweaks";
import { PALETTES } from "../../framework/hooks/useTweaks";

interface TweaksPanelProps {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  onClose: () => void;
}

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 18,
};

const LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  color: "var(--text-faint)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontFamily: "var(--font-mono)",
};

interface SegmentedOption<T> {
  value: T;
  label: string;
}

function SegmentedGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 4,
        padding: 4,
        background: "var(--bg-elev-2)",
        borderRadius: 8,
        border: "1px solid var(--border-subtle)",
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="focus-ring"
            style={{
              padding: "6px 8px",
              fontSize: 12,
              fontWeight: 500,
              color: active ? "#0a0a0a" : "var(--text-muted)",
              background: active ? "var(--brand-500)" : "transparent",
              borderRadius: 5,
              transition: "all 140ms",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PaletteSwatch({
  name,
  label,
  active,
  onSelect,
}: {
  name: ChartPalette;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const colors = PALETTES[name];
  return (
    <button
      onClick={onSelect}
      className="focus-ring"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        borderRadius: 8,
        border: `1px solid ${active ? "var(--brand-500)" : "var(--border-subtle)"}`,
        background: active
          ? "color-mix(in oklch, var(--brand-500) 8%, transparent)"
          : "var(--bg-elev-2)",
        transition: "all 140ms",
      }}
    >
      <div style={{ display: "flex", gap: 3 }}>
        {colors.slice(0, 5).map((c, i) => (
          <div
            key={i}
            style={{ flex: 1, height: 18, borderRadius: 3, background: c }}
          />
        ))}
      </div>
      <div
        style={{
          fontSize: 11,
          color: active ? "var(--brand-500)" : "var(--text-muted)",
          textAlign: "left",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </button>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={ROW_STYLE}>
      <div style={LABEL_STYLE}>{label}</div>
      {children}
    </div>
  );
}

export default function TweaksPanel({
  tweaks,
  setTweak,
  onClose,
}: TweaksPanelProps) {
  return (
    <div
      className="fade-in"
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        zIndex: 50,
        width: 320,
        background: "var(--bg-elev-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-lg)",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconSettings />
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "var(--text-strong)",
            }}
          >
            Tweaks
          </span>
        </div>
        <button
          onClick={onClose}
          className="focus-ring"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: "grid",
            placeItems: "center",
            color: "var(--text-faint)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-strong)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-faint)";
          }}
          title="닫기"
        >
          <IconClose />
        </button>
      </div>

      <div style={{ padding: 16, maxHeight: "70vh", overflow: "auto" }}>
        <Section label="Theme">
          <SegmentedGroup<ThemeMode>
            value={tweaks.theme}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
            onChange={(v) => setTweak("theme", v)}
          />
        </Section>

        <Section label="Density">
          <SegmentedGroup<Density>
            value={tweaks.density}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Normal" },
              { value: "spacious", label: "Spacious" },
            ]}
            onChange={(v) => setTweak("density", v)}
          />
        </Section>

        <Section label="Sidebar Style">
          <SegmentedGroup<SidebarStyle>
            value={tweaks.sidebarStyle}
            options={[
              { value: "minimal", label: "Minimal" },
              { value: "elevated", label: "Elevated" },
            ]}
            onChange={(v) => setTweak("sidebarStyle", v)}
          />
        </Section>

        <Section label="Chart Palette">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <PaletteSwatch
              name="teal"
              label="Teal (LossZero)"
              active={tweaks.chartPalette === "teal"}
              onSelect={() => setTweak("chartPalette", "teal")}
            />
            <PaletteSwatch
              name="ember"
              label="Ember"
              active={tweaks.chartPalette === "ember"}
              onSelect={() => setTweak("chartPalette", "ember")}
            />
            <PaletteSwatch
              name="violet"
              label="Violet"
              active={tweaks.chartPalette === "violet"}
              onSelect={() => setTweak("chartPalette", "violet")}
            />
            <PaletteSwatch
              name="mono"
              label="Mono"
              active={tweaks.chartPalette === "mono"}
              onSelect={() => setTweak("chartPalette", "mono")}
            />
          </div>
        </Section>

        <Section label="Debug">
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              background: "var(--bg-elev-2)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={tweaks.debugViz}
              onChange={(e) => setTweak("debugViz", e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-strong)",
                }}
              >
                Debug Viz
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                차트 버블 아래 viz_hint, rows, 컬럼 메타 표시
              </div>
            </div>
          </label>
        </Section>

        <div
          style={{
            marginTop: 6,
            padding: "10px 12px",
            background: "var(--bg-elev-2)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--text-strong)", fontWeight: 600 }}>
            Tip.
          </strong>{" "}
          Chart Palette를 바꾸면 brand 색상도 같이 변경돼요. Sidebar
          Minimal은 Notion 스타일, Elevated는 dark dashboard 스타일입니다.
        </div>
      </div>
    </div>
  );
}
