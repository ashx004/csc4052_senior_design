"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, Settings, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface SidebarProps {
  children: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const router = useRouter();
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <>
      {/* Hamburger button — visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-6 left-6 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-white shadow-md transition-colors hover:bg-navy/90"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Sidebar panel — in document flow, pushes content right */}
      <aside
        ref={sidebarRef}
        className={`h-screen shrink-0 overflow-hidden bg-navy text-white transition-[width] duration-300 ease-in-out ${
          isOpen ? "w-72" : "w-0"
        }`}
      >
        {/* Inner wrapper — fixed width prevents text from wrapping during the width animation */}
        <div className="min-w-[18rem] h-full flex flex-col">
          {/* Header: logo + close */}
          <div className="flex h-[68px] shrink-0 items-center justify-between px-5">
            <h1 className="text-xl font-bold tracking-[0.15em] text-white">
              C a t a l y s t.
            </h1>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-sm text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Collapse navigation"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Navigation content (from GeneralSidebar or CourseSidebar) */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {children}
          </nav>

          <div className="mx-3 mb-4 rounded-2xl bg-white/10 px-4 py-4 text-xs leading-relaxed text-white/75">
            <strong className="mb-1 block text-white">Study companion</strong>
            Keep your focus gentle and consistent. One useful session at a time.
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="mt-3 flex min-h-9 items-center gap-2 rounded-lg text-white/65 transition-colors hover:text-white"
              aria-label="Open settings"
            >
              <Settings size={15} aria-hidden="true" />
              Settings
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
