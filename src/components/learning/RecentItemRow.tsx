"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Pin, PinOff, Globe, Lock } from "lucide-react";
import { doc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import type { StudySetVisibility } from "@/src/library/discover/types";

export interface RecentItem {
  id: string;
  name: string;
  itemCount: number;
  createdAt: Timestamp | null;
  pinned?: boolean;
  // Missing/undefined is treated as "private" — see requirement C (existing
  // records must not be retroactively treated as public).
  visibility?: StudySetVisibility;
  publicSetId?: string;
}

interface RecentItemRowProps {
  item: RecentItem;
  courseId: string;
  courseName: string;
  kind: "flashcard" | "quiz";
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  togglingVisibility?: boolean;
}

function formatDate(timestamp: Timestamp | null): string {
  if (!timestamp) return "—";
  const date = timestamp.toDate();
  return `${date.toLocaleString("en-US", { month: "short" })} ${date.getDate()} ${date.getFullYear()}`;
}

export default function RecentItemRow({
  item,
  courseId,
  courseName,
  kind,
  onDelete,
  onToggleVisibility,
  togglingVisibility = false,
}: RecentItemRowProps) {
  const router = useRouter();
  const { user } = useAuth();
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
      router.push(`/courses/${courseId}/quizzes/${item.id}`);
    }
  };

  // Missing `pinned` is treated as pinned, matching the sidebar's default-pinned convention
  const isPinned = item.pinned !== false;
  // Missing `visibility` is treated as private — existing sets are never
  // retroactively made public.
  const isPublic = item.visibility === "public";
  const unitLabel = kind === "quiz" ? "quizzes" : "flashcards";
  const collectionName = kind === "quiz" ? "quizSets" : "flashcardSets";

  const handleTogglePin = async () => {
    if (!user) return;
    try {
      const setRef = doc(db, "users", user.uid, "enrollment", courseId, collectionName, item.id);
      await updateDoc(setRef, { pinned: !isPinned });
    } catch (error) {
      console.error("Error toggling pin state:", error);
    }
  };

  return (
    <div
      onClick={handleRowClick}
      className="group relative flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-[#F5F0EB] transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {isPublic ? (
            <Globe size={14} className="shrink-0 text-gray-400" aria-label="Public" />
          ) : (
            <Lock size={14} className="shrink-0 text-gray-400" aria-label="Private" />
          )}
          <p className="truncate text-sm font-semibold text-[#1a1a2e]">{item.name}</p>
          {isPinned && (
            <Pin
              size={11}
              strokeWidth={2}
              className="shrink-0 text-text-muted"
              aria-label="Pinned to sidebar"
            />
          )}
        </div>
        <p className="truncate text-xs text-text-muted mt-0.5">
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
          className="p-1.5 rounded-md text-text-muted hover:text-text-main hover:bg-bg-warm transition-colors"
          aria-label="More options"
        >
          <MoreVertical size={16} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border-light bg-bg-container py-1 shadow-lg">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                handleTogglePin();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-[#F5F0EB] transition-colors"
            >
              {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
              {isPinned ? "Unpin from sidebar" : "Pin to sidebar"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onToggleVisibility(item.id);
              }}
              disabled={togglingVisibility}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-[#F5F0EB] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPublic ? <Lock size={14} /> : <Globe size={14} />}
              {isPublic ? "Make private" : "Share with classmates"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(item.id);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-[#F5F0EB] transition-colors"
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
