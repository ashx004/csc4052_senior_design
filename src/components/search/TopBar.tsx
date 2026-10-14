"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import SearchBar from "./SearchBar";
import { useSearchBarEnabled } from "@/src/library/searchBarPreference";
import type { SearchEntry } from "@/src/library/search/siteSearchIndex";

type TopBarProps = {
  extraSearchEntries?: SearchEntry[];
};

// Learning and its inner pages (classes, study plan) show search as the
// magnifying-glass button in WorkspaceHeader, instead of this bar.
function usesCompactSearch(pathname: string): boolean {
  return pathname === "/learning" || pathname.startsWith("/learning/");
}

// The bar across the top of every dashboard and course page. On phones the
// sidebar's fixed menu button (Sidebar.tsx, top-3 left-4, 40px) sits centered
// in this bar's left padding, so it never covers the search box or the page.
// On desktop it matches the sidebar header's height (68px) so the two line up.
export default function TopBar({ extraSearchEntries }: TopBarProps) {
  const pathname = usePathname();
  const enabled = useSearchBarEnabled();
  const showBar = enabled && !usesCompactSearch(pathname);

  // Tells global.css how much height the bar takes (--topbar-h), so full-height
  // pages inside <main> shrink by that much instead of overflowing below it.
  useEffect(() => {
    document.documentElement.dataset.topbar = showBar ? "bar" : "spacer";
    return () => {
      delete document.documentElement.dataset.topbar;
    };
  }, [showBar]);

  if (!showBar) {
    // No bar (turned off in Settings, or the page has its own compact search),
    // but phones still need the space under the fixed menu button.
    return <div className="h-16 shrink-0 md:hidden" aria-hidden="true" />;
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-center border-b border-border-light bg-bg-main pl-16 pr-4 md:h-[68px] md:px-6">
      <SearchBar extraEntries={extraSearchEntries} />
    </header>
  );
}
