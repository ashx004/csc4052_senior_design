"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronDown, HelpCircle, BookCopy, Home, Globe, Lock, GraduationCap } from "lucide-react";
import Sidebar from "./Sidebar";
import SidebarItemMenu from "./SidebarItemMenu";
import { useAuth } from "@/src/context/AuthContext";
import { studySetRoutes } from "@/src/library/studySets/routes";
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

export default function CourseSidebar({ courseId, courseName }: CourseSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const base = `/courses/${courseId}`;
  const routes = studySetRoutes(courseId);
  const linkClass = (active: boolean) =>
    `block flex-1 text-left text-sm font-semibold px-3 py-3 rounded-xl transition-colors ${
      active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"
    }`;
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
            <p className="px-2 text-sm font-bold text-white">{displayName}</p>
          </div>

          {/* Overview — standalone bold link, no icon */}
          <Link
            href={base}
            className={`block text-sm font-semibold px-3 py-3 rounded-xl transition-colors ${
              pathname === base
                ? "bg-white/15 text-white"
                : "text-white/65 hover:bg-white/10 hover:text-white"
            }`}
          >
            Overview
          </Link>

          {/* Discover — standalone direct link, same pattern as Overview/Learning */}
          <Link
            href={`${base}/discover`}
            className={`flex items-center gap-3 text-sm font-semibold px-3 py-3 mt-1 rounded-xl transition-colors ${
              pathname === `${base}/discover`
                ? "bg-white/15 text-white"
                : "text-white/65 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>Discover</span>
          </Link>

          {/* Notes - this class's own notes and notebooks (see NotesLibrary) */}
          <Link
            href={`${base}/notes`}
            className={`flex items-center gap-3 text-sm font-semibold px-3 py-3 mt-1 rounded-xl transition-colors ${
              pathname === `${base}/notes`
                ? "bg-white/15 text-white"
                : "text-white/65 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>Notes</span>
          </Link>

          <Link href={routes.hub} className={`mt-1 ${linkClass(pathname === routes.hub || pathname === `${base}/learning`)}`}>
            My Study Sets
          </Link>

          <div className="mt-1 flex items-center">
            <Link href={routes.flashcards} className={linkClass(pathname === routes.flashcards || pathname.startsWith(`${base}/flashcards`))}>
              Flashcards
            </Link>
            <button
              type="button"
              aria-label="Show pinned flashcards"
              onClick={() => toggleSection("Flashcard")}
              className="rounded-xl p-3 text-white/65 hover:bg-white/10 hover:text-white"
            >
              <ChevronDown size={16} className={`transition-transform duration-200 ${openSections["Flashcard"] ? "rotate-180" : ""}`} />
            </button>
          </div>
          <div>

            {openSections["Flashcard"] && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {flashcardSets.length > 0 ? (
                  flashcardSets.map((set) => (
                    <div
                      key={set.id}
                      className="group relative flex items-center rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <Link
                        href={`${base}/flashcards?setId=${set.id}`}
                        className="flex flex-1 min-w-0 items-center gap-1.5 px-3 py-2 text-sm text-white/65"
                      >
                        <BookCopy size={19} className="shrink-0" />
                        <span className="truncate">{set.name}</span>
                        {set.visibility === "public" ? (
                          <Globe size={14} className="shrink-0 text-white/65" aria-label="Public" />
                        ) : (
                          <Lock size={14} className="shrink-0 text-white/65" aria-label="Private" />
                        )}
                      </Link>
                      <div className="pr-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <SidebarItemMenu onUnpin={() => handleUnpinFlashcard(set.id)} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-white/65">No flashcards pinned</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-1 flex items-center">
            <Link href={routes.quizzes} className={linkClass(pathname === routes.quizzes || pathname.startsWith(`${base}/quizzes`))}>
              Quizzes
            </Link>
            <button
              type="button"
              aria-label="Show pinned quizzes"
              onClick={() => toggleSection("Quizzes")}
              className="rounded-xl p-3 text-white/65 hover:bg-white/10 hover:text-white"
            >
              <ChevronDown size={16} className={`transition-transform duration-200 ${openSections["Quizzes"] ? "rotate-180" : ""}`} />
            </button>
          </div>
          <div>

            {openSections["Quizzes"] && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {quizSets.length > 0 ? (
                  quizSets.map((set) => (
                    <div
                      key={set.id}
                      className="group relative flex items-center rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <Link
                        href={`${base}/quizzes/${set.id}`}
                        className="flex flex-1 min-w-0 items-center gap-1.5 px-3 py-2 text-sm text-white/65"
                      >
                        <HelpCircle size={16} strokeWidth={1.5} className="shrink-0" />
                        <span className="truncate">{set.name}</span>
                        {set.visibility === "public" ? (
                          <Globe size={14} className="shrink-0 text-white/65" aria-label="Public" />
                        ) : (
                          <Lock size={14} className="shrink-0 text-white/65" aria-label="Private" />
                        )}
                      </Link>
                      <div className="pr-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <SidebarItemMenu onUnpin={() => handleUnpinQuiz(set.id)} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-white/65">No quizzes yet</p>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Bottom navigation — pushed to bottom via mt-auto */}
        <div className="mt-auto pt-6">
          <Link
            href="/classes"
            className="flex justify-end gap-2 text-xs text-white/65 transition-colors hover:text-white"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
            <span>Back to Classes</span>
          </Link>

          <div className="my-4 border-t border-white/15" />

          <Link
            href="/dashboard"
            className="
              flex w-full items-center gap-3 rounded-xl
              px-3 py-3
              text-sm font-semibold text-white/65
              transition-colors hover:bg-white/10 hover:text-white
            "
          >
            <Home size={20} strokeWidth={1.5} />
            <span>Home</span>
          </Link>

          <Link
            href="/learning"
            className="
              flex w-full items-center gap-3 rounded-xl
              px-3 py-3 mt-1
              text-sm font-semibold text-white/65
              transition-colors hover:bg-white/10 hover:text-white
            "
          >
            <GraduationCap size={20} strokeWidth={1.5} />
            <span>Learning</span>
          </Link>
        </div>
      </div>
    </Sidebar>
  );
}
