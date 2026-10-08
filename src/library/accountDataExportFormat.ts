const TYPE = "__catalystExportType";

/**
 * Converts values returned by the Admin SDK into JSON without silently
 * flattening Firestore-specific data.  The explicit markers make a future
 * account-importer able to distinguish a timestamp/reference/bytes value
 * from ordinary user JSON.
 */
export function encodeAccountExportValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) return { [TYPE]: "timestamp", value: value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { [TYPE]: "bytes", base64: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) return value.map(encodeAccountExportValue);
  if (typeof value !== "object") return { [TYPE]: "unsupported", value: String(value) };

  const candidate = value as Record<string, unknown>;
  // Firebase Admin Timestamp has toDate(); using this capability keeps the
  // encoder decoupled from a particular firebase-admin runtime instance.
  if (typeof candidate.toDate === "function") {
    const date = (candidate.toDate as () => Date)();
    return { [TYPE]: "timestamp", value: date.toISOString() };
  }
  if (typeof candidate.latitude === "number" && typeof candidate.longitude === "number") {
    return { [TYPE]: "geopoint", latitude: candidate.latitude, longitude: candidate.longitude };
  }
  // DocumentReference exposes a stable path. Preserve it rather than
  // serializing SDK internals; an importer can rewrite the old user prefix.
  if (typeof candidate.path === "string" && "parent" in candidate) {
    return { [TYPE]: "reference", path: candidate.path };
  }
  if (typeof candidate.toBase64 === "function") {
    return { [TYPE]: "bytes", base64: (candidate.toBase64 as () => string)() };
  }

  return Object.fromEntries(
    Object.entries(candidate).map(([key, entry]) => [key, encodeAccountExportValue(entry)])
  );
}

/** Archive entries do not mirror object keys: uploaded file names can contain
 * path-like characters. Keep the recognizable original basename/extension,
 * but sanitize it and append an ordinal so duplicate names cannot collide. */
export function objectArchivePath(index: number, objectKey: string): string {
  const rawName = objectKey.replace(/\\/g, "/").split("/").pop() || "file";
  const safeName = rawName
    .normalize("NFKC")
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/^\.+$/, "file")
    .replace(/[. ]+$/, "")
    .slice(0, 180) || "file";
  const extensionIndex = safeName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName;
  const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : "";
  return `files/objects/${stem}--${String(index).padStart(8, "0")}${extension}`;
}

export function accountExportFilename(now = new Date()): string {
  return `catalyst-data-export-${now.toISOString().slice(0, 10)}.zip`;
}
