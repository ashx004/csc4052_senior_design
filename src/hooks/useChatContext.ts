"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { browserTimeZone, toChatClass, toChatDocument, type ChatContext, type ChatDocument } from "@/src/library/chatContext";

const SETTLE_MS = 150;

/**
 * The AI's view of the student's classes and files, kept current: a file that
 * finishes uploading (or finishes indexing) appears in the context without a
 * page refresh. Same shape buildChatContext returns; null until first loaded.
 */
export function useChatContext(uid?: string, email?: string | null): ChatContext | null {
  const [context, setContext] = useState<ChatContext | null>(null);

  useEffect(() => {
    if (!uid || !email) {
      setContext(null);
      return;
    }

    let cancelled = false;
    let profile: { name: string; college: string } | null = null;
    let enrollments: { id: string; data: DocumentData }[] | null = null;
    const documents = new Map<string, ChatDocument[]>();
    const resourceUnsubs = new Map<string, Unsubscribe>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = () => {
      if (cancelled || !profile || !enrollments) return;
      // Wait until every class has reported its files at least once.
      if (enrollments.some((e) => !documents.has(e.id))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (cancelled || !profile || !enrollments) return;
        setContext({
          userId: uid,
          email,
          name: profile.name,
          college: profile.college,
          classes: enrollments.map((e) => toChatClass(e.id, e.data, documents.get(e.id) ?? [])),
          timeZone: browserTimeZone(),
        });
      }, SETTLE_MS);
    };

    getDoc(doc(db, "users", uid))
      .then((snap) => {
        profile = { name: snap.data()?.name ?? "", college: snap.data()?.college ?? "" };
      })
      .catch(() => {
        profile = { name: "", college: "" };
      })
      .finally(publish);

    const stopEnrollments = onSnapshot(
      collection(db, "users", uid, "enrollment"),
      (snapshot) => {
        enrollments = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
        const live = new Set(enrollments.map((e) => e.id));
        for (const [id, stop] of resourceUnsubs) {
          if (live.has(id)) continue;
          stop();
          resourceUnsubs.delete(id);
          documents.delete(id);
        }
        for (const id of live) {
          if (resourceUnsubs.has(id)) continue;
          resourceUnsubs.set(
            id,
            onSnapshot(
              collection(db, "users", uid, "enrollment", id, "resources"),
              (resources) => {
                documents.set(id, resources.docs.map((r) => toChatDocument(r.id, r.data())));
                publish();
              },
              () => {
                documents.set(id, documents.get(id) ?? []);
                publish();
              }
            )
          );
        }
        publish();
      },
      (error) => {
        console.error("Error watching enrollments for chat context:", error);
        enrollments = [];
        publish();
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopEnrollments();
      resourceUnsubs.forEach((stop) => stop());
    };
  }, [uid, email]);

  return context;
}
