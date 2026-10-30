import { createHash } from "node:crypto";
import { IMAGE_FILE_TYPES, SUPPORTED_DOCUMENT_TYPES } from "./documentTypes";

// Pure planning for account data import (accountDataImport.ts does the I/O).
// Given the classes in an export archive and the signed-in account's current
// classes, this decides what gets written where. Nothing here touches
// Firestore, storage or Qdrant, so all of it is unit-tested.
//
// What is restored: classes (users/{uid}/enrollment/{courseId}) with
// everything under them (documents and their search chunks, quizzes,
// flashcards, practice sets) and the stored files they use. Nothing else in
// the export is restored: in particular not AI credit, billing, settings or
// sign-in data, which an edited archive could otherwise hand to itself.
//
// Every restored document gets a new id. Qdrant point ids are derived from
// the resource id alone (vectorStore.chunkPointId), so restoring a resource
// under its old id could overwrite the search index of the account it came
// from, or of the same resource still in this account.

export type ExportedDocument = {
  id: string;
  fields: unknown;
  subcollections: Record<string, ExportedDocument[]>;
};

export type ManifestFile = {
  archivePath: string;
  objectKey: string;
  contentType: string | null;
  bytes: number;
  sha256: string;
};

/** What the student picks for each class in the preview. */
export type ImportDecision = "import" | "skip" | "merge" | "copy";

export type ExistingClass = { id: string; classCode?: unknown; className?: unknown; term?: unknown };

export type ClassCounts = {
  documents: number;
  indexedDocuments: number;
  quizSets: number;
  flashcardSets: number;
  practiceSets: number;
};

export type ClassPreview = {
  sourceId: string;
  classCode: string;
  className: string;
  term: string;
  counts: ClassCounts;
  files: number;
  /** The class in this account it matches, if any; the student picks skip, merge or copy. */
  conflict: { id: string; className: string } | null;
};

export type ChunkToIndex = { chunkIndex: number; text: string; embedding: number[]; page?: number };

export type PlannedResource = {
  path: string;
  courseId: string;
  resourceId: string;
  chunks: ChunkToIndex[];
  /** Has no saved search chunks but is a type the document worker can index. */
  needsIndexJob: boolean;
  source: { url: string; name: string; fileType: string; version: string };
};

export type ClassPlan = {
  sourceId: string;
  className: string;
  action: "imported" | "merged" | "copied";
  courseId: string;
  /** Firestore writes, values still in the export's encoded form. */
  writes: { path: string; data: Record<string, unknown> }[];
  files: { archivePath: string; toKey: string; contentType: string | null }[];
  resources: PlannedResource[];
  counts: ClassCounts;
};

// Documents with no saved search chunks are queued for the document worker if
// it can read them as text. Images and OCR documents would need a new (paid)
// OCR run, so they're left for the student to re-run from the class page.
export const REINDEXABLE_FILE_TYPES = SUPPORTED_DOCUMENT_TYPES.filter((type) => !IMAGE_FILE_TYPES.includes(type));

const FIRESTORE_AUTO_ID = /^[A-Za-z0-9]{20}$/;
const MAX_EMBEDDING_LENGTH = 8192;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function fieldsOf(doc: ExportedDocument): Record<string, unknown> {
  return doc.fields && typeof doc.fields === "object" && !Array.isArray(doc.fields)
    ? (doc.fields as Record<string, unknown>)
    : {};
}

function sub(doc: ExportedDocument, name: string): ExportedDocument[] {
  return Array.isArray(doc.subcollections?.[name]) ? doc.subcollections[name] : [];
}

function normalizeCode(value: unknown): string {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeTerm(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, " ").trim();
}

/** The same class already in this account: same course code and, when both
 *  have one, the same term. "CSC 4052" and "csc-4052" count as the same code. */
export function findConflict(fields: Record<string, unknown>, existing: ExistingClass[]): ExistingClass | undefined {
  const code = normalizeCode(fields.classCode);
  if (!code) return undefined;
  const term = normalizeTerm(fields.term);
  return existing.find((candidate) => {
    if (normalizeCode(candidate.classCode) !== code) return false;
    const otherTerm = normalizeTerm(candidate.term);
    return !term || !otherTerm || term === otherTerm;
  });
}

