import { defineConfig } from "vitest/config";
import path from "path";

// Calendar fixtures assert America/Chicago local-day behavior. Keep the test
// process deterministic across developer machines and CI runners (which often
// default to UTC) without changing the production runtime timezone.
process.env.TZ = "America/Chicago";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
