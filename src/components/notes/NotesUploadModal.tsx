"use client";

import { useState } from "react";
import { Camera, Loader2, UploadCloud, X } from "lucide-react";
import { MAX_FILE_SIZE_BYTES, uploadOcrDocument, uploadUserResource } from "@/src/components/resourceManagement/fileUploadService";
import { ACCEPT_ATTR, fileExtension, isImage, MAX_FILES_PER_BATCH } from "@/src/library/notes/uploadRules";
import type { ClassOption } from "@/src/library/notes/types";
import CameraCaptureModal from "./CameraCaptureModal";
import ClassSelect from "./ClassSelect";
import Modal from "./Modal";

type Tag = "notes" | "classDoc" | "assignments";
const TAGS: { value: Tag; label: string }[] = [
  { value: "notes", label: "Notes" },
  { value: "classDoc", label: "Class Doc" },
  { value: "assignments", label: "Assignment" },
];

/** The OCR / upload popup. Photos can be combined into one scanned document
 *  (Catalyst reads the handwriting); other files upload as they are. Files
 *  tagged Notes show up in the Notes tab automatically. */
export default function NotesUploadModal({
  uid,
  classes,
  defaultCourseId,
  lockCourse = false,
  onUploaded,
  onClose,
}: {
  uid: string;
  classes: ClassOption[];
  defaultCourseId: string | null;
  lockCourse?: boolean;
  onUploaded: () => void;
  onClose: () => void;
}) {
  const [courseId, setCourseId] = useState(defaultCourseId ?? classes[0]?.id ?? "");
  const [tag, setTag] = useState<Tag>("notes");
  const [files, setFiles] = useState<File[]>([]);
  const [combine, setCombine] = useState(false);
  const [scanName, setScanName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allImages = files.length > 0 && files.every((f) => isImage(f.name));

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
    setFiles(next);
    setError(notes.length ? notes.join(" ") : null);
    // Camera pages are almost always one document; default to combining them.
    if (fromCamera && next.every((f) => isImage(f.name))) setCombine(true);
    if (!next.every((f) => isImage(f.name))) setCombine(false);
  }

  async function upload() {
    if (!courseId) {
      setError("Choose a class for this upload.");
      return;
    }
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (combine) {
        await uploadOcrDocument({
          userId: uid,
          classDocId: courseId,
          files,
          category: tag,
          name: scanName.trim() || `Scanned notes ${new Date().toLocaleDateString()}`,
          pageNames: files.map((f) => f.name),
        });
      } else {
        await Promise.all(files.map((file) => uploadUserResource({ userId: uid, classDocId: courseId, file, category: tag })));
      }
      onUploaded();
    } catch (e) {
      console.error("Upload failed:", e);
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <Modal title="Scan or upload" onClose={onClose} busy={busy}>
        <div className="space-y-4">
          <div>
            <label htmlFor="upload-class" className="mb-1.5 block text-xs font-medium text-text-muted">
              Class
            </label>
            {classes.length === 0 ? (
              <p className="text-sm text-text-muted">Add a class first - uploads are saved to a class.</p>
            ) : (
              <ClassSelect id="upload-class" classes={classes} value={courseId} onChange={setCourseId} disabled={lockCourse || busy} />
            )}
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
              if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
            }}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
              dragging ? "border-primary bg-bg-warm" : "border-border-light"
            }`}
          >
            <UploadCloud size={24} className={dragging ? "text-primary" : "text-text-muted"} />
            <p className="text-xs text-text-muted">Drop photos, PDFs or files here, or</p>
            <div className="flex flex-wrap justify-center gap-2">
              <label className="cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm">
                Browse files
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files) addFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                disabled={busy || files.length >= MAX_FILES_PER_BATCH}
                className="flex items-center gap-1.5 rounded-lg border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm disabled:opacity-40"
              >
                <Camera size={14} /> Use camera
              </button>
            </div>
          </div>

          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-bg-main px-3 py-1.5 text-xs text-text-main">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-text-muted hover:text-text-main">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {allImages && (
            <div className="rounded-xl bg-bg-main p-3">
              <label className="flex items-start gap-2 text-sm text-text-main">
                <input type="checkbox" checked={combine} onChange={(e) => setCombine(e.target.checked)} className="mt-0.5 accent-primary" disabled={busy} />
                <span>
                  Combine into one scanned document
                  <span className="block text-xs text-text-muted">Each photo becomes a page, and Catalyst reads the handwriting (OCR).</span>
                </span>
              </label>
              {combine && (
                <input
                  value={scanName}
                  onChange={(e) => setScanName(e.target.value)}
                  placeholder="Name, e.g. Week 3 lecture notes"
                  aria-label="Scanned document name"
                  maxLength={120}
                  disabled={busy}
                  className="mt-2 w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
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
            {tag !== "notes" && (
              <p className="mt-1.5 text-xs text-text-muted">Only files tagged Notes appear in the Notes tab automatically - you can still add others from the class.</p>
            )}
          </div>

          {error && <p className="text-xs text-alert-error">{error}</p>}

          <button
            type="button"
            onClick={upload}
            disabled={busy || files.length === 0 || !courseId}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-40"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Uploading...
              </>
            ) : (
              `Upload${files.length ? ` ${files.length} file${files.length === 1 ? "" : "s"}` : ""}`
            )}
          </button>
        </div>
      </Modal>
      {cameraOpen && (
        <CameraCaptureModal
          maxPhotos={MAX_FILES_PER_BATCH - files.length}
          onClose={() => setCameraOpen(false)}
          onDone={(captured) => {
            setCameraOpen(false);
            addFiles(captured, true);
          }}
        />
      )}
    </>
  );
}
