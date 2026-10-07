"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "@/src/hooks/useAnalytics";
import {
  createAnalyticsAttemptId,
  normalizeAnalyticsPath,
} from "@/src/library/analyticsContract";

export default function PageTracker() {
  const pathname = usePathname();
  const { enabled, track } = useAnalytics();
  const currentVisit = useRef({ pathname: "", eventKey: "" });

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

  return null;
}
