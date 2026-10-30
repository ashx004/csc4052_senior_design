import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

// An in-memory Firestore, storage bucket and search index, just big enough for
// the real export (accountDataExport.ts) and the import to run end to end.
const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const objects = new Map<string, { body: Buffer; contentType: string | null }>();
  const upserts: { id: string; payload: Record<string, unknown> }[] = [];

  const segments = (path: string) => path.split("/").length;
  const snapshot = (path: string) => ({
    id: path.split("/").pop()!,
    exists: docs.has(path),
    data: () => docs.get(path),
    ref: ref(path),
  });
  function listUnder(collectionPath: string) {
    return [...docs.keys()]
      .filter((key) => key.startsWith(`${collectionPath}/`) && segments(key) === segments(collectionPath) + 1)
      .map(snapshot);
  }
  function ref(path: string) {
    return {
      path,
      id: path.split("/").pop()!,
      get: async () => snapshot(path),
      set: async (data: Record<string, unknown>) => void docs.set(path, data),
      update: async (data: Record<string, unknown>) => void docs.set(path, { ...docs.get(path), ...data }),
      listCollections: async () => {
        const names = new Set<string>();
        for (const key of docs.keys()) {
          if (key.startsWith(`${path}/`)) names.add(key.slice(path.length + 1).split("/")[0]);
        }
        return [...names].map((name) => ({ id: name, get: async () => ({ docs: listUnder(`${path}/${name}`) }) }));
      },
    };
  }
  const empty = { get: async () => ({ docs: [] }) };
  const adminDb = {
    doc: ref,
    collection: (path: string) => ({
      doc: (id: string) => ref(`${path}/${id}`),
      where: () => empty,
      select: () => ({ get: async () => ({ docs: listUnder(path) }) }),
    }),
    collectionGroup: () => ({ where: () => empty }),
    bulkWriter: () => ({
      set: (target: { path: string }, data: Record<string, unknown>) => Promise.resolve(void docs.set(target.path, data)),
      onWriteError: () => {},
      close: async () => {},
    }),
  };
  const adminAuth = {
    getUser: async (uid: string) => ({
      uid, email: `${uid}@test`, emailVerified: true, disabled: false, providerData: [], metadata: {},
    }),
  };
  const storage = {
    listObjects: async (prefix: string) =>
      [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, size: value.body.length, lastModified: null, etag: null })),
    getObject: async (key: string) => objects.get(key)!,
    putObject: async (key: string, body: Buffer, contentType?: string) => void objects.set(key, { body, contentType: contentType ?? null }),
  };
  const vectors = {
    listChunksForUser: async () => [],
    chunkPointId: (resourceId: string, index: number) => `${resourceId}_${index}`,
    upsertChunks: async (points: { id: string; payload: Record<string, unknown> }[]) => void upserts.push(...points),
  };
  return { docs, objects, upserts, adminDb, adminAuth, storage, vectors };
});

// Only GeoPoint is used; the real package takes ~20s to load on a cold run.
vi.mock("firebase-admin/firestore", () => ({ GeoPoint: class { constructor(public latitude: number, public longitude: number) {} } }));
vi.mock("./firebaseAdmin", () => ({ adminDb: fake.adminDb, adminAuth: fake.adminAuth }));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: fake.adminDb, adminAuth: fake.adminAuth }));
vi.mock("./gcsStorage", () => fake.storage);
vi.mock("@/src/library/gcsStorage", () => fake.storage);
vi.mock("./vectorStore", () => fake.vectors);
vi.mock("@/src/library/vectorStore", () => fake.vectors);

import { buildAccountDataExport } from "./accountDataExport";
import { AccountDataImportError, importAccountData, parseImportArchive, previewAccountImport } from "./accountDataImport";

const OLD = "oldUserUid0000000000000000";
const NEW = "newUserUid1111111111111111";
const COURSE = "CourseIdAAAAAAAAAAAA";
const PDF = "ResourcePdfAAAAAAAAA";
const TXT = "ResourceTxtAAAAAAAAA";
const QUIZ = "QuizSetIdAAAAAAAAAAA";
const PDF_KEY = `users/${OLD}/classes/${COURSE}/1700000000000_notes.pdf`;
const TXT_KEY = `users/${OLD}/classes/${COURSE}/1700000000001_outline.txt`;
const downloadUrl = (key: string) => `/api/download?key=${encodeURIComponent(key)}`;

