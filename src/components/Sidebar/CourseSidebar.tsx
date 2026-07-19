"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, FileText, List, HelpCircle, BookCopy} from "lucide-react";
import Sidebar from "./Sidebar";
import SidebarItemMenu from "./SidebarItemMenu";
import { useAuth } from "@/src/context/AuthContext";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";

interface CourseSidebarProps {
  courseId: string;
  courseName?: string;
}

interface FlashcardSetSummary {
  id: string;
  name: string;
}

// Hardcoded placeholder dropdowns — data-driven sections (Flashcard, Quizzes) are handled separately
const PLACEHOLDER_SECTIONS = [
  { title: "Notes", icon: FileText, items: ["Note 1", "Note 2", "Note 3"] },
  { title: "Summaries", icon: List, items: ["Summary 1", "Summary 2", "Summary 3"] },
];

export default function CourseSidebar({ courseId, courseName }: CourseSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const base = `/courses/${courseId}`;
  const displayName = courseName || courseId.replace(/-/g, " ").toUpperCase();

  // Track which dropdown sections are open
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [flashcardSets, setFlashcardSets] = useState<FlashcardSetSummary[]>([]);
  const [quizSets, setQuizSets] = useState<FlashcardSetSummary[]>([]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Pinned flashcard sets — a doc counts as pinned if `pinned` is true or missing (default behavior)
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

  // Quizzes — quizSets collection does not exist yet, so this stays empty
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

      {/* Notes — hardcoded dropdown placeholder */}
      {PLACEHOLDER_SECTIONS.slice(0, 1).map(({ title, icon: Icon, items }) => {
        const isOpen = openSections[title] || false;
        const href = `${base}/notes`;

        return (
          <div key={title} className="mt-1">
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

            {isOpen && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {items.map((item) => (
                  <Link
                    key={item}
                    href={href}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-[#F5F0EB] rounded-lg transition-colors"
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

      {/* Learning — plain button, no dropdown */}
      <button
        onClick={() => router.push(`${base}/learning`)}
        className={`block w-full text-left text-sm font-bold px-3 py-2.5 mt-1 rounded-lg transition-colors ${
          pathname === `${base}/learning`
            ? "bg-[#F5F0EB] text-gray-900"
            : "text-gray-900 hover:bg-[#F5F0EB]"
        }`}
      >
        Learning
      </button>

      {/* Flashcard — dropdown of pinned flashcard sets, with hover 3-dot menu */}
      <div className="mt-1">
        <button
          onClick={() => toggleSection("Flashcard")}
          className="flex items-center justify-between w-full text-sm font-bold text-gray-900 px-3 py-2.5 rounded-lg hover:bg-[#F5F0EB] transition-colors"
        >
          <span>Flashcard</span>
          <ChevronDown
            size={16}
            className={`text-gray-500 transition-transform duration-200 ${
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
                  className="group relative flex items-center rounded-lg hover:bg-[#F5F0EB] transition-colors"
                >
                  <Link
                    href={`${base}/flashcards?setId=${set.id}`}
                    className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-sm text-gray-600"
                  >
                    <BookCopy size={19} />
                    <span className="truncate">{set.name}</span>
                  </Link>
                  <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <SidebarItemMenu onUnpin={() => handleUnpinFlashcard(set.id)} />
                  </div>
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-gray-400">No flashcards pinned</p>
            )}
          </div>
        )}
      </div>

      {/* Quizzes — dropdown, empty until the quizzes feature is built */}
      <div className="mt-1">
        <button
          onClick={() => toggleSection("Quizzes")}
          className="flex items-center justify-between w-full text-sm font-bold text-gray-900 px-3 py-2.5 rounded-lg hover:bg-[#F5F0EB] transition-colors"
        >
          <span>Quizzes</span>
          <ChevronDown
            size={16}
            className={`text-gray-500 transition-transform duration-200 ${
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
                  className="group relative flex items-center rounded-lg hover:bg-[#F5F0EB] transition-colors"
                >
                  <Link
                    href={`${base}/quizzes?setId=${set.id}`}
                    className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 text-sm text-gray-600"
                  >
                    <HelpCircle size={16} strokeWidth={1.5} className="shrink-0" />
                    <span className="truncate">{set.name}</span>
                  </Link>
                  <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <SidebarItemMenu onUnpin={() => handleUnpinQuiz(set.id)} />
                  </div>
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-gray-400">No quizzes yet</p>
            )}
          </div>
        )}
      </div>

      {/* Summaries — hardcoded dropdown placeholder */}
      {PLACEHOLDER_SECTIONS.slice(1, 2).map(({ title, icon: Icon, items }) => {
        const isOpen = openSections[title] || false;
        const href = `${base}/summaries`;

        return (
          <div key={title} className="mt-1">
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

            {isOpen && (
              <div className="ml-2 mt-0.5 space-y-0.5">
                {items.map((item) => (
                  <Link
                    key={item}
                    href={href}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-[#F5F0EB] rounded-lg transition-colors"
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
