/**
 * A study task's `sourceDocKey` is not always a storage key.
 *
 * fileUploadService writes a resource with a `url` and no `sourceDocKey`, so
 * documentTargetForResource falls back to that url and the task carries
 * "/api/download?key=users%2F...". Building a download url from that produced
 * "/api/download?key=%2Fapi%2Fdownload%3Fkey%3D..." — a key that ownsUrl rejects,
 * so every generation from such a document answered "Couldn't read any of the
 * documents you picked." These helpers accept either form.
 */

/** The storage key behind a sourceDocKey, whether it is bare or a download url. */
export function storageKeyFromSourceDocKey(sourceDocKey: string): string {
  const value = (sourceDocKey ?? "").trim();
  if (!value) return "";
  const marker = "key=";
  const index = value.indexOf(marker);
  if (index < 0) return value;
  const raw = value.slice(index + marker.length).split("&")[0] ?? "";
  try {
    return decodeURIComponent(raw).trim() || value;
  } catch {
    return raw || value;
  }
}

/** The /api/download url for a sourceDocKey. Never wraps a download url in another. */
export function documentDownloadUrl(sourceDocKey: string): string {
  const key = storageKeyFromSourceDocKey(sourceDocKey);
  return `/api/download?key=${encodeURIComponent(key)}`;
}

/** The file name to show for a sourceDocKey, with the upload timestamp stripped. */
export function documentDisplayName(sourceDocKey: string): string {
  const key = storageKeyFromSourceDocKey(sourceDocKey);
  return key.split("/").pop()?.replace(/^\d+[-_]/, "") || "document";
}
