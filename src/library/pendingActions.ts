// Confirm-before-change for the chat's riskiest writes: deleting an event or
// a note, moving an event, rewriting a note, and changing a class's details.
//
// The consent gate (chatConsent.ts) reads the student's wording, which is
// good but not airtight. For these actions the chat no longer writes at all:
// the tool works out the exact change, stores it here as a pending action,
// and the reply shows a card with Confirm and Cancel. Only the click
// (POST /api/chat/confirm) applies it - the same pattern larger assistants
// use for anything destructive.
//
// Stored at users/{uid}/pendingActions/{id} with the student's own token, so
// the usual owner-only security rules apply. The change is stored as exact
// Firestore operations worked out when the card was made, so what the card
// describes is exactly what gets applied - the model can't alter it later.

import {
  firestoreCreate,
  firestoreDelete,
  firestoreGet,
  firestoreListCollection,
  firestoreUpdate,
} from "./firestoreRest";

/** One write, applied in order when the student confirms. */
export type PendingOp =
  | { op: "update"; collection: string; docId: string; fields: Record<string, unknown>; touch?: boolean }
  | { op: "delete"; collection: string; docId: string }
  /** Delete every document in a subcollection (a note's drawing pages). */
  | { op: "clear"; collection: string };

/** What the chat UI shows. */
export interface PendingActionCard {
  id: string;
  title: string;
  details: string[];
  /** This card is already in the chat from an earlier message. */
  alreadyShown?: boolean;
}

export type PendingStatus = "pending" | "applying" | "done" | "cancelled" | "expired" | "failed";

export const PENDING_TTL_MS = 30 * 60 * 1000;
const COLLECTION = (uid: string) => `users/${uid}/pendingActions`;

/** Every op must stay inside the student's own data. */
export function opsBelongTo(uid: string, ops: PendingOp[]): boolean {
  const root = `users/${uid}/`;
  return ops.every((o) => o.collection.startsWith(root) && !o.collection.includes("..") && !o.collection.includes("pendingActions"));
}

export async function proposeAction(
  idToken: string,
  uid: string,
  action: { tool: string; title: string; details: string[]; ops: PendingOp[]; doneText: string }
): Promise<PendingActionCard | null> {
  if (!opsBelongTo(uid, action.ops)) return null;
  const now = Date.now();
  // The same change is already waiting on a card (the student said "yes"
  // to the first one instead of pressing it): point back to that card.
  const ops = JSON.stringify(action.ops);
  const waiting = (await firestoreListCollection(idToken, COLLECTION(uid)).catch(() => [])).find(
    (d) => d.data.ops === ops && statusOf(d.data, now) === "pending"
  );
  if (waiting) return { id: waiting.id, title: action.title, details: action.details, alreadyShown: true };
  const id = await firestoreCreate(idToken, COLLECTION(uid), {
    tool: action.tool,
    title: action.title,
    details: action.details,
    // JSON, so nested note content round-trips exactly.
    ops,
    doneText: action.doneText,
    status: "pending",
    createdAt: new Date(now),
    expiresAt: new Date(now + PENDING_TTL_MS),
  });
  return id ? { id, title: action.title, details: action.details } : null;
}

/** The text the model gets back instead of "done". */
export function pendingToolText(card: PendingActionCard): string {
  if (card.alreadyShown) {
    return (
      `Pending - nothing has been changed yet. The Confirm card for this exact change (${card.title}: ${card.details.join("; ")}) is already showing under your earlier reply. ` +
      `Saying yes in the chat doesn't apply it - tell the student in one short sentence to press Confirm on that card. Do not say it has been done.`
    );
  }
  return (
    `Pending - nothing has been changed yet. A card under your reply shows the student exactly this change ` +
    `(${card.title}: ${card.details.join("; ")}) with Confirm and Cancel buttons, and it only happens if they press Confirm. ` +
    `In one short sentence, tell them to press Confirm to go ahead. Do not say it has been done, and don't call this tool again for it.`
  );
}

function statusOf(doc: Record<string, unknown>, now = Date.now()): PendingStatus {
  const status = doc.status as PendingStatus;
  if (status === "pending" && Date.parse(String(doc.expiresAt)) < now) return "expired";
  return status;
}

