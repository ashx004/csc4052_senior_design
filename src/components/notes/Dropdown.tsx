"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Smaller text under the label (e.g. a class's full name). */
  hint?: string;
}

/** A listbox that looks like the rest of the notes UI (native selects
 *  render in the browser's own style). Keyboard: arrows, Home/End, Enter,
 *  Escape, and type-to-jump. */
export default function Dropdown<T extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  icon,
  align = "left",
  className = "",
  dataTutorial,
}: {
  id?: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  icon?: ReactNode;
  align?: "left" | "right";
  className?: string;
  dataTutorial?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openList() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    buttonRef.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  }

  function onListKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === "ArrowDown") setActiveIndex((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActiveIndex((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActiveIndex(0);
    else if (e.key === "End") setActiveIndex(last);
    else if (e.key === "Enter" || e.key === " ") choose(activeIndex);
    else if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const start = activeIndex + 1;
      const key = e.key.toLowerCase();
      const hit = [...options.slice(start), ...options.slice(0, start)].find((o) => o.label.toLowerCase().startsWith(key));
      if (hit) setActiveIndex(options.indexOf(hit));
      return;
    } else return;
    e.preventDefault();
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${current?.label ?? ""}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        className={`flex w-full items-center gap-2 rounded-lg border bg-bg-container px-3 py-2 text-left text-sm text-text-main transition-colors hover:border-border-hover ${
          open ? "border-primary" : "border-border-light"
        }`}
        data-tutorial={dataTutorial}
      >
        {icon && <span className="shrink-0 text-text-muted">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{current?.label}</span>
        <ChevronDown size={15} className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${activeIndex}`}
          onKeyDown={onListKey}
          className={`absolute top-full z-30 mt-1 max-h-72 min-w-full overflow-y-auto rounded-xl border border-border-light bg-bg-container p-1 shadow-lg outline-none ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={`flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm ${
                i === activeIndex ? "bg-bg-warm" : ""
              } ${o.value === value ? "font-medium text-text-main" : "text-text-main"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.hint && <span className="block truncate text-xs font-normal text-text-muted">{o.hint}</span>}
              </span>
              <Check size={14} className={`shrink-0 text-primary ${o.value === value ? "" : "invisible"}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
