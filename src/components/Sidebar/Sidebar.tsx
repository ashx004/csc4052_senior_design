"use client";

import { useState } from "react";
import { Menu, X, Plus, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

interface SidebarProps {
  children: React.ReactNode;
}


export default function Sidebar({ children }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      {/* Hamburger button — visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-6 left-6 z-10 p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-gray-800" />
        </button>
      )}

      {/* Sidebar panel — in document flow, pushes content right */}
      <aside
        className={`h-screen bg-[#FAFAF8] shrink-0 flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out ${
          isOpen ? "w-72 border-r border-gray-200" : "w-0"
        }`}
      >
        {/* Inner wrapper — fixed width prevents text from wrapping during the width animation */}
        <div className="min-w-[18rem] h-full flex flex-col">
          {/* Header: logo + close */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h1 className="text-xl font-bold tracking-[0.15em] text-gray-900">
              s t u d o r a.
            </h1>

            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Icon row: menu, add, search */}
          <div className="flex items-center justify-between px-3 pb-2 border-b border-gray-200">
            <button className="p-1 text-gray-600 hover:text-gray-800 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-4">
              <button className="p-1 text-gray-600 hover:text-gray-800 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
              <button className="p-1 text-gray-600 hover:text-gray-800 transition-colors">
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation content (from GeneralSidebar or CourseSidebar) */}
          <nav className="flex-1 overflow-y-auto px-4 py-4">
            {children}
          </nav>

          {/* Footer: settings gear */}
          <div className="flex justify-end px-3 py-1 border-t border-gray-100">
            <button 
              type="button"
              onClick={() => router.push("/settings")}
              className="p-1 text-gray-500 hover:text-gray-800 transition-colors"
              aria-label="open settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}