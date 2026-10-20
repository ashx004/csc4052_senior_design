"use client";

import { useEffect } from "react";
import { reportClientError } from "@/src/library/monitoring/reportClientError";

/** Reports browser errors that no error boundary catches: errors thrown in
 *  event handlers and timers, and promise rejections nothing awaited. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
