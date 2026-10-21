"use client";
import { useEffect, useState } from "react";

type ReportResult<T> = {
  key: string;
  data: T | null;
  error: string;
};

export function useAdminReport<T>(url: string, refresh: number, poll = false) {
  const key = `${refresh}:${url}`;
  const [result, setResult] = useState<ReportResult<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    let unauthorized = false;
    async function load() {
      if (busy || unauthorized) return;
      busy = true;
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(40_000),
          ]),
        });
        const body = await response.json();
        if (response.status === 401 || response.status === 403)
          unauthorized = true;
        if (!response.ok)
          throw new Error(
            body.error || "This report is temporarily unavailable.",
          );
        if (!controller.signal.aborted)
          setResult({ key, data: body, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({
            key,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "This report is temporarily unavailable.",
          });
        }
      } finally {
        busy = false;
      }
    }
    void load();
    const timer = poll
      ? setInterval(() => {
          if (!document.hidden) void load();
        }, 60_000)
      : undefined;
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [url, key, poll]);

  if (result?.key !== key) return { data: null, error: "", loading: true };
  return { data: result.data, error: result.error, loading: false };
}
