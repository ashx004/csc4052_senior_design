import "server-only";
import { createHash, randomBytes } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod";
import { decodeAccountExportValue } from "./accountDataExportFormat";
import {
  findConflict,
  planClassImport,
  previewClasses,
  type ClassPlan,
  type ClassPreview,
  type ExistingClass,
  type ExportedDocument,
  type ImportDecision,
  type ManifestFile,
} from "./accountDataImportPlan";

// Restores classes from a "Download my data" export (accountDataExport.ts)
// into the signed-in account. accountDataImportPlan.ts decides what to write;
// this file reads and checks the archive, then does the writing.
//
// Order per class: stored files, then Firestore, then the Qdrant search index,
// so nothing points at a file that isn't there yet. Each class succeeds or
// fails on its own and the summary says which.

const DEFAULT_MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const MAX_DOCUMENTS = 50_000;
const JOB_COLLECTION = "documentProcessingJobs";

export class AccountDataImportError extends Error {
  constructor(public readonly status: number, public readonly publicMessage: string, cause?: unknown) {
    super(publicMessage, { cause });
    this.name = "AccountDataImportError";
  }
}

/** Same cap as the export, so anything Catalyst exported can be imported. */
export function importByteLimit(): number {
  const configured = Number(process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_IMPORT_BYTES;
}

// ── Archive format checks ──────────────────────────────────────────────────

const SegmentSchema = z
  .string()
  .min(1)
  .max(1500)
  .refine((id) => !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id), "Invalid document id");

const ExportedDocumentSchema: z.ZodType<ExportedDocument> = z.lazy(() =>
  z.object({
    id: SegmentSchema,
    fields: z.unknown(),
    subcollections: z.record(SegmentSchema, z.array(ExportedDocumentSchema)),
  }),
);

const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  uid: z.string().min(1).max(128),
  generatedAt: z.string().optional(),
  includedServices: z.object({ accountRecords: z.boolean() }).passthrough(),
  files: z.array(
    z.object({
      archivePath: z.string().startsWith("files/objects/").max(500),
      objectKey: z.string().min(1).max(1024),
      contentType: z.string().nullable(),
      bytes: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
});

export type ParsedImportArchive = {
  sourceUid: string;
  generatedAt: string | null;
  classes: ExportedDocument[];
  files: ManifestFile[];
  fileBytes: Map<string, Buffer>;
};

/** Reads one archive entry without trusting its declared size, so a small
 *  ZIP that unpacks to gigabytes is stopped at the budget. */
function readEntry(zip: JSZip, name: string, budget: { remaining: number }): Promise<Buffer> {
  const entry = zip.file(name);
  if (!entry) return Promise.reject(new AccountDataImportError(400, `This file is missing ${name}. Use the ZIP from "Download my data" unchanged.`));
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    const stream = entry.nodeStream("nodebuffer");
    let stopped = false;
    stream.on("data", (chunk: Buffer) => {
      if (stopped) return;
      budget.remaining -= chunk.length;
      if (budget.remaining < 0) {
        stopped = true;
        stream.pause();
        reject(new AccountDataImportError(413, "This export is larger than the import limit."));
        return;
      }
      parts.push(chunk);
    });
    stream.on("error", (error: Error) => reject(new AccountDataImportError(400, "This file is damaged and can't be read.", error)));
    stream.on("end", () => resolve(Buffer.concat(parts)));
  });
}

function parseJson(buffer: Buffer, name: string): unknown {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new AccountDataImportError(400, `${name} in this file is damaged or was edited.`, error);
  }
}

function countDocuments(docs: ExportedDocument[]): number {
  return docs.reduce((sum, doc) => sum + 1 + countDocuments(Object.values(doc.subcollections).flat()), 0);
}

