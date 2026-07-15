"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname,  useRouter } from "next/navigation";
import {ArrowLeft,ChevronDown,FileText,BookOpen,List,} from "lucide-react";
import Sidebar from "./Sidebar";
import { useAuth } from "@/src/context/AuthContext";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/src/library/firebase";

interface CourseSidebarProps {
  courseId: string;
  courseName?: string;
}

interface FlashcardSetSummary {
  id: string;
  name: string;
}

export default function CourseSidebar({ courseId, courseName }: CourseSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const base = `/courses/${courseId}`;
  const displayName = courseName || courseId.replace(/-/g, " ").toUpperCase();

  // Track which dropdown sections are open
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSetSummary[]>([]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Real flashcard sets for the "Learning" dropdown
  useEffect(() => {
    if (!user) {
      setFlashcardSets([]);
      return;
    }

    const setsRef = collection(db, "users", user.uid, "enrollment", courseId, "flashcardSets");
    const q = query(setsRef, orderBy("createdAt", "desc"));

    getDocs(q)
      .then((snapshot) => {
        setFlashcardSets(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            name: (docSnap.data().name as string) || "Untitled",
          }))
        );
      })
      .catch((error) => {
        console.error("Error fetching flashcard sets:", error);
        setFlashcardSets([]);
      });
  }, [user, courseId]);

  // Dropdown sections: icons moved from parent to sub-items
  const dropdownSections = [
    {
      title: "Notes",
      icon: FileText,
      href: `${base}/notes`,
      items: ["Note 1", "Note 2", "Note 3"],
    },
    {
      title: "Learning",
      icon: BookOpen,
      href: `${base}/learning`,
      items: [] as string[],
    },
    {
      title: "Summaries",
      icon: List,
      href: `${base}/summaries`,
      items: ["Summary 1", "Summary 2", "Summary 3"],
    },
  ];

  return (
    <Sidebar>
      {/* Course name */}
      <div className="mb-4">
        <p className="px-2 text-sm font-bold text-gray-900">{displayName}</p>
      </div>

      {/* Overview — standalone bold link, no icon */}
      <Link
        href={base}
        className={`block text-sm font-bold px-3 py-2.5 rounded-lg transition-colors ${
          pathname === base
            ? "bg-[#F5F0EB] text-gray-900"
            : "text-gray-900 hover:bg-[#F5F0EB]"
        }`}
      >
        Overview
      </Link>

      {/* Dropdown sections: Notes, Learning, Summaries */}
      {dropdownSections.map(({ title, icon: Icon, href, items }) => {
        const isOpen = openSections[title] || false;

        return (
          <div key={title} className="mt-1">
            {/* Dropdown toggle — bold text + rotating chevron */}
            <button
              onClick={() => {
                toggleSection(title);
                router.push(href);
              }}
              className="flex items-center justify-between w-full text-sm font-bold text-gray-900 px-3 py-2.5 rounded-lg hover:bg-[#F5F0EB] transition-colors"
            >
              <span>{title}</span>
              <ChevronDown
                size={16}
                className={`text-gray-500 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Sub-items — icon (moved from parent) + placeholder text */}
            {isOpen && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {title === "Learning" ? (
                  flashcardSets.length > 0 ? (
                    flashcardSets.map((set) => (
                      <Link
                        key={set.id}
                        href={`${base}/flashcards?setId=${set.id}`}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-[#F5F0EB] rounded-lg transition-colors"
                      >
                        <Icon size={16} strokeWidth={1.5} className="shrink-0" />
                        <span className="truncate">{set.name}</span>
                      </Link>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-gray-400">No flashcards yet</p>
                  )
                ) : (
                  items.map((item) => (
                    <Link
                      key={item}
                      href={href}
                      className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-[#F5F0EB] rounded-lg transition-colors"
                    >
                      <Icon size={16} strokeWidth={1.5} className="shrink-0" />
                      <span>{item}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Assignments — standalone bold link, no icon */}
      <Link
        href={`${base}/assignments`}
        className={`block text-sm font-bold px-3 py-2.5 mt-1 rounded-lg transition-colors ${
          pathname === `${base}/assignments`
            ? "bg-[#F5F0EB] text-gray-900"
            : "text-gray-900 hover:bg-[#F5F0EB]"
        }`}
      >
        Assignments
      </Link>

      {/* Due Dates — standalone bold link, no icon */}
      <Link
        href={`${base}/due-dates`}
        className={`block text-sm font-bold px-3 py-2.5 mt-1 rounded-lg transition-colors ${
          pathname === `${base}/due-dates`
            ? "bg-[#F5F0EB] text-gray-900"
            : "text-gray-900 hover:bg-[#F5F0EB]"
        }`}
      >
        Due Dates
      </Link>
      {/* Back link */}
      <Link
          href="/classes"
          className="mt-1 flex justify-end gap-2 text-xs text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          <span>Back to Classes</span>
        </Link>
    </Sidebar>
  );
}