function seedSourceAccount() {
  const base = `users/${OLD}/enrollment/${COURSE}`;
  fake.docs.set(`users/${OLD}`, { displayName: "Old", aiCreditMicros: 9_000_000 });
  fake.docs.set(`users/${OLD}/billing/wallet`, { balanceMicros: 9_000_000 });
  fake.docs.set(base, { classCode: "CSC 4052", className: "Senior Design", term: "Fall 2026", createdAt: new Date("2026-08-20T00:00:00Z") });
  fake.docs.set(`${base}/resources/${PDF}`, { name: "notes.pdf", url: downloadUrl(PDF_KEY), fileType: "pdf", indexed: true, vectorIndexed: true, chunkCount: 2 });
  fake.docs.set(`${base}/resources/${PDF}/chunks/chunk_0`, { text: "Agile sprints", embedding: [0.1, 0.2, 0.3], chunkIndex: 0, page: 1 });
  fake.docs.set(`${base}/resources/${PDF}/chunks/chunk_1`, { text: "Burndown charts", embedding: [0.4, 0.5, 0.6], chunkIndex: 1, page: 2 });
  fake.docs.set(`${base}/resources/${TXT}`, { name: "outline.txt", url: downloadUrl(TXT_KEY), fileType: "txt" });
  fake.docs.set(`${base}/quizSets/${QUIZ}`, { title: "Sprint quiz", sourceResourceId: PDF, docUrl: downloadUrl(PDF_KEY) });
  fake.objects.set(PDF_KEY, { body: Buffer.from("%PDF fake notes"), contentType: "application/pdf" });
  fake.objects.set(TXT_KEY, { body: Buffer.from("week 1: kickoff"), contentType: "text/plain" });
}

function writtenUnder(uid: string) {
  return [...fake.docs.entries()].filter(([path]) => path.startsWith(`users/${uid}/`));
}

beforeEach(() => {
  fake.docs.clear();
  fake.objects.clear();
  fake.upserts.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  seedSourceAccount();
});

describe("export and re-import round trip", () => {
  it("restores a class into a different account with new ids, files and search index", async () => {
    const archive = await parseImportArchive(await buildAccountDataExport(OLD));

    const preview = await previewAccountImport(NEW, archive);
    expect(preview.fromAnotherAccount).toBe(true);
    expect(preview.classes).toEqual([
      expect.objectContaining({
        className: "Senior Design",
        conflict: null,
        files: 2,
        counts: { documents: 2, indexedDocuments: 1, quizSets: 1, flashcardSets: 0, practiceSets: 0 },
      }),
    ]);

    const summary = await importAccountData(NEW, archive, {});
    expect(summary.classes[0]).toMatchObject({ action: "imported", documents: 2, searchRestored: 1, queuedForIndexing: 1 });

    const written = writtenUnder(NEW);
    const classes = written.filter(([path]) => /^users\/[^/]+\/enrollment\/[^/]+$/.test(path));
    expect(classes).toHaveLength(1);
    const [classPath, classData] = classes[0];
    const newCourse = classPath.split("/").pop()!;
    expect(newCourse).not.toBe(COURSE);
    expect(classData).toMatchObject({ classCode: "CSC 4052", className: "Senior Design" });
    expect(classData.createdAt).toEqual(new Date("2026-08-20T00:00:00Z"));

    // Nothing points at the old account any more.
    expect(JSON.stringify(written)).not.toContain(OLD);

    // Resources got new ids, and their download URLs point at the restored files.
    const resources = written.filter(([path]) => /\/resources\/[^/]+$/.test(path));
    expect(resources.map(([path]) => path.split("/").pop())).not.toContain(PDF);
    const pdf = resources.find(([, data]) => data.name === "notes.pdf")!;
    const newPdfKey = decodeURIComponent(String(pdf[1].url).split("key=")[1]);
    expect(newPdfKey).toBe(`users/${NEW}/classes/${newCourse}/1700000000000_notes.pdf`);
    expect(fake.objects.get(newPdfKey)?.body.toString()).toBe("%PDF fake notes");

    // The quiz still points at its source document under its new id.
    const quiz = written.find(([path]) => path.includes("/quizSets/"))!;
    expect(quiz[1].sourceResourceId).toBe(pdf[0].split("/").pop());

    // Search index rebuilt from the saved vectors, owned by the new account.
    const newPdfId = pdf[0].split("/").pop()!;
    expect(fake.upserts).toEqual([
      { id: `${newPdfId}_0`, vector: [0.1, 0.2, 0.3], payload: { userId: NEW, courseId: newCourse, resourceId: newPdfId, chunkIndex: 0, text: "Agile sprints", page: 1 } },
      { id: `${newPdfId}_1`, vector: [0.4, 0.5, 0.6], payload: { userId: NEW, courseId: newCourse, resourceId: newPdfId, chunkIndex: 1, text: "Burndown charts", page: 2 } },
    ]);
    expect(pdf[1].vectorIndexed).toBe(true);

    // The text file had no saved chunks, so it's queued for the document worker.
    const txt = resources.find(([, data]) => data.name === "outline.txt")!;
    const txtId = txt[0].split("/").pop()!;
    expect(fake.docs.get(`documentProcessingJobs/${NEW}_${newCourse}_${txtId}`)).toMatchObject({ userId: NEW, status: "queued", sourceFileType: "txt" });
  });

  it("never imports credit, billing or account settings", async () => {
    const archive = await parseImportArchive(await buildAccountDataExport(OLD));
    await importAccountData(NEW, archive, {});
    expect(fake.docs.has(`users/${NEW}`)).toBe(false);
    expect(fake.docs.has(`users/${NEW}/billing/wallet`)).toBe(false);
    expect(JSON.stringify(writtenUnder(NEW))).not.toContain("Micros");
  });

  it("re-importing into the same account never overwrites existing data", async () => {
    const before = new Map(fake.docs);
    const archive = await parseImportArchive(await buildAccountDataExport(OLD));

    const preview = await previewAccountImport(OLD, archive);
    expect(preview.fromAnotherAccount).toBe(false);
    expect(preview.classes[0].conflict).toEqual({ id: COURSE, className: "Senior Design" });

    // With no choice made, an existing class is skipped.
    expect((await importAccountData(OLD, archive, {})).classes[0].action).toBe("skipped");
    expect(fake.docs).toEqual(before);

    // Merging adds copies of the documents to the existing class.
    const merged = await importAccountData(OLD, archive, { [COURSE]: "merge" });
    expect(merged.classes[0]).toMatchObject({ action: "merged", className: "Senior Design" });
    for (const [path, data] of before) expect(fake.docs.get(path)).toEqual(data);
    const resourcesNow = [...fake.docs.keys()].filter((p) => p.startsWith(`users/${OLD}/enrollment/${COURSE}/resources/`) && !p.includes("/chunks/"));
    expect(resourcesNow).toHaveLength(4);
    expect(fake.upserts.map((point) => point.id)).not.toContain(`${PDF}_0`);

    // A copy becomes a second, clearly named class.
    await importAccountData(OLD, archive, { [COURSE]: "copy" });
    const classNames = [...fake.docs.entries()]
      .filter(([path]) => /^users\/[^/]+\/enrollment\/[^/]+$/.test(path))
      .map(([, data]) => data.className);
    expect(classNames.sort()).toEqual(["Senior Design", "Senior Design (imported)"]);
  });
});

