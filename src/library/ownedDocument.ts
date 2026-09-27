/** Canonicalize a download URL only after checking the authenticated owner.
 * Never forward a browser-supplied URL with the server's internal credential.
 */
export function ownedDocumentUrl(value: unknown, uid: string): string | null {
  if (typeof value !== "string" || !value.startsWith("/api/download?")) return null;
  try {
    const url = new URL(value, "http://internal");
    const keys = url.searchParams.getAll("key");
    const key = keys[0];
    if (url.pathname !== "/api/download" || keys.length !== 1 || !key?.startsWith(`users/${uid}/`)) return null;
    if (/[\u0000-\u001f\\]/.test(key) || key.split("/").some((part) => part === ".." || part === ".")) return null;
    return `/api/download?key=${encodeURIComponent(key)}`;
  } catch {
    return null;
  }
}
