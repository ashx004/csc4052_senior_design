"use client";

import { createContext } from "react";
import type { AnalyticsPreferenceState } from "@/src/library/analyticsPreferences";

type AnalyticsContextValue = AnalyticsPreferenceState & {
  setEnabled: (enabled: boolean) => Promise<void>;
  retry: () => Promise<void>;
};

export const AnalyticsContext = createContext<AnalyticsContextValue | null>(
  null,
);
