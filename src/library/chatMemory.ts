import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type StoredChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  documentsRead?: string[];
  generatedFiles?: { name: string; url: string }[];
  generatedStudySets?: { kind: "flashcard" | "quiz"; id: string; courseId: string; name: string }[];
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
  // True while /api/chat is still generating this session's latest reply
  // server-side (see route.ts) — lets the UI show "Generating..." and pick
  // the answer up live via onSnapshot if the user navigated away mid-reply.
  generating: boolean;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: Date | null;
  pinned: boolean;
  generating: boolean;
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

// Every LLM-generated reply is saved server-side, in /api/chat/route.ts (via
// the Firestore REST helpers in firestoreRest.ts) — that's what lets a
// reply keep being saved even if the user has already navigated away or
// closed the tab before it finishes. addLocalMessage below is the one
// exception: for messages that never go through /api/chat at all (e.g. the
// "file uploaded" notice in ai-assistant/page.tsx), the client is the only
// place that ever knows about them, so it still has to write them itself.

export async function addLocalMessage(
  userId: string,
  sessionId: string | null,
  nextMessages: StoredChatMessage[],
  state: { summary: string; summarizedCount: number; title: string }
): Promise<string> {
  let id = sessionId;
  if (!id) {
    const newDoc = await addDoc(sessionsRef(userId), {
      messages: [],
      summary: "",
      summarizedCount: 0,
      title: "",
      pinned: false,
      generating: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expireAt: expiryTimestamp(),
    });
    id = newDoc.id;
  }

  await updateDoc(doc(db, "users", userId, "chatSessions", id), {
    messages: nextMessages,
    summary: state.summary,
    summarizedCount: state.summarizedCount,
    title: state.title,
    updatedAt: serverTimestamp(),
    // expireAt intentionally untouched — see setChatPinned for how pin/
    // unpin manage it.
  });

  return id;
}

function toSessionState(id: string, data: any): ChatSessionState {
  return {
    id,
    messages: Array.isArray(data.messages) ? data.messages : [],
    summary: typeof data.summary === "string" ? data.summary : "",
    summarizedCount: typeof data.summarizedCount === "number" ? data.summarizedCount : 0,
    title: typeof data.title === "string" ? data.title : "",
    pinned: Boolean(data.pinned),
    generating: Boolean(data.generating),
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

// Live updates for a session while it's still generating server-side — lets
// a user who reopens a session mid-reply watch it finish instead of needing
// to manually refresh. Callers should unsubscribe once generating is false.
export function subscribeToChatSession(
  userId: string,
  sessionId: string,
  onChange: (state: ChatSessionState) => void
): Unsubscribe {
  return onSnapshot(doc(db, "users", userId, "chatSessions", sessionId), (snap) => {
    if (snap.exists()) onChange(toSessionState(snap.id, snap.data()));
  });
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
      generating: Boolean(data.generating),
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

// ── Contextual AI panel sessions ──────────────────────────────────────────
// The flashcards/quiz-result drawer isn't a growing list of past chats like
// the main assistant — it's one conversation per piece of content. Rather
// than an auto-ID collection, each context (e.g. "quiz:{quizId}") gets a
// single deterministic doc at users/{uid}/panelChatSessions/{contextKey},
// upserted server-side the same way as chatSessions (see route.ts).

export type PanelChatSessionState = {
  messages: StoredChatMessage[];
  generating: boolean;
};

function toPanelSessionState(data: any): PanelChatSessionState {
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    generating: Boolean(data.generating),
  };
}

export async function getPanelChatSession(
  userId: string,
  contextKey: string
): Promise<PanelChatSessionState | null> {
  const snap = await getDoc(doc(db, "users", userId, "panelChatSessions", contextKey));
  if (!snap.exists()) return null;
  return toPanelSessionState(snap.data());
}

export function subscribeToPanelChatSession(
  userId: string,
  contextKey: string,
  onChange: (state: PanelChatSessionState) => void
): Unsubscribe {
  return onSnapshot(doc(db, "users", userId, "panelChatSessions", contextKey), (snap) => {
    if (snap.exists()) onChange(toPanelSessionState(snap.data()));
  });
}
