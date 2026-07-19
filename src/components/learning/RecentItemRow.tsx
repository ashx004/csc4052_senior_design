"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import { Timestamp } from "firebase/firestore";

export interface RecentItem {
  id: string;
  name: string;
  itemCount: number;
  createdAt: Timestamp | null;
}

interface RecentItemRowProps {
  item: RecentItem;
  courseId: string;
  courseName: string;
  kind: "flashcard" | "quiz";
  onDelete: (id: string) => void;
}

function formatDate(timestamp: Timestamp | null): string {
  if (!timestamp) return "—";
  const date = timestamp.toDate();
  return `${date.toLocaleString("en-US", { month: "short" })} ${date.getDate()} ${date.getFullYear()}`;
}

export default function RecentItemRow({ item, courseId, courseName, kind, onDelete }: RecentItemRowProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleRowClick = () => {
    if (kind === "flashcard") {
      router.push(`/courses/${courseId}/flashcards?setId=${item.id}`);
    } else {
      console.log("Quiz row clicked (quizzes feature not yet implemented):", item.id);
    }
  };

  const unitLabel = kind === "quiz" ? "quizzes" : "flashcards";

  return (
    <div
      onClick={handleRowClick}
      className="group relative flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-[#F5F0EB] transition-colors"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#1a1a2e]">{item.name}</p>
        <p className="truncate text-xs text-gray-400 mt-0.5">
          {courseName} • {item.itemCount} {unitLabel} • {formatDate(item.createdAt)}
        </p>
      </div>

      <div
        ref={menuRef}
        className="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          aria-label="More options"
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(item.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-600 hover:bg-[#F5F0EB] transition-colors"
            >
              <Trash2 size={14} />
              Remove from folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
