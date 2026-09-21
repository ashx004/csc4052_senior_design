"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { studyNotificationsCollection } from "@/src/library/studyPlan/firestorePaths";
import type {
  StudyNotification,
  NotificationStatus,
} from "@/src/library/studyPlan/types";

export function useStudyNotifications(uid: string | null) {
  const [notifications, setNotifications] = useState<
    (StudyNotification & { id: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const now = Timestamp.now();
    const q = query(
      collection(db, studyNotificationsCollection(uid)),
      where("expiresAt", ">", now),
      orderBy("expiresAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as StudyNotification),
          }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, [uid]);

  const unreadCount = notifications.filter(
    (n) => n.status === "created" || n.status === "delivered"
  ).length;

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!uid) return;
      await updateDoc(
        doc(db, studyNotificationsCollection(uid), notificationId),
        {
          status: "read" as NotificationStatus,
          readAt: serverTimestamp(),
        }
      );
    },
    [uid]
  );

  const dismissNotification = useCallback(
    async (notificationId: string) => {
      if (!uid) return;
      await updateDoc(
        doc(db, studyNotificationsCollection(uid), notificationId),
        {
          status: "dismissed" as NotificationStatus,
        }
      );
    },
    [uid]
  );

  return { notifications, loading, unreadCount, markRead, dismissNotification };
}