export async function parseImportArchive(archive: Buffer): Promise<ParsedImportArchive> {
  const limit = importByteLimit();
  if (archive.length > limit) throw new AccountDataImportError(413, "This export is larger than the import limit.");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(archive);
  } catch (error) {
    throw new AccountDataImportError(400, "This isn't a Catalyst export. Choose the ZIP file from \"Download my data\".", error);
  }

  // Unpacked size may be up to twice the ZIP limit (the export stores files uncompressed).
  const budget = { remaining: limit * 2 };
  const manifest = ManifestSchema.safeParse(parseJson(await readEntry(zip, "manifest.json", budget), "manifest.json"));
  if (!manifest.success) {
    throw new AccountDataImportError(400, "This export's manifest is from an unsupported version or was edited.");
  }
  if (!manifest.data.includedServices.accountRecords) {
    throw new AccountDataImportError(400, "This export doesn't include your classes, so there's nothing to import.");
  }

  const tree = z
    .object({ root: ExportedDocumentSchema.nullable() })
    .safeParse(parseJson(await readEntry(zip, "firestore.json", budget), "firestore.json"));
  if (!tree.success) throw new AccountDataImportError(400, "This export's class data is damaged or was edited.");

  const classes = tree.data.root?.subcollections.enrollment ?? [];
  if (countDocuments(classes) > MAX_DOCUMENTS) {
    throw new AccountDataImportError(413, "This export has more records than can be imported at once.");
  }

  // Every stored file must match the checksum the export recorded, so a
  // damaged or altered file is caught before anything is written.
  const fileBytes = new Map<string, Buffer>();
  for (const file of manifest.data.files) {
    const bytes = await readEntry(zip, file.archivePath, budget);
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      throw new AccountDataImportError(400, "A file in this export is damaged or was changed after it was downloaded.");
    }
    fileBytes.set(file.archivePath, bytes);
  }

  return {
    sourceUid: manifest.data.uid,
    generatedAt: manifest.data.generatedAt ?? null,
    classes,
    files: manifest.data.files,
    fileBytes,
  };
}

// ── Preview ────────────────────────────────────────────────────────────────

export type ImportPreview = {
  generatedAt: string | null;
  fromAnotherAccount: boolean;
  classes: ClassPreview[];
};

async function existingClasses(uid: string): Promise<ExistingClass[]> {
  const { adminDb } = await import("./firebaseAdmin");
  const snapshot = await adminDb.collection(`users/${uid}/enrollment`).select("classCode", "className", "term").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function previewAccountImport(uid: string, archive: ParsedImportArchive): Promise<ImportPreview> {
  return {
    generatedAt: archive.generatedAt,
    fromAnotherAccount: archive.sourceUid !== uid,
    classes: previewClasses(archive.classes, await existingClasses(uid), archive.sourceUid, archive.files),
  };
}

// ── Import ─────────────────────────────────────────────────────────────────

export type ClassImportResult = {
  sourceId: string;
  className: string;
  action: ClassPlan["action"] | "skipped" | "failed";
  documents: number;
  quizSets: number;
  flashcardSets: number;
  practiceSets: number;
  files: number;
  /** Documents searchable again right away (search index restored). */
  searchRestored: number;
  /** Documents queued for the document worker to index from scratch. */
  queuedForIndexing: number;
  error?: string;
};

export type ImportSummary = { classes: ClassImportResult[]; queuedJobs: number };

function firestoreId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(20), (byte) => alphabet[byte % alphabet.length]).join("");
}

