"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import RecoveryScreen from "@/src/components/recovery/RecoveryScreen";
import { reportClientError } from "@/src/library/monitoring/reportClientError";

/**
 * The App Router error boundary for rendered pages and nested layouts.
 * Error details remain in the browser console for diagnosis and are reported
 * to error tracking, but are never presented to the user.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error("Unhandled route error", error);
    reportClientError(error, { digest: error.digest });
  }, [error]);

  return (
    <RecoveryScreen
      variant="unexpected"
      layout="page"
      primaryAction={{ label: "Try again", onClick: reset }}
      secondaryAction={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
    />
  );
}
