"use client";

import { useContext } from "react";
import { AnalyticsContext } from "@/src/context/analyticsPreferenceContext";
import { track } from "@/src/library/analytics";

export function useAnalytics() {
  const preference = useContext(AnalyticsContext);
  if (!preference) {
    throw new Error("Analytics preferences require AnalyticsProvider.");
  }
  return { ...preference, track };
}
