"use client";

import { useRef, useState } from "react";
import { Camera, ChevronRight, Loader2, NotebookPen, UploadCloud, X } from "lucide-react";
import { MAX_FILE_SIZE_BYTES, uploadOcrDocument, uploadUserResource } from "@/src/components/resourceManagement/fileUploadService";
import {
  ACCEPT_ATTR,
  canOcr,
  defaultOcr,
  fileExtension,
  isImage,
  isPdf,
  MAX_FILES_PER_BATCH,
  PDF_OCR_MAX_PAGES,
  planUpload,
} from "@/src/library/notes/uploadRules";
import { renderPdfToImages } from "@/src/library/notes/pdfPages";
import type { ClassOption, Note, Notebook } from "@/src/library/notes/types";
import { compressImage } from "@/src/library/imageCompress";
import ClassSelect, { classLabel } from "./ClassSelect";
import CreateNoteModal from "./CreateNoteModal";
import Modal from "./Modal";

type Tag = "notes" | "classDoc" | "assignments";
const TAGS: { value: Tag; label: string }[] = [
  { value: "notes", label: "Notes" },
  { value: "classDoc", label: "Class Doc" },
  { value: "assignments", label: "Assignment" },
];

/** The one "add" window: take typed notes, or drop, pick or photograph files
 *  and choose whether Catalyst should read their text (OCR). Photos can be
 *  combined into one scanned document; PDFs are read page by page and keep
 *  the original beside the transcription. */
