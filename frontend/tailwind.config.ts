import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9ff",
          500: "#0ea5e9",
          700: "#0369a1",
          900: "#0c4a6e",
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
