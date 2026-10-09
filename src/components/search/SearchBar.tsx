"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchSite } from "@/src/library/search/siteSearch";
import { SITE_SEARCH_ENTRIES, type SearchEntry } from "@/src/library/search/siteSearchIndex";

const MAX_RESULTS = 8;

// Shown when the box is focused but empty, so it doubles as a quick launcher.
const QUICK_LINKS = SITE_SEARCH_ENTRIES.filter((entry) => entry.category === "Page").slice(0, 6);

type SearchBarProps = {
  // Extra entries for where the student is right now - e.g. the current
  // class's own sections on course pages.
  extraEntries?: SearchEntry[];
  // Just a magnifying-glass button that opens the search box as a popover,
  // for pages with their own header (Learning) instead of the top bar.
  compact?: boolean;
};

export default function SearchBar({ extraEntries = [], compact = false }: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // The server can't know the platform, so it renders "Ctrl S"; a Mac
  // browser swaps in "⌘ S" (suppressHydrationWarning on the <kbd> below).
  const [shortcutLabel] = useState(() =>
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ S" : "Ctrl S"
  );

  const entries = useMemo(() => [...extraEntries, ...SITE_SEARCH_ENTRIES], [extraEntries]);
  const results = useMemo(
    () => (query.trim() ? searchSite(query, entries, MAX_RESULTS) : QUICK_LINKS),
    [query, entries]
  );

  // Ctrl+S (Cmd+S on Mac) jumps to the search bar from anywhere on the
  // site, instead of the browser's "Save page" dialog.
  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        inputRef.current?.focus(); // compact: not mounted yet - see the effect below
        inputRef.current?.select();
        setIsOpen(true);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  // Compact mode only shows the input once opened, so focus it then.
  useEffect(() => {
    if (compact && isOpen) inputRef.current?.focus();
  }, [compact, isOpen]);

  // Close when clicking anywhere outside the search bar and its results.
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function goTo(entry: SearchEntry) {
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
    router.push(entry.href);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      goTo(results[Math.min(activeIndex, results.length - 1)]);
    }
  }

  const showPanel = isOpen && (results.length > 0 || query.trim() !== "");
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  return (
    <div ref={containerRef} className={compact ? "relative" : "relative w-full max-w-xl"}>
      {compact && (
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-label="Search Catalyst"
          aria-expanded={isOpen}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-gray-secondary transition-colors hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          <Search size={18} aria-hidden="true" />
        </button>
      )}

      {(!compact || isOpen) && (
      <div className={compact ? "absolute right-0 top-0 z-40 w-[min(28rem,calc(100vw-3rem))]" : "relative"}>
      <div className={`flex items-center gap-2 rounded-xl border border-border-light bg-bg-container px-3 py-2 transition-colors focus-within:border-border-hover ${compact ? "shadow-lg" : "shadow-sm"}`}>
        <Search size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search Catalyst…"
          aria-label="Search Catalyst"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && results.length ? optionId(activeIndex) : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none"
        />
        <kbd suppressHydrationWarning className="hidden shrink-0 rounded-md border border-border-light px-1.5 py-0.5 text-[11px] font-medium text-text-muted sm:inline">
          {shortcutLabel}
        </kbd>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-border-light bg-bg-container shadow-lg">
          {!query.trim() && (
            <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Quick links
            </p>
          )}

          {results.length > 0 ? (
            <ul id={listboxId} role="listbox" aria-label="Search results" className="max-h-96 overflow-y-auto py-1">
              {results.map((entry, index) => (
                <li
                  key={entry.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  // mousedown, not click: fires before the input's blur, so
                  // the panel can't close before the selection registers.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    goTo(entry);
                  }}
                  className={`flex cursor-pointer items-start justify-between gap-3 px-4 py-2.5 ${
                    index === activeIndex ? "bg-bg-main" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-main">{entry.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{entry.description}</p>
                  </div>
                  <span className="mt-0.5 shrink-0 rounded-full border border-border-light px-2 py-0.5 text-[10px] font-medium text-text-muted">
                    {entry.category}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listboxId} className="px-4 py-4 text-sm text-text-muted">
              No pages or features match &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
        </div>
      )}
      </div>
      )}
    </div>
  );
}
