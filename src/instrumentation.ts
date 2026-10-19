// Runs once when the Next.js server starts (Next's instrumentation hook).
// The import sits directly inside this check so the edge build drops it:
// Firebase Admin only runs on Node, where every AI route lives.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
