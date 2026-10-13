"use client";

import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { setAnalyticsEnabled, setAnalyticsUser } from "./analytics";

const LEGACY_PREFERENCE_KEY = "catalyst-analytics-consent-v1";

export type AnalyticsPreferenceState = {
  enabled: boolean;
  needsChoice: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  failedChoice: boolean | null;
  needsReload: boolean;
};

export const INITIAL_ANALYTICS_PREFERENCE: AnalyticsPreferenceState = {
  enabled: false,
  needsChoice: false,
  isLoading: true,
  isSaving: false,
  error: "",
  failedChoice: null,
  needsReload: false,
};

export function defaultAnalyticsChoice(): boolean {
  try {
    return localStorage.getItem(LEGACY_PREFERENCE_KEY) !== "disabled";
  } catch {
    return true;
  }
}

export function watchAnalyticsPreference(
  userId: string,
  onChange: (state: AnalyticsPreferenceState) => void,
) {
  const session = setAnalyticsUser(userId);
  const preferenceDocument = doc(db, "users", userId, "settings", "analytics");
  let active = true;
  let state = { ...INITIAL_ANALYTICS_PREFERENCE };
  let confirmedChoiceDuringSave: { enabled: unknown } | null = null;

  function update(changes: Partial<AnalyticsPreferenceState>) {
    if (!active) return;
    state = { ...state, ...changes };
    onChange(state);
  }

  function applyConfirmedChoice(enabled: unknown) {
    const hasChoice = typeof enabled === "boolean";
    setAnalyticsEnabled(hasChoice && enabled, session);
    update({
      enabled: hasChoice && enabled,
      needsChoice: !hasChoice,
      isLoading: false,
      error: "",
    });
  }

  function choiceAfterSave(savedChoice: boolean) {
    return confirmedChoiceDuringSave
      ? confirmedChoiceDuringSave.enabled
      : savedChoice;
  }

  const unsubscribe = onSnapshot(
    preferenceDocument,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (
        !active ||
        snapshot.metadata.hasPendingWrites ||
        state.needsReload ||
        state.failedChoice !== null
      )
        return;
      if (snapshot.metadata.fromCache) {
        setAnalyticsEnabled(false, session);
        update({ enabled: false, isLoading: true });
        return;
      }
      const enabled = snapshot.data()?.enabled;
      if (state.isSaving) {
        confirmedChoiceDuringSave = { enabled };
        return;
      }
      applyConfirmedChoice(enabled);
    },
    () => {
      if (!active) return;
      setAnalyticsEnabled(false, session);
      update({
        enabled: false,
        isLoading: false,
        needsReload: true,
        error:
          "We couldn’t load your sharing preference. Reload this page to try again. Sharing is off.",
      });
    },
  );

  async function save(enabled: boolean) {
    if (!active || state.isSaving || state.needsReload) return;
    confirmedChoiceDuringSave = null;
    if (!enabled) setAnalyticsEnabled(false, session);
    update({
      isSaving: true,
      failedChoice: null,
      error: "",
      ...(!enabled ? { enabled: false } : {}),
    });
    try {
      await setDoc(preferenceDocument, {
        enabled,
        updatedAt: serverTimestamp(),
      });
      if (!active) return;
      update({ isSaving: false });
      if (state.needsReload) return;
      applyConfirmedChoice(choiceAfterSave(enabled));
    } catch {
      if (!active) return;
      setAnalyticsEnabled(false, session);
      update({
        enabled: false,
        isSaving: false,
        failedChoice: enabled,
        error:
          "We couldn’t save your choice. Sharing is off on this device. Please try again.",
      });
    }
  }

  function stop() {
    active = false;
    unsubscribe();
    setAnalyticsEnabled(false, session);
  }

  return { save, stop };
}
