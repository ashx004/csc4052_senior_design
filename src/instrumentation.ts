import type { Instrumentation } from "next";

// Runs once when the Next.js server starts (Next's instrumentation hook).
// The import sits directly inside this check so the edge build drops it:
// Firebase Admin only runs on Node, where every AI route lives.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

// Every error a route or page throws without catching ends up here, which is
// the server half of error tracking (library/monitoring/errorReporter.ts).
// Same rule as register(): the import must sit directly inside the check, or
// the edge build tries to bundle Firebase Admin and fails.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportError } = await import("./library/monitoring/errorReporter");
    const err: Error & { digest?: string } = error instanceof Error ? error : new Error(String(error));
    await reportError({
      source: "server",
      message: err.message,
      name: err.name,
      stack: err.stack,
      // routePath is the pattern ("/api/courses/[courseId]"), so ids never split a group.
      route: context.routePath || request.path,
      method: request.method,
      digest: err.digest,
      build: process.env.NEXT_PUBLIC_BUILD_ID,
    });
  }
};
