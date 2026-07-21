import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type StoredChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  documentsRead?: string[];
  generatedFiles?: { name: string; url: string }[];
};

export type ChatSessionState = {
  id: string;
  messages: StoredChatMessage[];
  // Running summary of everything before `summarizedCount` messages in —
  // lets long conversations stay cheap/fast without losing earlier context.
  // See buildConversationForModel in api/chat/route.ts.
  summary: string;
  summarizedCount: number;
  title: string;
  pinned: boolean;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: Date | null;
  pinned: boolean;
};

const RETENTION_DAYS = 30;

// Short-term chat memory: each conversation lives as its own doc under
// users/{uid}/chatSessions/{sessionId}. `expireAt` is set on creation (30
// days out) for Firestore's native TTL policy — enabled once in the Firebase
// console (Firestore > TTL > field "expireAt" on collection group
// "chatSessions"), no Cloud Functions or cron needed. TTL policies apply
// unconditionally to any doc with the field set, so pinning REMOVES the
// field entirely (exempting it) rather than just pushing the date out —
// there's no "except if pinned" option at the Firestore level.
function sessionsRef(userId: string) {
  return collection(db, "users", userId, "chatSessions");
}

function expiryTimestamp(): Timestamp {
  const expires = new Date();
  expires.setDate(expires.getDate() + RETENTION_DAYS);
  return Timestamp.fromDate(expires);
}

export async function createChatSession(userId: string): Promise<string> {
  const newDoc = await addDoc(sessionsRef(userId), {
    messages: [],
    summary: "",
    summarizedCount: 0,
    title: "",
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expireAt: expiryTimestamp(),
  });
  return newDoc.id;
}

export async function saveChatState(
  userId: string,
  sessionId: string,
  state: { messages: StoredChatMessage[]; summary: string; summarizedCount: number; title: string }
): Promise<void> {
  const sessionDoc = doc(db, "users", userId, "chatSessions", sessionId);
  await updateDoc(sessionDoc, {
    messages: state.messages,
    summary: state.summary,
    summarizedCount: state.summarizedCount,
    title: state.title,
    updatedAt: serverTimestamp(),
    // expireAt intentionally untouched here — see setChatPinned for how
    // pin/unpin manage it. Leaving it alone keeps a pinned chat's exemption
    // intact and keeps unpinned chats on their original 30-day-from-creation
    // window rather than resetting on every message.
  });
}

function toSessionState(id: string, data: any): ChatSessionState {
  return {
    id,
    messages: Array.isArray(data.messages) ? data.messages : [],
    summary: typeof data.summary === "string" ? data.summary : "",
    summarizedCount: typeof data.summarizedCount === "number" ? data.summarizedCount : 0,
    title: typeof data.title === "string" ? data.title : "",
    pinned: Boolean(data.pinned),
  };
}

export async function getLatestChatSession(userId: string): Promise<ChatSessionState | null> {
  const q = query(sessionsRef(userId), orderBy("updatedAt", "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return toSessionState(snap.docs[0].id, snap.docs[0].data());
}

export async function getChatSession(userId: string, sessionId: string): Promise<ChatSessionState | null> {
  const snap = await getDoc(doc(db, "users", userId, "chatSessions", sessionId));
  if (!snap.exists()) return null;
  return toSessionState(snap.id, snap.data());
}

// For the "previous chats" list — lighter than fetching every session's full
// message history, pinned chats first, then most-recently-updated.
export async function listChatSessions(userId: string): Promise<ChatSessionSummary[]> {
  const q = query(sessionsRef(userId), orderBy("updatedAt", "desc"), limit(50));
  const snap = await getDocs(q);

  const sessions = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: typeof data.title === "string" && data.title ? data.title : "New chat",
      updatedAt: data.updatedAt?.toDate?.() ?? null,
      pinned: Boolean(data.pinned),
    };
  });

  sessions.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  });

  return sessions;
}

export async function setChatPinned(userId: string, sessionId: string, pinned: boolean): Promise<void> {
  await updateDoc(doc(db, "users", userId, "chatSessions", sessionId), {
    pinned,
    // Pinning removes expireAt entirely (exempt from TTL deletion).
    // Unpinning gives it a fresh 30-day window starting now.
    expireAt: pinned ? deleteField() : expiryTimestamp(),
  });
}

export async function deleteChatSession(userId: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "chatSessions", sessionId));
}

// Zero-latency title: truncate the opening message at a word boundary rather
// than spending an extra model round-trip on naming a chat.
export function deriveChatTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, " ");
  if (clean.length <= 48) return clean;
  const truncated = clean.slice(0, 48);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
