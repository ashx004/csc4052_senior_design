"use client";

import { useCallback, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import { KIND_LABELS, type DragDropMode, type PracticeDifficulty, type PracticeItem, type PracticeKind } from "@/src/library/practice/types";

export interface PracticeSource {
  /** Storage key of the document (what quizzes call sourceDocKey). */
  sourceDocKey: string;
  name: string;
  url: string;
}

export interface PracticeRequestInput {
  source: PracticeSource;
  kind: PracticeKind;
  count: number;
  difficulty: PracticeDifficulty;
  modes?: DragDropMode[];
  /** Earlier question texts, so "new questions" don't repeat them. */
  avoid?: string[];
}

/** Generates a practice set from a document and saves it to the course. Resolves with the new set's ID. */
export function usePracticeGeneration(courseId: string) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (input: PracticeRequestInput): Promise<string | null> => {
      if (!user) return null;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/generate-practice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docUrl: input.source.url,
            docName: input.source.name,
            kind: input.kind,
            count: input.count,
            difficulty: input.difficulty,
            modes: input.modes,
            avoidQuestions: input.avoid,
            modelKey: getEffectiveModelKey("quiz"),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to generate practice.");

        const items = data.items as PracticeItem[];
        const created = await addDoc(collection(db, "users", user.uid, "enrollment", courseId, "practiceSets"), {
          name: `${data.topicName || input.source.name} - ${KIND_LABELS[input.kind].short}`,
          kind: input.kind,
          items,
          sourceDocKey: input.source.sourceDocKey,
          sourceName: input.source.name,
          difficulty: input.difficulty,
          pinned: true,
          attempts: 0,
          bestPercent: null,
          lastPlayedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return created.id;
      } catch (err) {
        console.error("Error generating practice:", err);
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user, courseId]
  );

  return { generate, loading, error, clearError: () => setError(null) };
}
