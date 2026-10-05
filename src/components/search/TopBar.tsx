"use client";

import { usePathname } from "next/navigation";
import SearchBar from "./SearchBar";
import type { SearchEntry } from "@/src/library/search/siteSearchIndex";

type TopBarProps = {
  extraSearchEntries?: SearchEntry[];
};

// Pages with their own header that show the search as just a magnifying-glass
// button there (SearchBar's compact mode) instead of this bar.
const PAGES_WITH_COMPACT_SEARCH = ["/learning"];

// The bar across the top of every dashboard and course page. On phones the
// sidebar's fixed menu button (Sidebar.tsx, top-3 left-4, 40px) sits centered
// in this bar's left padding, so it never covers the search box or the page.
// On desktop it matches the sidebar header's height (68px) so the two line up.
export default function TopBar({ extraSearchEntries }: TopBarProps) {
  const pathname = usePathname();

  if (PAGES_WITH_COMPACT_SEARCH.includes(pathname)) {
    // No bar, but phones still need the space under the fixed menu button.
    return <div className="h-16 shrink-0 md:hidden" aria-hidden="true" />;
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-center border-b border-border-light bg-bg-main pl-16 pr-4 md:h-[68px] md:px-6">
      <SearchBar extraEntries={extraSearchEntries} />
    </header>
  );
}
