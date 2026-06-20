import type { Config } from "tailwindcss";

// DESIGN.md tokens — exact hexes, type scale, radii, spacing. The whole visual
// language lives here: paper-white canvas, pill geometry, hairline borders, a
// single inverted dark surface, no shadows, no gradients, no brand colors.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",
      primary: "#000000",
      "ink-deep": "#090909",
      canvas: "#ffffff",
      "surface-soft": "#fafafa",
      "surface-dark": "#171717",
      hairline: "#e5e5e5",
      "hairline-strong": "#d4d4d4",
      ink: "#000000",
      charcoal: "#525252",
      body: "#737373",
      mute: "#a3a3a3",
      "on-dark": "#ffffff",
      "on-dark-mute": "rgba(255,255,255,0.7)",
      "term-red": "#ff5f56",
      "term-yellow": "#ffbd2e",
      "term-green": "#27c93f",
      "focus-ring": "rgba(59,130,246,0.5)",
    },
    borderRadius: {
      none: "0px",
      sm: "6px",
      md: "8px",
      lg: "12px",
      full: "9999px",
    },
    fontFamily: {
      display: ["var(--font-display)", "system-ui", "-apple-system", "sans-serif"],
      sans: ["ui-sans-serif", "system-ui", "-apple-system", "Inter", "sans-serif"],
      mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
    },
    fontSize: {
      "display-xl": ["36px", { lineHeight: "1.11", fontWeight: "500" }],
      "display-lg": ["30px", { lineHeight: "1.2", fontWeight: "500" }],
      "heading-lg": ["24px", { lineHeight: "1.33", fontWeight: "600" }],
      "heading-md": ["20px", { lineHeight: "1.4", fontWeight: "500" }],
      "heading-sm": ["18px", { lineHeight: "1.56", fontWeight: "500" }],
      "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
      "body-strong": ["16px", { lineHeight: "1.5", fontWeight: "500" }],
      "body-sm": ["14px", { lineHeight: "1.43", fontWeight: "400" }],
      "body-sm-strong": ["14px", { lineHeight: "1.43", fontWeight: "500" }],
      "caption-sm": ["12px", { lineHeight: "1.33", fontWeight: "400" }],
      "code-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
      "code-sm": ["14px", { lineHeight: "1.43", fontWeight: "400" }],
      "button-md": ["14px", { lineHeight: "1", fontWeight: "500" }],
    },
    extend: {
      spacing: {
        xxs: "2px",
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        xxl: "32px",
        section: "88px",
      },
      maxWidth: {
        content: "720px",
        dash: "1120px",
      },
      height: {
        btn: "36px",
        input: "40px",
        snippet: "48px",
      },
      boxShadow: {
        none: "none",
      },
    },
  },
  plugins: [],
};

export default config;
