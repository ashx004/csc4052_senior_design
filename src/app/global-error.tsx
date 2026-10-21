"use client";

import { useEffect } from "react";
import "./global.css";
import RecoveryScreen from "@/src/components/recovery/RecoveryScreen";
import { reportClientError } from "@/src/library/monitoring/reportClientError";

/**
 * Catches errors thrown by the root layout itself, which error.tsx can't.
 * It replaces the whole document, so it renders its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root layout error", error);
    reportClientError(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg-main text-text-main antialiased">
        <RecoveryScreen
          variant="unexpected"
          layout="page"
          primaryAction={{ label: "Try again", onClick: reset }}
          secondaryAction={{ label: "Go to dashboard", onClick: () => window.location.assign("/dashboard") }}
        />
      </body>
    </html>
  );
}
