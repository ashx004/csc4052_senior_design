// Node-only server startup (see instrumentation.ts).
import { setMeter } from "./library/ai/aiFetch";
import { createMeter } from "./library/billing/usageMeter";

// The AI client charges through this meter. It's registered here instead of
// imported by aiFetch.ts, which browser bundles reach through shared modules.
setMeter(createMeter());
