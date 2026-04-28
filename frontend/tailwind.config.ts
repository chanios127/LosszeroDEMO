import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-elev-1": "var(--bg-elev-1)",
        "bg-elev-2": "var(--bg-elev-2)",
        "bg-elev-3": "var(--bg-elev-3)",
        "border-subtle": "var(--border-subtle)",
        border: "var(--border)",
        "text-strong": "var(--text-strong)",
        "text-base": "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-dim": "var(--text-dim)",
        "text-faint": "var(--text-faint)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
        brand: {
          50: "var(--brand-50)",
          100: "var(--brand-100)",
          200: "var(--brand-200)",
          300: "var(--brand-300)",
          400: "var(--brand-400)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      ringColor: {
        DEFAULT: "var(--ring)",
      },
    },
  },
  plugins: [typography],
};

export default config;