function countClass(cls: ExportedDocument): ClassCounts {
  const resources = sub(cls, "resources");
  return {
    documents: resources.length,
    indexedDocuments: resources.filter((resource) => sub(resource, "chunks").length > 0).length,
    quizSets: sub(cls, "quizSets").length,
    flashcardSets: sub(cls, "flashcardSets").length,
    practiceSets: sub(cls, "practiceSets").length,
  };
}

/** Every string anywhere in a document tree, for finding which files it uses. */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, out));
}

function treeStrings(doc: ExportedDocument): string {
  const out: string[] = [];
  collectStrings(doc.fields, out);
  for (const docs of Object.values(doc.subcollections ?? {})) {
    for (const child of docs) out.push(treeStrings(child));
  }
  return out.join("\n");
}

/** The stored files a class uses: everything in its storage folder, plus any
 *  other file its documents point to (by key or by /api/download URL). */
export function filesForClass(cls: ExportedDocument, oldUid: string, files: ManifestFile[]): ManifestFile[] {
  const folder = `users/${oldUid}/classes/${cls.id}/`;
  const strings = treeStrings(cls);
  return files.filter(
    (file) =>
      file.objectKey.startsWith(`users/${oldUid}/`) &&
      (file.objectKey.startsWith(folder) ||
        strings.includes(file.objectKey) ||
        strings.includes(encodeURIComponent(file.objectKey))),
  );
}

export function previewClasses(
  classes: ExportedDocument[],
  existing: ExistingClass[],
  oldUid: string,
  files: ManifestFile[],
): ClassPreview[] {
  return classes.map((cls) => {
    const fields = fieldsOf(cls);
    const conflict = findConflict(fields, existing);
    return {
      sourceId: cls.id,
      classCode: text(fields.classCode),
      className: text(fields.className) || text(fields.classCode) || "Untitled class",
      term: text(fields.term),
      counts: countClass(cls),
      files: filesForClass(cls, oldUid, files).length,
      conflict: conflict ? { id: conflict.id, className: text(conflict.className) || text(conflict.classCode) } : null,
    };
  });
}

/** Replaces old ids with new ones inside any string (storage keys, download
 *  URLs, reference paths, ids stored in fields). Ids are long random strings,
 *  so a plain substring swap can't hit ordinary text. */
export function makeRewriter(map: Map<string, string>): (value: string) => string {
  const keys = [...map.keys()].filter((key) => key && map.get(key) !== key).sort((a, b) => b.length - a.length);
  if (keys.length === 0) return (value) => value;
  const pattern = new RegExp(keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return (value) => value.replace(pattern, (match) => map.get(match) ?? match);
}

function rewriteValue(value: unknown, rewrite: (s: string) => string): unknown {
  if (typeof value === "string") return rewrite(value);
  if (Array.isArray(value)) return value.map((entry) => rewriteValue(entry, rewrite));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteValue(entry, rewrite)]));
  }
  return value;
}

function assignIds(doc: ExportedDocument, map: Map<string, string>, newId: () => string): void {
  for (const docs of Object.values(doc.subcollections ?? {})) {
    for (const child of docs) {
      // chunk_0, chunk_1... keep their names: the indexer writes them by index.
      if (FIRESTORE_AUTO_ID.test(child.id) && !map.has(child.id)) map.set(child.id, newId());
      assignIds(child, map, newId);
    }
  }
}

/** Same identity the document worker checks a job against (getSourceSnapshot
 *  in api/embed-document/route.ts); a job with a different version is skipped
 *  as superseded. */
export function sourceSnapshot(resource: Record<string, unknown>): PlannedResource["source"] {
  const url = typeof resource.ocrSourceUrl === "string" ? resource.ocrSourceUrl : String(resource.url ?? "");
  const name = typeof resource.ocrSourceName === "string" ? resource.ocrSourceName : String(resource.name ?? "");
  const fileType = typeof resource.ocrSourceFileType === "string" ? resource.ocrSourceFileType : String(resource.fileType ?? "");
  const version = typeof resource.ocrSourceVersion === "string"
    ? resource.ocrSourceVersion
    : createHash("sha256").update(JSON.stringify({ url, name, fileType })).digest("hex");
  return { url, name, fileType, version };
}

