"use client";

import { useState } from "react";
import { Menu, X, Plus, Search, Settings } from "lucide-react";

interface SidebarProps {
  children: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Hamburger button — visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-6 left-6 z-10 p-2 rounded-full hover:bg-bg-warm transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-text-main" />
        </button>
      )}

      {/* Sidebar panel — in document flow, pushes content right */}
      <aside
        className={`h-screen bg-bg-container shrink-0 flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out ${
          isOpen ? "w-72 border-r border-border-light" : "w-0"
        }`}
      >
        {/* Inner wrapper — fixed width prevents text from wrapping during the width animation */}
        <div className="min-w-[18rem] h-full flex flex-col">
          {/* Header: logo + close */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h1 className="text-xl font-bold tracking-[0.15em] text-text-main">
              C a t a l y s t.
            </h1>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-text-muted hover:text-text-main rounded-full transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Icon row: menu, add, search */}
          <div className="flex items-center justify-between px-3 pb-2 border-b border-border-light">
            <button className="p-1 text-text-muted hover:text-text-main transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-4">
              <button className="p-1 text-text-muted hover:text-text-main transition-colors">
                <Plus className="w-5 h-5" />
              </button>
              <button className="p-1 text-text-muted hover:text-text-main transition-colors">
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation content (from GeneralSidebar or CourseSidebar) */}
          <nav className="flex-1 overflow-y-auto px-4 py-4">
            {children}
          </nav>

          {/* Footer: settings gear */}
          <div className="flex justify-end px-3 py-1 border-t border-border-light">
            <button className="p-1 text-text-muted hover:text-text-main transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}