async function runClassPlan(uid: string, plan: ClassPlan, archive: ParsedImportArchive): Promise<ClassImportResult> {
  const [{ adminDb }, { GeoPoint }, { putObject }, { upsertChunks, chunkPointId }] = await Promise.all([
    import("./firebaseAdmin"),
    import("firebase-admin/firestore"),
    import("./gcsStorage"),
    import("./vectorStore"),
  ]);
  const result: ClassImportResult = {
    sourceId: plan.sourceId,
    className: plan.className,
    action: plan.action,
    documents: plan.counts.documents,
    quizSets: plan.counts.quizSets,
    flashcardSets: plan.counts.flashcardSets,
    practiceSets: plan.counts.practiceSets,
    files: plan.files.length,
    searchRestored: 0,
    queuedForIndexing: 0,
  };

  // 1. Stored files.
  for (const file of plan.files) {
    const bytes = archive.fileBytes.get(file.archivePath);
    if (bytes) await putObject(file.toKey, bytes, file.contentType ?? undefined);
  }

  // 2. Firestore. BulkWriter rather than one batch: chunk documents carry
  // embedding arrays, which make large batches fail as "too big".
  const factories = {
    geopoint: (latitude: number, longitude: number) => new GeoPoint(latitude, longitude),
    // Only references into this account become real references again.
    reference: (path: string) => (path.startsWith(`users/${uid}/`) ? adminDb.doc(path) : null),
  };
  const writer = adminDb.bulkWriter();
  let writeError: unknown = null;
  writer.onWriteError((error) => {
    if (error.failedAttempts < 3) return true;
    writeError = error;
    return false;
  });
  for (const write of plan.writes) {
    void writer.set(adminDb.doc(write.path), decodeAccountExportValue(write.data, factories) as Record<string, unknown>).catch(() => {});
  }
  await writer.close();
  if (writeError) throw writeError;

  // 3. Search index, straight from the saved chunk vectors (no AI calls).
  // Best effort per document: one that fails stays searchable through the
  // Firestore fallback, like any document whose Qdrant write failed.
  for (const resource of plan.resources.filter((r) => r.chunks.length > 0)) {
    try {
      await upsertChunks(
        resource.chunks.map((chunk) => ({
          id: chunkPointId(resource.resourceId, chunk.chunkIndex),
          vector: chunk.embedding,
          payload: {
            userId: uid,
            courseId: resource.courseId,
            resourceId: resource.resourceId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            ...(chunk.page !== undefined ? { page: chunk.page } : {}),
          },
        })),
      );
      await adminDb.doc(resource.path).update({ vectorIndexed: true });
      result.searchRestored += 1;
    } catch (error) {
      console.error("[account/data-import] search index restore failed", {
        category: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  // 4. Documents without saved chunks go to the normal document worker queue,
  // in the same job shape api/embed-document creates.
  for (const resource of plan.resources.filter((r) => r.needsIndexJob)) {
    await adminDb.collection(JOB_COLLECTION).doc(`${uid}_${resource.courseId}_${resource.resourceId}`).set({
      userId: uid,
      courseId: resource.courseId,
      resourceId: resource.resourceId,
      sourceVersion: resource.source.version,
      sourceUrl: resource.source.url,
      sourceName: resource.source.name,
      sourceFileType: resource.source.fileType,
      status: "queued",
      progress: 0,
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    });
    result.queuedForIndexing += 1;
  }

  return result;
}

export async function importAccountData(
  uid: string,
  archive: ParsedImportArchive,
  decisions: Record<string, ImportDecision>,
): Promise<ImportSummary> {
  const existing = await existingClasses(uid);
  const results: ClassImportResult[] = [];

  for (const cls of archive.classes) {
    const conflict = findConflict((cls.fields ?? {}) as Record<string, unknown>, existing);
    // With no choice sent, a class that already exists is left alone.
    const decision = decisions[cls.id] ?? (conflict ? "skip" : "import");
    const name = String((cls.fields as Record<string, unknown>)?.className ?? "") || "Untitled class";

    if (decision === "skip") {
      results.push({
        sourceId: cls.id, className: name, action: "skipped",
        documents: 0, quizSets: 0, flashcardSets: 0, practiceSets: 0, files: 0, searchRestored: 0, queuedForIndexing: 0,
      });
      continue;
    }

    try {
      const plan = planClassImport({
        cls, decision, conflict, oldUid: archive.sourceUid, newUid: uid, files: archive.files, newId: firestoreId,
      });
      results.push(await runClassPlan(uid, plan, archive));
      // A second class in the same file with the same code now matches this one.
      if (plan.action !== "merged") {
        const fields = cls.fields as Record<string, unknown>;
        existing.push({ id: plan.courseId, classCode: fields?.classCode, className: plan.className, term: fields?.term });
      }
    } catch (error) {
      console.error("[account/data-import] class import failed", {
        category: error instanceof Error ? error.name : "unknown",
      });
      results.push({
        sourceId: cls.id, className: name, action: "failed",
        documents: 0, quizSets: 0, flashcardSets: 0, practiceSets: 0, files: 0, searchRestored: 0, queuedForIndexing: 0,
        error: "This class couldn't be imported. Anything already restored for it was kept; try importing it again as a copy.",
      });
    }
  }

  return { classes: results, queuedJobs: results.reduce((sum, r) => sum + r.queuedForIndexing, 0) };
}
