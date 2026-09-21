"use client";

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
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
  NotificationType,
} from "@/src/library/studyPlan/types";
import {
  buildDedupeKey,
  getNotificationContent,
  isNotificationAllowed,
  shouldThrottle,
  type NotificationContext,
} from "@/src/library/studyPlan/notificationRules";

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

  const createNotification = useCallback(
    async (input: {
      type: NotificationType;
      context?: NotificationContext;
      actionUrl?: string;
      taskId?: string;
      planDate?: string;
      courseId?: string;
    }) => {
      if (!uid) return null;
      const context = input.context ?? {};
      const content = getNotificationContent(input.type, context);
      const date = input.planDate ?? new Date().toISOString().slice(0, 10);
      const dedupeKey = buildDedupeKey(
        input.type,
        date,
        input.taskId ?? input.courseId ?? context.examName
      );
      const recent = notifications.filter(
        (notification) => notification.type === input.type && notification.createdAt
      );
      const recentWithMillis = recent.filter(
        (notification) => typeof notification.createdAt?.toMillis === "function"
      ) as { type: NotificationType; createdAt: { toMillis(): number } }[];

      if (!isNotificationAllowed(input.type, {
        studyReminders: true,
        breakSuggestions: true,
        deadlineWarnings: true,
        progressUpdates: true,
      }) || shouldThrottle(input.type, recentWithMillis, Date.now())) {
        return null;
      }

      const duplicate = await getDocs(
        query(
          collection(db, studyNotificationsCollection(uid)),
          where("dedupeKey", "==", dedupeKey),
          limit(1)
        )
      );
      if (!duplicate.empty) return null;

      const ref = await addDoc(collection(db, studyNotificationsCollection(uid)), {
        type: input.type,
        status: "created" as NotificationStatus,
        title: content.title,
        body: content.body,
        ...(content.actionLabel ? { actionLabel: content.actionLabel } : {}),
        ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.planDate ? { planDate: input.planDate } : {}),
        ...(input.courseId ? { courseId: input.courseId } : {}),
        createdAt: serverTimestamp(),
        deliveredAt: null,
        readAt: null,
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
        dedupeKey,
      });
      return ref.id;
    },
    [uid, notifications]
  );

  return {
    notifications,
    loading,
    unreadCount,
    markRead,
    dismissNotification,
    createNotification,
  };
}