function toChunk(doc: ExportedDocument): ChunkToIndex | null {
  const fields = fieldsOf(doc);
  const embedding = fields.embedding;
  if (
    !Array.isArray(embedding) ||
    embedding.length === 0 ||
    embedding.length > MAX_EMBEDDING_LENGTH ||
    !embedding.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    return null;
  }
  const chunkIndex = typeof fields.chunkIndex === "number" ? fields.chunkIndex : Number(doc.id.replace(/^chunk_/, ""));
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return null;
  return {
    chunkIndex,
    text: text(fields.text),
    embedding: embedding as number[],
    ...(typeof fields.page === "number" ? { page: fields.page } : {}),
  };
}

export function planClassImport(input: {
  cls: ExportedDocument;
  decision: Exclude<ImportDecision, "skip">;
  conflict: ExistingClass | undefined;
  oldUid: string;
  newUid: string;
  files: ManifestFile[];
  newId: () => string;
}): ClassPlan {
  const { cls, conflict, oldUid, newUid, newId } = input;
  // "import" on a class that turned out to exist is a copy, and "merge" needs
  // something to merge into.
  const action = input.decision === "merge" && conflict ? "merged" : conflict ? "copied" : "imported";
  const courseId = action === "merged" ? conflict!.id : newId();

  const map = new Map<string, string>([[oldUid, newUid], [cls.id, courseId]]);
  assignIds(cls, map, newId);
  const rewrite = makeRewriter(map);
  const idFor = (id: string) => map.get(id) ?? id;

  const base = `users/${newUid}/enrollment/${courseId}`;
  const writes: ClassPlan["writes"] = [];
  const resources: PlannedResource[] = [];
  const now = { __catalystExportType: "timestamp", value: new Date().toISOString() };

  if (action !== "merged") {
    const fields = rewriteValue(fieldsOf(cls), rewrite) as Record<string, unknown>;
    if (action === "copied") fields.className = `${text(fields.className) || text(fields.classCode)} (imported)`;
    writes.push({ path: base, data: { ...fields, importedAt: now } });
  }

  const writeTree = (doc: ExportedDocument, path: string, depth: number) => {
    for (const [name, docs] of Object.entries(doc.subcollections ?? {})) {
      for (const child of docs) {
        const childPath = `${path}/${name}/${idFor(child.id)}`;
        const data = rewriteValue(fieldsOf(child), rewrite) as Record<string, unknown>;

        if (depth === 0 && name === "resources") {
          const chunks = sub(child, "chunks").map(toChunk).filter((c): c is ChunkToIndex => c !== null);
          const fileType = text(data.fileType).toLowerCase();
          const needsIndexJob =
            chunks.length === 0 &&
            data.indexSkipped !== true &&
            data.resourceKind !== "ocr_document" &&
            REINDEXABLE_FILE_TYPES.includes(fileType);
          // vectorIndexed flips to true once Qdrant has the chunks again; until
          // then chat search falls back to the Firestore chunks.
          Object.assign(data, { vectorIndexed: false, importedAt: now });
          if (needsIndexJob) Object.assign(data, { indexed: false, indexStatus: "queued", indexError: null });
          resources.push({
            path: childPath,
            courseId,
            resourceId: idFor(child.id),
            chunks,
            needsIndexJob,
            source: sourceSnapshot(data),
          });
        }

        writes.push({ path: childPath, data });
        writeTree(child, childPath, depth + 1);
      }
    }
  };
  writeTree(cls, base, 0);

  // Defense in depth: whatever the archive says, nothing lands outside this
  // account's class.
  for (const write of writes) {
    if (write.path !== base && !write.path.startsWith(`${base}/`)) {
      throw new Error("Import planned a write outside the target class.");
    }
  }

  const files = filesForClass(cls, oldUid, input.files)
    .map((file) => ({ archivePath: file.archivePath, toKey: rewrite(file.objectKey), contentType: file.contentType }))
    .filter((file) => file.toKey.startsWith(`users/${newUid}/`));

  const fields = fieldsOf(cls);
  return {
    sourceId: cls.id,
    className: action === "merged"
      ? text(conflict?.className) || text(fields.className)
      : text(fields.className) || text(fields.classCode) || "Untitled class",
    action,
    courseId,
    writes,
    files,
    resources,
    counts: countClass(cls),
  };
}
