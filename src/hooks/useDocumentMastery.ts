"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import {
  documentMasteryCollection,
  documentMasteryId,
} from "@/src/library/studyPlan/firestorePaths";
import { computeCourseMastery } from "@/src/library/studyPlan/masteryEngine";
import type { CourseMastery, DocumentMastery } from "@/src/library/studyPlan/types";

export type CourseMasterySummary = CourseMastery;

interface MasteryRow {
  id: string;
  courseId: string;
  value: number;
}

export function useDocumentMastery(uid: string | null) {
  const [rows, setRows] = useState<MasteryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, documentMasteryCollection(uid)),
      (snap) => {
        const next = new Map<string, MasteryRow>();
        for (const item of snap.docs) {
          const data = item.data();
          const courseId = data.courseId;
          const sourceDocKey = data.sourceDocKey;
          const value = data.value;
          if (typeof courseId !== "string" || courseId.length === 0) continue;
          if (typeof sourceDocKey !== "string" || sourceDocKey.length === 0) continue;
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          const id = documentMasteryId(courseId, sourceDocKey);
          next.set(id, { id, courseId, value });
        }
        setRows([...next.values()]);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return unsubscribe;
  }, [uid]);

  const bySourceDocument = useMemo(() => {
    const map = new Map<string, DocumentMastery>();
    for (const row of rows) {
      map.set(row.id, { value: row.value });
    }
    return map;
  }, [rows]);

  const getCourseMastery = useCallback(
    (courseId: string, totalDocuments: number): CourseMasterySummary | null => {
      const known = rows
        .filter((row) => row.courseId === courseId)
        .map((row) => ({ value: row.value }));
      return computeCourseMastery(known, totalDocuments);
    },
    [rows],
  );

  return { bySourceDocument, getCourseMastery, loading };
}
