import { defineConfig } from "vitest/config";
import path from "path";

// Calendar fixtures assert America/Chicago local-day behavior. Keep the test
// process deterministic across developer machines and CI runners (which often
// default to UTC) without changing the production runtime timezone.
process.env.TZ = "America/Chicago";

export default defineConfig({
  test: {
    environment: "node",
    // Component tests (*.test.tsx) opt in to a browser-like DOM per file with
    // a "// @vitest-environment jsdom" comment; everything else stays on node.
    include: ["src/**/*.test.{ts,tsx}"],
  },
  // Next.js compiles JSX itself (tsconfig keeps it as "preserve"); tests need it turned into calls.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
