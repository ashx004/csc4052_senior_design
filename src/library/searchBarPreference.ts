"use client";

import { useSyncExternalStore } from "react";

// Whether the top "Search Catalyst" bar is shown. Stored per browser like the
// theme and read-aloud voice; on by default so existing users see no change.
const STORAGE_KEY = "catalyst:topSearchBarEnabled";
const CHANGE_EVENT = "catalyst:topSearchBarChanged";

export function getStoredSearchBarEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setStoredSearchBarEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable (private mode): still apply it for this page view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// The server can't read localStorage, so it (and hydration) assume "on".
export function useSearchBarEnabled(): boolean {
  return useSyncExternalStore(subscribe, getStoredSearchBarEnabled, () => true);
}