export default function AddModal({
  uid,
  classes,
  notebooks,
  notes,
  defaultCourseId,
  defaultNotebookId,
  onUploaded,
  onPartial,
  onNoteCreated,
  onClose,
}: {
  uid: string;
  classes: ClassOption[];
  notebooks: Notebook[];
  notes: Note[];
  defaultCourseId: string | null;
  defaultNotebookId?: string | null;
  onUploaded: () => void;
  /** Some files saved and some did not - refresh, but the window stays open. */
  onPartial?: () => void;
  onNoteCreated: (noteId: string, courseId: string | null) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"add" | "note">("add");
  const [courseId, setCourseId] = useState(defaultCourseId ?? classes[0]?.id ?? "");
  const [tag, setTag] = useState<Tag>("notes");
  const [files, setFiles] = useState<File[]>([]);
  const [ocr, setOcr] = useState(false);
  const [ocrTouched, setOcrTouched] = useState(false);
  const [combine, setCombine] = useState(false);
  const [scanName, setScanName] = useState("");
  const [dragging, setDragging] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imageCount = files.filter((f) => isImage(f.name)).length;
  const pdfCount = files.filter((f) => isPdf(f.name)).length;
  const ocrEligible = imageCount + pdfCount > 0;
  const canCombine = ocr && imageCount >= 2;
  const effectiveCourseId = courseId || classes[0]?.id || "";

  // Phone photos are often 4000px and 5MB+; shrinking them first makes the
  // upload quick and the OCR reliable (the model downsizes them anyway).
  async function prepare(incoming: File[], fromCamera: boolean): Promise<File[]> {
    const taken = files.length;
    return Promise.all(
      incoming.map(async (file, i) => {
        if (!isImage(file.name) && !file.type.startsWith("image/")) return file;
        try {
          const out = await compressImage(file, { maxEdge: 2200, quality: 0.86 });
          const base = fromCamera ? `Page ${taken + i + 1}` : file.name.replace(/\.[^.]+$/, "");
          if (!out.recompressed && !fromCamera) return file;
          return new File([out.blob], `${base}.${out.blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "jpg")}`, { type: out.blob.type || file.type });
        } catch {
          return file;
        }
      })
    );
  }

  async function addIncoming(incoming: File[], fromCamera = false) {
    setPreparing(true);
    try {
      addFiles(await prepare(incoming, fromCamera), fromCamera);
    } finally {
      setPreparing(false);
    }
  }

  function settle(next: File[], fromCamera: boolean) {
    setFiles(next);
    if (!ocrTouched) setOcr(defaultOcr(next.map((f) => f.name)));
    // Camera pages are almost always one document; default to combining them.
    if (fromCamera && next.length > 1 && next.every((f) => isImage(f.name))) setCombine(true);
  }

  function addFiles(incoming: File[], fromCamera = false) {
    let next = [...files, ...incoming];
    const notes: string[] = [];
    if (next.length > MAX_FILES_PER_BATCH) {
      notes.push(`Up to ${MAX_FILES_PER_BATCH} files at a time - only the first ${MAX_FILES_PER_BATCH} were kept.`);
      next = next.slice(0, MAX_FILES_PER_BATCH);
    }
    const big = next.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (big.length) notes.push(`Skipped (over 20MB): ${big.map((f) => f.name).join(", ")}`);
    const unsupported = next.filter((f) => !fileExtension(f.name));
    if (unsupported.length) notes.push(`Skipped unsupported files: ${unsupported.map((f) => f.name).join(", ")}`);
    next = next.filter((f) => f.size <= MAX_FILE_SIZE_BYTES && fileExtension(f.name));
    settle(next, fromCamera);
    setError(notes.length ? notes.join(" ") : null);
  }

  function removeFile(index: number) {
    settle(files.filter((_, j) => j !== index), false);
  }

  async function upload() {
    if (!effectiveCourseId) {
      setError("Choose a class for this upload.");
      return;
    }
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress(null);

    const mergePhotos = canCombine && combine;
    const category = tag;
    const base = { userId: uid, classDocId: effectiveCourseId, category };
    const jobs: { files: File[]; run: () => Promise<unknown>; heavy: boolean }[] = [];

    if (mergePhotos) {
      const photos = files.filter((f) => isImage(f.name));
      jobs.push({
        files: photos,
        heavy: false,
        run: () =>
          uploadOcrDocument({
            ...base,
            files: photos,
            name: scanName.trim() || `Scanned notes ${new Date().toLocaleDateString()}`,
            pageNames: photos.map((f) => f.name),
          }),
      });
    }
    for (const file of files) {
      if (mergePhotos && isImage(file.name)) continue;
      const plan = planUpload(file.name, ocr);
      if (plan === "ocr-pdf") {
        jobs.push({
          files: [file],
          heavy: true,
          run: async () => {
            const { pages } = await renderPdfToImages(file, {
              maxPages: PDF_OCR_MAX_PAGES,
              onProgress: (done, total) => setProgress(`Reading ${file.name} (page ${done} of ${total})...`),
            });
            await uploadOcrDocument({
              ...base,
              files: pages,
              name: file.name.replace(/\.pdf$/i, ""),
              pageNames: pages.map((p) => p.name),
              original: file,
            });
          },
        });
      } else {
        // Without OCR a photo is stored as a plain picture, so it must not
        // be indexed (indexing a photo is what reads its text).
        jobs.push({ files: [file], heavy: false, run: () => uploadUserResource({ ...base, file, index: !(plan === "plain" && isImage(file.name)) }) });
      }
    }

    const failed: { files: File[]; reason: string }[] = [];
    const record = (job: { files: File[] }, result: PromiseSettledResult<unknown>) => {
      if (result.status === "rejected") {
        console.error("Upload failed:", result.reason);
        failed.push({ files: job.files, reason: result.reason instanceof Error ? result.reason.message : "Upload failed." });
      }
    };
    const light = jobs.filter((j) => !j.heavy);
    (await Promise.allSettled(light.map((j) => j.run()))).forEach((r, i) => record(light[i], r));
    for (const job of jobs.filter((j) => j.heavy)) {
      const [result] = await Promise.allSettled([job.run()]);
      record(job, result);
    }

    setProgress(null);
    if (failed.length === 0) {
      onUploaded();
      return;
    }
    const failedFiles = new Set(failed.flatMap((f) => f.files));
    if (failed.length < jobs.length) onPartial?.();
    setFiles((current) => current.filter((f) => failedFiles.has(f)));
    setError(`${failed.length < jobs.length ? "Some files were saved, but " : ""}${failed.map((f) => `${f.files.map((x) => x.name).join(", ")}: ${f.reason}`).join(" ")}`);
    setBusy(false);
  }

  if (step === "note") {
    return (
      <CreateNoteModal
        uid={uid}
        classes={classes}
        notebooks={notebooks}
        notes={notes}
        defaultCourseId={defaultCourseId}
        defaultNotebookId={defaultNotebookId}
        onClose={() => setStep("add")}
        onCreated={(id, noteCourseId) => onNoteCreated(id, noteCourseId)}
      />
    );
  }

  const selectedClass = classes.find((c) => c.id === defaultCourseId);

  return (
    <Modal title="Add to your class" onClose={onClose} busy={busy} width="max-w-lg">
      <div className="space-y-4">
        {defaultCourseId ? (
          <p className="text-xs text-text-muted">
            Saving to <span className="font-medium text-text-main">{selectedClass ? classLabel(selectedClass) : "this class"}</span>
          </p>
        ) : (
          <div>
            <label htmlFor="add-class" className="mb-1.5 block text-xs font-medium text-text-muted">
              Class
            </label>
            {classes.length === 0 ? (
              <p className="text-sm text-text-muted">Add a class first - everything you add is saved to a class.</p>
            ) : (
              <ClassSelect id="add-class" classes={classes} value={effectiveCourseId} onChange={setCourseId} disabled={busy} />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setStep("note")}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-xl border border-border-light p-3 text-left transition-colors hover:border-primary hover:bg-bg-warm disabled:opacity-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-warm text-primary">
            <NotebookPen size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text-main">Take Notes</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">Start a blank page with headings, lists, drawing and highlighting.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-text-muted" />
        </button>

        <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-border-light" /> or add a file <span className="h-px flex-1 bg-border-light" />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy && e.dataTransfer.files?.length) void addIncoming(Array.from(e.dataTransfer.files));
          }}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
            dragging ? "border-primary bg-bg-warm" : "border-border-light"
          }`}
        >
          <UploadCloud size={24} className={dragging ? "text-primary" : "text-text-muted"} />
          <p className="text-xs text-text-muted">Drop photos, PDFs or documents here, or</p>
          <div className="flex flex-wrap justify-center gap-2">
            <label className="cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm">
              Browse files
              <input
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="hidden"
                disabled={busy}
                aria-label="Choose files to add"
                onChange={(e) => {
                  if (e.target.files) void addIncoming(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={busy || preparing || files.length >= MAX_FILES_PER_BATCH}
              className="flex items-center gap-1.5 rounded-lg border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm disabled:opacity-40"
            >
              <Camera size={14} /> {files.some((f) => /^Page \d+\./.test(f.name)) ? "Take another page" : "Take a photo"}
            </button>
            {/* The phone's own camera app: autofocus, flash, HDR and its document tools all work. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Take a photo with your camera"
              onChange={(e) => {
                if (e.target.files?.length) void addIncoming(Array.from(e.target.files), true);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {preparing && (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={13} className="animate-spin" /> Preparing photo...
          </p>
        )}
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-bg-main px-3 py-1.5 text-xs text-text-main">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => removeFile(i)} className="text-text-muted hover:text-text-main">
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {ocrEligible && (
          <div className="space-y-3 rounded-xl bg-bg-main p-3">
            <label className="flex items-start gap-2 text-sm text-text-main">
              <input
                type="checkbox"
                checked={ocr}
                onChange={(e) => {
                  setOcr(e.target.checked);
                  setOcrTouched(true);
                }}
                className="mt-0.5 accent-primary"
                disabled={busy}
              />
              <span>
                Read the text in {files.filter((f) => canOcr(f.name)).length > 1 ? "these files" : "this file"} (OCR)
                <span className="block text-xs text-text-muted">
                  {pdfCount > 0
                    ? `Handwritten or scanned? Catalyst turns the pages into searchable text (first ${PDF_OCR_MAX_PAGES} pages) and keeps the original beside it. Typed PDFs don't need this.`
                    : "Catalyst reads the handwriting or print so you can search and study from it. The original photo stays one tap away."}
                </span>
              </span>
            </label>
            {canCombine && (
              <label className="flex items-start gap-2 text-sm text-text-main">
                <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} className="mt-0.5 accent-primary" disabled={busy} />
                <span>
                  Combine the photos into one document
                  <span className="block text-xs text-text-muted">Each photo becomes a page. Leave off to save each as its own file.</span>
                </span>
              </label>
            )}
            {canCombine && combine && (
              <input
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
                placeholder="Name, e.g. Week 3 lecture notes"
                aria-label="Scanned document name"
                maxLength={120}
                disabled={busy}
                className="w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
              />
            )}
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-xs font-medium text-text-muted">Tag</span>
          <div className="flex gap-2">
            {TAGS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTag(t.value)}
                disabled={busy}
                aria-pressed={tag === t.value}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                  tag === t.value ? "border-primary bg-bg-warm text-primary" : "border-border-light text-text-muted hover:border-border-hover"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-alert-error">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={upload}
          disabled={busy || preparing || files.length === 0 || !effectiveCourseId}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-40"
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" /> {progress ?? "Uploading..."}
            </>
          ) : (
            `Add${files.length ? ` ${files.length} file${files.length === 1 ? "" : "s"}` : " files"}`
          )}
        </button>
      </div>
    </Modal>
  );
}
