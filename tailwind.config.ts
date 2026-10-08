import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18212b",
        muted: "#66717d",
        line: "#dfe4e8",
        canvas: "#f5f7f8",
        accent: "#176b63",
        "accent-soft": "#e9f3f1",
        danger: "#a53636",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        lift: "0 8px 28px rgba(20, 33, 43, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
