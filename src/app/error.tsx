"use client";

import { useEffect } from "react";
import RecoveryScreen from "@/src/components/recovery/RecoveryScreen";

/**
 * The App Router error boundary for rendered pages and nested layouts.
 * Error details remain in the browser console for diagnosis and are never
 * presented to the user.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled route error", error);
  }, [error]);

  return (
    <RecoveryScreen
      variant="unexpected"
      layout="page"
      primaryAction={{ label: "Try again", onClick: reset }}
    />
  );
}
