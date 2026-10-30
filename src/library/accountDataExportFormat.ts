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

/** How the importer turns the markers above back into Firestore values. Kept
 * as callbacks so this module stays free of firebase-admin. */
export type AccountImportFactories = {
  geopoint: (latitude: number, longitude: number) => unknown;
  /** Returns the reference to write, or null to keep the path as a plain string. */
  reference: (path: string) => unknown | null;
};

/** The inverse of encodeAccountExportValue. Timestamps come back as Dates and
 * bytes as Buffers, both of which Firestore Admin stores natively. */
export function decodeAccountExportValue(value: unknown, factories: AccountImportFactories): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => decodeAccountExportValue(entry, factories));

  const candidate = value as Record<string, unknown>;
  switch (candidate[TYPE]) {
    case "timestamp": {
      const date = new Date(String(candidate.value));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    case "bytes":
      return Buffer.from(String(candidate.base64 ?? ""), "base64");
    case "geopoint":
      return typeof candidate.latitude === "number" && typeof candidate.longitude === "number"
        ? factories.geopoint(candidate.latitude, candidate.longitude)
        : null;
    case "reference": {
      const path = String(candidate.path ?? "");
      return factories.reference(path) ?? path;
    }
    case "unsupported":
      return typeof candidate.value === "string" ? candidate.value : null;
  }
  return Object.fromEntries(
    Object.entries(candidate).map(([key, entry]) => [key, decodeAccountExportValue(entry, factories)])
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
