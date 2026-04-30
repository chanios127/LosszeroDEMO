import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";
export type Density = "compact" | "comfortable" | "spacious";
export type SidebarStyle = "minimal" | "elevated";
export type ChartPalette = "teal" | "ember" | "violet" | "mono";

export interface Tweaks {
  theme: ThemeMode;
  density: Density;
  sidebarStyle: SidebarStyle;
  chartPalette: ChartPalette;
  accentHue: number;
  debugViz: boolean;
  maxTokens: number;
  thinkingEnabled: boolean;
  thinkingBudget: number;
  maxTurns: number;
}

export const TWEAKS_LS_KEY = "losszero.tweaks.v1";

const DEFAULTS: Tweaks = {
  theme: "dark",
  density: "comfortable",
  sidebarStyle: "elevated",
  chartPalette: "teal",
  accentHue: 185,
  debugViz: false,
  maxTokens: 10000,
  thinkingEnabled: false,
  thinkingBudget: 4096,
  maxTurns: 10,
};

const DENSITY_SCALE: Record<Density, number> = {
  compact: 0.85,
  comfortable: 1.0,
  spacious: 1.18,
};

export const PALETTES: Record<ChartPalette, string[]> = {
  teal: [
    "oklch(0.70 0.15 185)",
    "oklch(0.72 0.13 230)",
    "oklch(0.74 0.14 295)",
    "oklch(0.78 0.15 340)",
    "oklch(0.82 0.14 60)",
    "oklch(0.74 0.13 135)",
  ],
  ember: [
    "oklch(0.72 0.16 45)",
    "oklch(0.78 0.15 25)",
    "oklch(0.74 0.17 85)",
    "oklch(0.80 0.13 125)",
    "oklch(0.68 0.13 290)",
    "oklch(0.72 0.14 200)",
  ],
  violet: [
    "oklch(0.70 0.18 295)",
    "oklch(0.74 0.16 255)",
    "oklch(0.72 0.17 330)",
    "oklch(0.78 0.15 180)",
    "oklch(0.82 0.14 80)",
    "oklch(0.76 0.16 15)",
  ],
  mono: [
    "oklch(0.80 0.00 240)",
    "oklch(0.68 0.00 240)",
    "oklch(0.56 0.00 240)",
    "oklch(0.44 0.00 240)",
    "oklch(0.32 0.00 240)",
    "oklch(0.88 0.00 240)",
  ],
};

const PALETTE_HUE: Record<ChartPalette, number> = {
  teal: 185,
  ember: 45,
  violet: 295,
  mono: 240,
};

function loadTweaks(): Tweaks {
  try {
    const raw = localStorage.getItem(TWEAKS_LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // storage disabled
  }
  return { ...DEFAULTS };
}

function saveTweaks(t: Tweaks) {
  try {
    localStorage.setItem(TWEAKS_LS_KEY, JSON.stringify(t));
  } catch {
    // storage disabled
  }
}

function applyTweaks(t: Tweaks) {
  const root = document.documentElement;
  root.setAttribute("data-theme", t.theme);
  root.setAttribute("data-density", t.density);
  root.setAttribute("data-sidebar", t.sidebarStyle);
  root.setAttribute("data-debug-viz", t.debugViz ? "1" : "0");
  root.style.setProperty("--density", String(DENSITY_SCALE[t.density]));

  const palette = PALETTES[t.chartPalette];
  palette.forEach((c, i) => {
    root.style.setProperty(`--chart-default-${i + 1}`, c);
  });

  const hue = PALETTE_HUE[t.chartPalette] ?? t.accentHue;
  const lightBase = t.theme === "light" ? 0.58 : 0.7;
  const chroma = t.chartPalette === "mono" ? 0.0 : 0.15;
  root.style.setProperty("--brand-500", `oklch(${lightBase} ${chroma} ${hue})`);
  root.style.setProperty(
    "--brand-600",
    `oklch(${lightBase - 0.08} ${chroma} ${hue})`,
  );
  root.style.setProperty(
    "--brand-700",
    `oklch(${lightBase - 0.18} ${chroma} ${hue})`,
  );
  root.style.setProperty(
    "--brand-400",
    `oklch(${lightBase + 0.04} ${chroma * 0.9} ${hue})`,
  );
  root.style.setProperty(
    "--brand-300",
    `oklch(${lightBase + 0.08} ${chroma * 0.8} ${hue})`,
  );
  root.style.setProperty(
    "--ring",
    `oklch(${lightBase} ${chroma} ${hue} / 0.4)`,
  );
}

/** Read LLM options from localStorage at call time — always fresh, no React state. */
export function readStoredLlmOptions() {
  try {
    const raw = localStorage.getItem(TWEAKS_LS_KEY);
    if (raw) {
      const t = JSON.parse(raw) as Partial<Tweaks>;
      return {
        maxTokens: typeof t.maxTokens === "number" ? t.maxTokens : DEFAULTS.maxTokens,
        thinkingEnabled: typeof t.thinkingEnabled === "boolean" ? t.thinkingEnabled : DEFAULTS.thinkingEnabled,
        thinkingBudget: typeof t.thinkingBudget === "number" ? t.thinkingBudget : DEFAULTS.thinkingBudget,
        maxTurns: typeof t.maxTurns === "number" ? t.maxTurns : DEFAULTS.maxTurns,
      };
    }
  } catch {
    // storage disabled
  }
  return {
    maxTokens: DEFAULTS.maxTokens,
    thinkingEnabled: DEFAULTS.thinkingEnabled,
    thinkingBudget: DEFAULTS.thinkingBudget,
    maxTurns: DEFAULTS.maxTurns,
  };
}

export function useTweaks() {
  const [tweaks, setTweaks] = useState<Tweaks>(loadTweaks);
  const [showTweaks, setShowTweaks] = useState(false);

  useEffect(() => {
    applyTweaks(tweaks);
    saveTweaks(tweaks);
  }, [tweaks]);

  const setTweak = useCallback(
    <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
      setTweaks((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return { tweaks, setTweak, showTweaks, setShowTweaks };
}
