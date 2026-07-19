"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical,PinOff } from "lucide-react";

interface SidebarItemMenuProps {
  onUnpin: () => void;
}

export default function SidebarItemMenu({ onUnpin }: SidebarItemMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
        aria-label="More options"
      >
        <MoreVertical size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onUnpin();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-600 hover:bg-[#F5F0EB] transition-colors"
          >
            <PinOff size={14} />
            Unpin from sidebar
          </button>
        </div>
      )}
    </div>
  );
}
