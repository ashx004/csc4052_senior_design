"use client";

import { useSyncExternalStore } from "react";
import {
  analyticsEnabled,
  setAnalyticsEnabled,
  subscribeAnalyticsPreference,
  track,
} from "@/src/library/analytics";

function analyticsDisabledDuringServerRendering() {
  return false;
}

export function useAnalytics() {
  const enabled = useSyncExternalStore(
    subscribeAnalyticsPreference,
    analyticsEnabled,
    analyticsDisabledDuringServerRendering,
  );

  return { enabled, setEnabled: setAnalyticsEnabled, track };
}
