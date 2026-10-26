"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "@/src/hooks/useAnalytics";
import {
  createAnalyticsAttemptId,
  normalizeAnalyticsPath,
} from "@/src/library/analyticsContract";
import { readPageLoadMeasurement } from "@/src/library/pageLoadTiming";

export default function PageTracker() {
  const pathname = usePathname();
  const { enabled, track } = useAnalytics();
  const currentVisit = useRef({ pathname: "", eventKey: "" });
  const initialPageLoadTracked = useRef(false);

  useEffect(() => {
    if (!enabled) {
      currentVisit.current = { pathname: "", eventKey: "" };
      return;
    }

    if (pathname !== currentVisit.current.pathname) {
      currentVisit.current = { pathname, eventKey: createAnalyticsAttemptId() };
    }

    void track(
      "page_view",
      { page_name: normalizeAnalyticsPath(pathname) },
      currentVisit.current.eventKey,
    );
  }, [pathname, enabled, track]);

  useEffect(() => {
    if (!enabled || initialPageLoadTracked.current) return;

    const reportInitialPageLoad = () => {
      const measurement = readPageLoadMeasurement(window.performance);
      if (!measurement) return;

      // Mark this before sending so a rerender or a failed delivery cannot
      // create a duplicate record for the same document navigation.
      initialPageLoadTracked.current = true;
      void track(
        "page_load",
        { page_name: normalizeAnalyticsPath(pathname), ...measurement },
        createAnalyticsAttemptId(),
      );
    };

    if (document.readyState === "complete") {
      reportInitialPageLoad();
      return;
    }

    window.addEventListener("load", reportInitialPageLoad, { once: true });
    return () => window.removeEventListener("load", reportInitialPageLoad);
  }, [pathname, enabled, track]);

  return null;
}
