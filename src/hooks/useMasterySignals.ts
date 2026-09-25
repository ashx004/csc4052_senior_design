"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { masterySignalsCollection } from "@/src/library/studyPlan/firestorePaths";
import type { MasterySignal } from "@/src/library/studyPlan/types";

export function useMasterySignals(uid: string | null) {
  const [signals, setSignals] = useState<Map<string, MasterySignal>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setSignals(new Map());
      setLoading(false);
      return;
    }

    const colRef = collection(db, masterySignalsCollection(uid));
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const map = new Map<string, MasterySignal>();
        for (const doc of snap.docs) {
          map.set(doc.id, doc.data() as MasterySignal);
        }
        setSignals(map);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [uid]);

  return { signals, loading };
}
