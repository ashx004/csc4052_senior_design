// Runs once when the Next.js server starts (Next's instrumentation hook).

export async function register() {
  // The edge runtime has no Firebase Admin; AI routes all run on Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The AI client charges through this meter. It's registered here instead of
  // imported by aiFetch.ts, which browser bundles reach through shared modules.
  const [{ setMeter }, { createMeter }] = await Promise.all([import("./library/ai/aiFetch"), import("./library/billing/usageMeter")]);
  setMeter(createMeter());
}
