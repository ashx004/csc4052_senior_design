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
        const options: RequestInit = {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(40_000),
          ]),
        };
        let response = await fetch(url, options);
        const gatewayFailure = [502, 503, 504].includes(response.status);
        const receivedJson = response.headers
          .get("content-type")
          ?.includes("application/json");
        if (gatewayFailure && !receivedJson && !options.signal?.aborted) {
          await response.body?.cancel();
          response = await fetch(url, options);
        }
        if (response.status === 401 || response.status === 403)
          unauthorized = true;
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          if (response.status === 401 || response.redirected)
            throw new Error("Sign in again, then reload this report.");
          if (response.status === 403)
            throw new Error(
              "Access to this report was denied. Check your admin access and the host's access rules.",
            );
          throw new Error(
            `The report endpoint returned a web page instead of data (HTTP ${response.status}). Ask the host to check the deployment and proxy logs.`,
          );
        }
        const body = await response.json().catch(() => {
          throw new Error(
            `The server returned invalid report data (HTTP ${response.status}). Please try again.`,
          );
        });
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
