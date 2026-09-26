const AUTO_COLLAPSE_KEY = "catalyst:sidebarAutoCollapse";

export function getSidebarAutoCollapse(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTO_COLLAPSE_KEY) === "true";
}

export function setSidebarAutoCollapse(enabled: boolean): void {
  window.localStorage.setItem(AUTO_COLLAPSE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("catalyst:sidebar-auto-collapse", { detail: enabled }));
}

export const SIDEBAR_AUTO_COLLAPSE_EVENT = "catalyst:sidebar-auto-collapse";
