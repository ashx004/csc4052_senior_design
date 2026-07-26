"use client";

import { useEffect } from "react";

export default function ThemeInitializer() {
  useEffect(() => {
    const selectedTheme = localStorage.getItem("theme");
    const isDark = selectedTheme === "dark";

    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  return null;
}