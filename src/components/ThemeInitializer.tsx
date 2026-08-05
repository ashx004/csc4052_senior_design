"use client";

import { useEffect } from "react";
import { applyTheme, getStoredCoffee, getStoredThemeMode } from "@/src/library/theme";

export default function ThemeInitializer() {
  useEffect(() => {
    applyTheme(getStoredThemeMode(), getStoredCoffee());
  }, []);

  return null;
}
