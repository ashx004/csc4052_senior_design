import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        "text-main": "var(--color-text-main)",
        "text-muted": "var(--color-text-muted)",
        "text-inverse": "var(--color-text-inverse)",
        "bg-main": "var(--color-bg-main)",
        "bg-container": "var(--color-bg-container)",
        "bg-warm": "var(--color-bg-warm)",
        "border-light": "var(--color-border-light)",
        "border-hover": "var(--color-border-hover)",
        "alert-error": "var(--color-alert-error)",
        "alert-error-bg": "var(--color-alert-error-bg)",
        "alert-error-hover": "var(--color-alert-error-hover)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
