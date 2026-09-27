"use client";

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { suggestionAfterLater } from "@/src/library/studyPlan/addSuggestionToPlan";
import {
  learningSuggestionPath,
  learningSuggestionsCollection,
} from "@/src/library/studyPlan/firestorePaths";
import type { MissedQuestionsSuggestion } from "@/src/library/studyPlan/types";

export function useLearningSuggestions(uid: string | null) {
  const [suggestions, setSuggestions] = useState<
    (MissedQuestionsSuggestion & { id: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const suggestionsQuery = query(
      collection(db, learningSuggestionsCollection(uid)),
      where("status", "in", ["active", "added"]),
    );
    const unsubscribe = onSnapshot(
      suggestionsQuery,
      (snap) => {
        setSuggestions(
          snap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as MissedQuestionsSuggestion),
          })),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsubscribe;
  }, [uid]);

  const dismissSuggestion = useCallback(
    async (id: string) => {
      if (!uid) return;
      await updateDoc(doc(db, learningSuggestionPath(uid, id)), {
        status: "dismissed",
        updatedAt: serverTimestamp(),
      });
    },
    [uid],
  );

  const markSuggestionActive = useCallback(
    async (id: string) => {
      if (!uid) return;
      const suggestionRef = doc(db, learningSuggestionPath(uid, id));
      const snap = await getDoc(suggestionRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const next = suggestionAfterLater({
        status: typeof data.status === "string" ? data.status : "active",
        linkedTaskId: typeof data.linkedTaskId === "string" ? data.linkedTaskId : null,
      });
      if (next.status === "added" || data.status === "active") return;
      await updateDoc(suggestionRef, {
        status: "active",
        updatedAt: serverTimestamp(),
      });
    },
    [uid],
  );

  return { suggestions, loading, dismissSuggestion, markSuggestionActive };
}
