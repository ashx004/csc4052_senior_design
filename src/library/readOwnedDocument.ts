import { firestoreGet } from "./firestoreRest";
import { ownedDocumentUrl } from "./ownedDocument";
import type { ChatDocument } from "./systemPrompt";

export async function readOwnedDocument(idToken: string, uid: string, courseId: string, resourceId: string): Promise<ChatDocument | null> {
  if ([uid, courseId, resourceId].some((id) => !id || /[\/\\\u0000-\u001f]/.test(id) || id === "." || id === "..")) return null;
  // The user's token enforces Firestore rules. The object key is checked as
  // well: even a resource row must not point an internal fetch at another user.
  const data = await firestoreGet(idToken, `users/${uid}/enrollment/${courseId}/resources`, resourceId);
  if (!data) return null;
  const url = ownedDocumentUrl(data.url, uid);
  if (!url || typeof data.name !== "string" || typeof data.fileType !== "string") return null;
  return { resourceId, name: data.name, fileType: data.fileType, category: typeof data.category === "string" ? data.category : "", url };
}
