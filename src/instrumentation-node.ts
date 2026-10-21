// Node-only server startup (see instrumentation.ts).
import { setMeter } from "./library/ai/aiFetch";
import { createMeter } from "./library/billing/usageMeter";

// The AI client charges through this meter. It's registered here instead of
// imported by aiFetch.ts, which browser bundles reach through shared modules.
setMeter(createMeter());

// Promise rejections nothing awaited (fire-and-forget background work) never
// reach onRequestError, so they're reported here instead.
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  void import("./library/monitoring/errorReporter").then(({ reportError }) =>
    reportError({ source: "server", message: err.message, name: err.name, stack: err.stack, route: "(background task)", build: process.env.NEXT_PUBLIC_BUILD_ID }),
  );
});
