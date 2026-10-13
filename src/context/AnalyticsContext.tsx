"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import {
  INITIAL_ANALYTICS_PREFERENCE,
  watchAnalyticsPreference,
} from "@/src/library/analyticsPreferences";
import AnalyticsWelcome from "@/src/components/analytics/AnalyticsWelcome";
import { AnalyticsContext } from "./analyticsPreferenceContext";

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const userId = loading ? null : (user?.uid ?? null);
  const [preference, setPreference] = useState(INITIAL_ANALYTICS_PREFERENCE);
  const [preferenceUserId, setPreferenceUserId] = useState(userId);
  const session = useRef<ReturnType<typeof watchAnalyticsPreference> | null>(
    null,
  );

  if (preferenceUserId !== userId) {
    setPreferenceUserId(userId);
    setPreference(INITIAL_ANALYTICS_PREFERENCE);
  }

  useEffect(() => {
    if (!userId) return;

    const currentSession = watchAnalyticsPreference(userId, setPreference);
    session.current = currentSession;
    return () => {
      currentSession.stop();
      session.current = null;
    };
  }, [userId]);

  async function setEnabled(enabled: boolean) {
    await session.current?.save(enabled);
  }

  async function retry() {
    if (preference.needsReload) {
      window.location.reload();
      return;
    }
    if (preference.failedChoice !== null) {
      await session.current?.save(preference.failedChoice);
    }
  }

  const isCurrentUser = userId !== null && userId === preferenceUserId;
  const currentPreference = isCurrentUser
    ? preference
    : INITIAL_ANALYTICS_PREFERENCE;

  return (
    <AnalyticsContext.Provider
      value={{ ...currentPreference, setEnabled, retry }}
    >
      {children}
      {user && currentPreference.needsChoice && <AnalyticsWelcome />}
    </AnalyticsContext.Provider>
  );
}
