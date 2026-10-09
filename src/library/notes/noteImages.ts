import { compressImage } from "@/src/library/imageCompress";

export const MAX_NOTE_IMAGE_BYTES = 25 * 1024 * 1024;
export const NOTE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"];

export const isImageFile = (file: File) => file.type.startsWith("image/");

export interface UploadedNoteImage {
  src: string;
  width: number;
  height: number;
}

/** Compresses a picture and stores it under the student's own folder; the
 *  returned `src` goes straight into the note. */
export async function uploadNoteImage(uid: string, noteId: string, file: File): Promise<UploadedNoteImage> {
  if (!isImageFile(file)) throw new Error(`"${file.name}" isn't a picture.`);
  if (file.size > MAX_NOTE_IMAGE_BYTES) throw new Error(`"${file.name}" is too large (limit 25MB).`);
  const { blob, width, height } = await compressImage(file, { maxEdge: 1600, quality: 0.82 });
  const ext = blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "jpg";
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const key = `users/${uid}/notes/${noteId}/images/${id}.${ext}`;
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg", "x-storage-path": key },
    body: await blob.arrayBuffer(),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Couldn't upload the picture.");
  }
  return { src: `/api/download?key=${encodeURIComponent(key)}`, width, height };
}
