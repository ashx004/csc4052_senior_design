"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, limit, orderBy, query, type Timestamp } from "firebase/firestore";
import { BookOpen, Layers3, ListChecks, Plus } from "lucide-react";
import { db } from "@/src/library/firebase";
import type { CustomType } from "@/src/library/custom/customRequest";

interface CustomSetSummary {
  id: string;
  name: string;
  type: CustomType;
  createdAt: Timestamp | null;
  itemCount: number;
}

const META: Record<CustomType, { label: string; noun: string; icon: typeof BookOpen }> = {
  quiz: { label: "Quiz", noun: "questions", icon: BookOpen },
  flashcards: { label: "Flashcards", noun: "cards", icon: Layers3 },
  practice: { label: "Practice exam", noun: "questions", icon: ListChecks },
};

/** The student's one-off sets (own prompt and files, no class), plus a way to make another. */
export default function CustomSetsSection({ userId }: { userId: string }) {
  const [sets, setSets] = useState<CustomSetSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "users", userId, "customSets"), orderBy("createdAt", "desc"), limit(12)));
        if (cancelled) return;
        setSets(
          snap.docs.map((d) => {
            const data = d.data();
            const type = (["quiz", "flashcards", "practice"].includes(data.type) ? data.type : "quiz") as CustomType;
            const items = type === "flashcards" ? data.cards : type === "quiz" ? data.questions : data.items;
            return { id: d.id, name: String(data.name ?? "Custom set"), type, createdAt: (data.createdAt as Timestamp) ?? null, itemCount: Array.isArray(items) ? items.length : 0 };
          })
        );
      } catch (error) {
        console.error("Error loading custom sets:", error);
        if (!cancelled) setSets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section aria-labelledby="custom-sets-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="custom-sets-heading" className="text-lg font-semibold text-navy">
            Custom study material
          </h2>
          <p className="text-sm text-gray-secondary">One-off sets from your own prompt and files, not tied to a class.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(META) as CustomType[]).map((type) => (
            <Link
              key={type}
              href={`/custom/new?type=${type}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-navy shadow-sm ring-1 ring-navy/10 transition-colors hover:bg-beige-light"
            >
              <Plus size={14} aria-hidden="true" /> {META[type].label}
            </Link>
          ))}
        </div>
      </div>

      {sets && sets.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((set) => {
            const { icon: Icon, label, noun } = META[set.type];
            return (
              <li key={set.id}>
                <Link
                  href={`/custom/${set.id}`}
                  className="flex h-full items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-navy/5 transition-shadow hover:shadow-md"
                >
                  <Icon size={18} className="mt-0.5 shrink-0 text-brown-label" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy">{set.name}</span>
                    <span className="block text-xs text-gray-secondary">
                      {label} &middot; {set.itemCount} {noun}
                      {set.createdAt ? ` · ${set.createdAt.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
