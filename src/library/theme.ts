// Shared theme logic — previously duplicated between ThemeInitializer.tsx
// (applies the stored theme on first paint) and the settings page (applies +
// persists a newly chosen one). Theming is two independent axes: light/dark
// (toggle) and coffee (checkbox) — "coffee" is a warm-palette overlay that
// works on top of either mode, not a third exclusive option. Both are
// applied as classes on <html> ("dark", "coffee"); Tailwind's own `dark:`
// utility variants key off the "dark" class specifically, so that one must
// stay a plain boolean rather than being folded into a single enum.
export type ThemeMode = "light" | "dark";

const MODE_KEY = "theme-mode";
const COFFEE_KEY = "theme-coffee";
// Pre-toggle scheme this replaces: a single "light" | "dark" | "coffee"
// value. Migrated on read (not eagerly rewritten) so an existing user's
// prior dark-mode choice keeps its exact prior appearance — the old "dark"
// palette (warm/brown) became the new "coffee dark" combination, so that's
// what a legacy "dark" selection maps to now, not the new neutral dark.
const LEGACY_KEY = "theme";

function migrateLegacy(): { mode: ThemeMode; coffee: boolean } | null {
  if (typeof localStorage === "undefined") return null;
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === "dark") return { mode: "dark", coffee: true };
  if (legacy === "coffee") return { mode: "light", coffee: true };
  if (legacy === "light") return { mode: "light", coffee: false };
  return null;
}

export function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return migrateLegacy()?.mode ?? "light";
}

export function getStoredCoffee(): boolean {
  const stored = localStorage.getItem(COFFEE_KEY);
  if (stored !== null) return stored === "true";
  return migrateLegacy()?.coffee ?? false;
}

export function applyTheme(mode: ThemeMode, coffee: boolean): void {
  const classList = document.documentElement.classList;
  classList.toggle("dark", mode === "dark");
  classList.toggle("coffee", coffee);
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(MODE_KEY, mode);
  applyTheme(mode, getStoredCoffee());
}

export function setCoffee(coffee: boolean): void {
  localStorage.setItem(COFFEE_KEY, String(coffee));
  applyTheme(getStoredThemeMode(), coffee);
}