describe("damaged, edited or wrong files", () => {
  async function exportZip() {
    return JSZip.loadAsync(await buildAccountDataExport(OLD));
  }
  async function rezip(zip: JSZip) {
    return zip.generateAsync({ type: "nodebuffer" });
  }
  async function rejects(archive: Buffer, message: RegExp) {
    const error = await parseImportArchive(archive).catch((e) => e);
    expect(error).toBeInstanceOf(AccountDataImportError);
    expect(error.publicMessage).toMatch(message);
  }

  it("rejects something that isn't a ZIP", async () => {
    await rejects(Buffer.from("definitely not a zip"), /isn't a Catalyst export/);
  });

  it("rejects a ZIP without a manifest", async () => {
    const zip = await exportZip();
    zip.remove("manifest.json");
    await rejects(await rezip(zip), /missing manifest.json/);
  });

  it("rejects an unknown export version", async () => {
    const zip = await exportZip();
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    zip.file("manifest.json", JSON.stringify({ ...manifest, schemaVersion: 99 }));
    await rejects(await rezip(zip), /unsupported version/);
  });

  it("rejects a stored file changed after download", async () => {
    const zip = await exportZip();
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    zip.file(manifest.files[0].archivePath, "tampered contents");
    await rejects(await rezip(zip), /damaged or was changed/);
  });

  it("rejects class data edited into an invalid shape", async () => {
    const zip = await exportZip();
    zip.file("firestore.json", JSON.stringify({ root: { id: OLD, fields: {}, subcollections: { enrollment: [{ id: "../../escape", fields: {}, subcollections: {} }] } } }));
    await rejects(await rezip(zip), /damaged or was edited/);
  });

  it("rejects broken JSON", async () => {
    const zip = await exportZip();
    zip.file("firestore.json", "{ not json");
    await rejects(await rezip(zip), /damaged or was edited/);
  });
});
