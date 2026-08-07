"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, List, HelpCircle, BookCopy, Home, Globe, Lock } from "lucide-react";
import Sidebar from "./Sidebar";
import SidebarItemMenu from "./SidebarItemMenu";
import { useAuth } from "@/src/context/AuthContext";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import type { StudySetVisibility } from "@/src/library/discover/types";

interface CourseSidebarProps {
  courseId: string;
  courseName?: string;
}

interface FlashcardSetSummary {
  id: string;
  name: string;
  // Missing/undefined is treated as "private", matching RecentItemRow's convention.
  visibility?: StudySetVisibility;
}

// Notes' entry was removed from here — Discover replaced it as a direct
// link below, not a dropdown. Summaries stays a hardcoded dropdown
// placeholder, untouched.
const PLACEHOLDER_SECTIONS = [
  { title: "Summaries", icon: List, items: ["Summary 1", "Summary 2", "Summary 3"] },
];

export default function CourseSidebar({ courseId, courseName }: CourseSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const base = `/courses/${courseId}`;
  const displayName = courseName || courseId.replace(/-/g, " ").toUpperCase();

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSetSummary[]>([]);
  const [quizSets, setQuizSets] = useState<FlashcardSetSummary[]>([]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  useEffect(() => {
    if (!user) {
      setFlashcardSets([]);
      return;
    }

    const setsRef = collection(db, "users", user.uid, "enrollment", courseId, "flashcardSets");
    const q = query(setsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setFlashcardSets(
          snapshot.docs
            .filter((docSnap) => docSnap.data().pinned !== false)
            .map((docSnap) => ({
              id: docSnap.id,
              name: (docSnap.data().name as string) || "Untitled",
              visibility: docSnap.data().visibility as StudySetVisibility | undefined,
            }))
        );
      },
      (error) => {
        console.error("Error fetching flashcard sets:", error);
        setFlashcardSets([]);
      }
    );

    return () => unsubscribe();
  }, [user, courseId]);

  useEffect(() => {
    if (!user) {
      setQuizSets([]);
      return;
    }

    const setsRef = collection(db, "users", user.uid, "enrollment", courseId, "quizSets");
    const q = query(setsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setQuizSets(
          snapshot.docs
            .filter((docSnap) => docSnap.data().pinned !== false)
            .map((docSnap) => ({
              id: docSnap.id,
              name: (docSnap.data().name as string) || "Untitled",
              visibility: docSnap.data().visibility as StudySetVisibility | undefined,
            }))
        );
      },
      (error) => {
        console.error("Error fetching quiz sets:", error);
        setQuizSets([]);
      }
    );

    return () => unsubscribe();
  }, [user, courseId]);

  const handleUnpinFlashcard = async (setId: string) => {
    if (!user) return;
    try {
      const setRef = doc(db, "users", user.uid, "enrollment", courseId, "flashcardSets", setId);
      await updateDoc(setRef, { pinned: false });
    } catch (error) {
      console.error("Error unpinning flashcard set:", error);
    }
  };

  const handleUnpinQuiz = async (setId: string) => {
    if (!user) return;
    try {
      const setRef = doc(db, "users", user.uid, "enrollment", courseId, "quizSets", setId);
      await updateDoc(setRef, { pinned: false });
    } catch (error) {
      console.error("Error unpinning quiz set:", error);
    }
  };

  return (
    <Sidebar>
      <div className="flex min-h-full flex-col">
        {/* Main course navigation */}
        <div>
          {/* Course name */}
          <div className="mb-4">
            <p className="px-2 text-sm font-bold text-text-main">{displayName}</p>
          </div>

          {/* Overview — standalone bold link, no icon */}
          <Link
            href={base}
            className={`block text-sm font-bold px-3 py-2.5 rounded-lg transition-colors ${
              pathname === base
                ? "bg-bg-warm text-text-main"
                : "text-text-main hover:bg-bg-warm"
            }`}
          >
            Overview
          </Link>

          {/* Discover — standalone direct link, same pattern as Overview/Learning */}
          <Link
            href={`${base}/discover`}
            className={`flex items-center gap-3 text-sm font-bold px-3 py-2.5 mt-1 rounded-lg transition-colors ${
              pathname === `${base}/discover`
                ? "bg-bg-warm text-text-main"
                : "text-text-main hover:bg-bg-warm"
            }`}
          >
            <span>Discover</span>
          </Link>

          {/* Learning — plain button, no dropdown */}
          <button
            onClick={() => router.push(`${base}/learning`)}
            className={`block w-full text-left text-sm font-bold px-3 py-2.5 mt-1 rounded-lg transition-colors ${
              pathname === `${base}/learning`
                ? "bg-bg-warm text-text-main"
                : "text-text-main hover:bg-bg-warm"
            }`}
          >
            Learning
          </button>

          {/* Flashcard — dropdown of pinned flashcard sets */}
          <div className="mt-1">
            <button
              onClick={() => toggleSection("Flashcard")}
              className="flex items-center justify-between w-full text-sm font-bold text-text-main px-3 py-2.5 rounded-lg hover:bg-bg-warm transition-colors"
            >
              <span>Flashcard</span>
              <ChevronDown
                size={16}
                className={`text-text-muted transition-transform duration-200 ${
                  openSections["Flashcard"] ? "rotate-180" : ""
                }`}
              />
            </button>

            {openSections["Flashcard"] && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {flashcardSets.length > 0 ? (
                  flashcardSets.map((set) => (
                    <div
                      key={set.id}
                      className="group relative flex items-center rounded-lg hover:bg-bg-warm transition-colors"
                    >
                      <Link
                        href={`${base}/flashcards?setId=${set.id}`}
                        className="flex flex-1 min-w-0 items-center gap-1.5 px-3 py-2 text-sm text-text-muted"
                      >
                        <BookCopy size={19} className="shrink-0" />
                        <span className="truncate">{set.name}</span>
                        {set.visibility === "public" ? (
                          <Globe size={14} className="shrink-0 text-text-muted" aria-label="Public" />
                        ) : (
                          <Lock size={14} className="shrink-0 text-text-muted" aria-label="Private" />
                        )}
                      </Link>
                      <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SidebarItemMenu onUnpin={() => handleUnpinFlashcard(set.id)} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-text-muted">No flashcards pinned</p>
                )}
              </div>
            )}
          </div>

          {/* Quizzes — dropdown */}
          <div className="mt-1">
            <button
              onClick={() => toggleSection("Quizzes")}
              className="flex items-center justify-between w-full text-sm font-bold text-text-main px-3 py-2.5 rounded-lg hover:bg-bg-warm transition-colors"
            >
              <span>Quizzes</span>
              <ChevronDown
                size={16}
                className={`text-text-muted transition-transform duration-200 ${
                  openSections["Quizzes"] ? "rotate-180" : ""
                }`}
              />
            </button>

            {openSections["Quizzes"] && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {quizSets.length > 0 ? (
                  quizSets.map((set) => (
                    <div
                      key={set.id}
                      className="group relative flex items-center rounded-lg hover:bg-bg-warm transition-colors"
                    >
                      <Link
                        href={`${base}/quizzes/${set.id}`}
                        className="flex flex-1 min-w-0 items-center gap-1.5 px-3 py-2 text-sm text-text-muted"
                      >
                        <HelpCircle size={16} strokeWidth={1.5} className="shrink-0" />
                        <span className="truncate">{set.name}</span>
                        {set.visibility === "public" ? (
                          <Globe size={14} className="shrink-0 text-text-muted" aria-label="Public" />
                        ) : (
                          <Lock size={14} className="shrink-0 text-text-muted" aria-label="Private" />
                        )}
                      </Link>
                      <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SidebarItemMenu onUnpin={() => handleUnpinQuiz(set.id)} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-text-muted">No quizzes yet</p>
                )}
              </div>
            )}
          </div>

          {/* Summaries — hardcoded dropdown placeholder */}
          {PLACEHOLDER_SECTIONS.slice(0, 1).map(({ title, icon: Icon, items }) => {
            const isOpen = openSections[title] || false;
            const href = `${base}/summaries`;

            return (
              <div key={title} className="mt-1">
                <button
                  onClick={() => {
                    toggleSection(title);
                    router.push(href);
                  }}
                  className="flex items-center justify-between w-full text-sm font-bold text-text-main px-3 py-2.5 rounded-lg hover:bg-bg-warm transition-colors"
                >
                  <span>{title}</span>
                  <ChevronDown
                    size={16}
                    className={`text-text-muted transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="ml-2 mt-0.5 space-y-0.5">
                    {items.map((item) => (
                      <Link
                        key={item}
                        href={href}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-text-muted hover:bg-bg-warm rounded-lg transition-colors"
                      >
                        <Icon size={16} strokeWidth={1.5} className="shrink-0" />
                        <span>{item}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Assignments */}
          <Link
            href={`${base}/assignments`}
            className={`block text-sm font-bold px-3 py-2.5 mt-1 rounded-lg transition-colors ${
              pathname === `${base}/assignments`
                ? "bg-bg-warm text-text-main"
                : "text-text-main hover:bg-bg-warm"
            }`}
          >
            Assignments
          </Link>

          {/* Due Dates */}
          <Link
            href={`${base}/due-dates`}
            className={`block text-sm font-bold px-3 py-2.5 mt-1 rounded-lg transition-colors ${
              pathname === `${base}/due-dates`
                ? "bg-bg-warm text-text-main"
                : "text-text-main hover:bg-bg-warm"
            }`}
          >
            Due Dates
          </Link>
        </div>

        {/* Bottom navigation — pushed to bottom via mt-auto */}
        <div className="mt-auto pt-6">
          <Link
            href="/classes"
            className="flex justify-end gap-2 text-xs text-text-muted transition-colors hover:text-text-main"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
            <span>Back to Classes</span>
          </Link>

          <div className="my-4 border-t border-border-light" />

          <Link
            href="/dashboard"
            className="
              flex w-full items-center gap-3 rounded-lg
              px-3 py-2.5
              text-sm font-bold text-text-main
              transition-colors hover:bg-bg-warm
            "
          >
            <Home size={20} strokeWidth={1.5} />
            <span>Home</span>
          </Link>
        </div>
      </div>
    </Sidebar>
  );
}