export async function getActionStatus(idToken: string, uid: string, id: string): Promise<{ status: PendingStatus; message?: string } | null> {
  const doc = await firestoreGet(idToken, COLLECTION(uid), id);
  if (!doc) return null;
  const status = statusOf(doc);
  return { status, message: typeof doc.resultText === "string" ? doc.resultText : undefined };
}

/** Apply (or cancel) a pending action. Safe to call twice: only a pending one does anything. */
export async function resolveAction(
  idToken: string,
  uid: string,
  id: string,
  decision: "confirm" | "cancel"
): Promise<{ status: PendingStatus; message: string }> {
  const doc = await firestoreGet(idToken, COLLECTION(uid), id);
  if (!doc) return { status: "failed", message: "That change couldn't be found. Ask the assistant again." };
  const status = statusOf(doc);
  if (status === "done") return { status, message: String(doc.resultText ?? "Already done.") };
  if (status === "cancelled") return { status, message: "Already cancelled - nothing was changed." };
  if (status === "expired") return { status, message: "This expired after 30 minutes, so nothing was changed. Ask the assistant again." };
  if (status !== "pending") return { status, message: String(doc.resultText ?? "This change can't be applied.") };

  const finish = async (next: PendingStatus, message: string) => {
    await firestoreUpdate(idToken, COLLECTION(uid), id, { status: next, resultText: message, resolvedAt: new Date() });
    return { status: next, message };
  };
  // Claim it first, so a double click can't apply it twice.
  const claimed = await firestoreUpdate(idToken, COLLECTION(uid), id, { status: decision === "cancel" ? "cancelled" : "applying" });
  if (!claimed) return { status: "failed", message: "Couldn't reach the database. Try again." };
  if (decision === "cancel") return finish("cancelled", "Cancelled - nothing was changed.");

  let ops: PendingOp[];
  try {
    ops = JSON.parse(String(doc.ops));
  } catch {
    return finish("failed", "This change was stored incorrectly, so nothing was changed.");
  }
  if (!Array.isArray(ops) || !opsBelongTo(uid, ops)) return finish("failed", "This change isn't allowed, so nothing was changed.");

  // Everything it changes must still exist (an update would otherwise
  // quietly create a new document).
  for (const o of ops) {
    if (o.op === "clear") continue;
    if (!(await firestoreGet(idToken, o.collection, o.docId))) {
      return finish("failed", "It was already deleted or changed somewhere else, so nothing was changed.");
    }
  }
  for (const o of ops) {
    let ok = true;
    if (o.op === "clear") {
      const docs = await firestoreListCollection(idToken, o.collection);
      ok = (await Promise.all(docs.map((d) => firestoreDelete(idToken, o.collection, d.id)))).every(Boolean);
    } else if (o.op === "delete") {
      ok = await firestoreDelete(idToken, o.collection, o.docId);
    } else {
      ok = await firestoreUpdate(idToken, o.collection, o.docId, o.touch ? { ...o.fields, updatedAt: new Date() } : o.fields);
    }
    if (!ok) return finish("failed", "Something went wrong partway through. Check the page and try again.");
  }
  return finish("done", String(doc.doneText ?? "Done."));
}

/** What happened to this conversation's cards, so the chat knows on the next message. */
export async function recentActionOutcomes(idToken: string, uid: string, ids: string[]): Promise<string[]> {
  // Only the cards shown in this conversation: outcomes from other chats
  // misled the model (a note deleted in one test chat was "already deleted"
  // in the next, where a new note had the same title).
  const wanted = new Set(ids);
  const docs = (await firestoreListCollection(idToken, COLLECTION(uid)).catch(() => [])).filter((d) => wanted.has(d.id));
  const label: Record<PendingStatus, string> = {
    pending: "still waiting for the student to press Confirm",
    applying: "being applied",
    done: "confirmed by the student and done",
    cancelled: "cancelled by the student - nothing changed",
    expired: "expired unconfirmed - nothing changed",
    failed: "failed - nothing changed",
  };
  return docs
    .sort((a, b) => String(a.data.createdAt).localeCompare(String(b.data.createdAt)))
    .slice(-5)
    .map((d) => {
      const s = statusOf(d.data);
      return `- ${String(d.data.title)} (${(d.data.details as string[] | undefined)?.join("; ") ?? ""}): ${label[s] ?? s}`;
    });
}
