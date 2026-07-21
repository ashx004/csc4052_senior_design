"use client";

import { useState } from "react";
import { X, UploadCloud, Loader2 } from "lucide-react";
import { uploadUserResource } from "@/src/components/resourceManagement/fileUploadService";
import type { ChatClass } from "@/src/library/chatContext";

type Category = "classDoc" | "notes" | "assignments";

const CATEGORY_LABELS: Record<Category, string> = {
  classDoc: "Class Doc",
  notes: "Notes",
  assignments: "Assignments",
};

interface ChatUploadModalProps {
  userId: string;
  classes: ChatClass[];
  onClose: () => void;
  onUploaded: (fileNames: string[], classCode: string) => void;
}

export default function ChatUploadModal({ userId, classes, onClose, onUploaded }: ChatUploadModalProps) {
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.classId ?? "");
  const [category, setCategory] = useState<Category>("classDoc");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!selectedClassId || selectedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      await Promise.all(
        selectedFiles.map((file) =>
          uploadUserResource({ userId, classDocId: selectedClassId, file, category })
        )
      );

      const classCode = classes.find((c) => c.classId === selectedClassId)?.classCode ?? "your class";
      onUploaded(selectedFiles.map((f) => f.name), classCode);
    } catch (err) {
      console.error("Chat upload failed:", err);
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !isUploading && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-main">Upload to a class</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="text-text-muted hover:text-text-main"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {classes.length === 0 ? (
          <p className="text-sm text-text-muted">
            You&apos;re not enrolled in any classes yet — add one from the Classes page first.
          </p>
        ) : (
          <>
            <label className="mb-1 block text-xs font-medium text-text-muted">Class</label>
            <select
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              disabled={isUploading}
              className="mb-4 w-full rounded-md border border-border-light bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
            >
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.classCode} — {c.className}
                </option>
              ))}
            </select>

            <label className="mb-2 block text-xs font-medium text-text-muted">Tag</label>
            <div className="mb-4 flex gap-2">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  disabled={isUploading}
                  className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                    category === cat
                      ? "border-primary bg-bg-warm text-primary"
                      : "border-border-light text-text-muted hover:border-border-hover"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs font-medium text-text-muted">File(s)</label>
            <div className="mb-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-light bg-bg-container p-6 text-center">
              <UploadCloud size={22} className="text-text-muted" />
              <p className="truncate text-xs text-text-muted">
                {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : "No files chosen"}
              </p>
              <label className="cursor-pointer text-xs font-medium text-primary underline">
                Browse files
                <input
                  type="file"
                  multiple
                  disabled={isUploading}
                  onChange={(event) => {
                    if (event.target.files) setSelectedFiles(Array.from(event.target.files));
                    setError(null);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {error && <p className="mb-2 text-xs text-alert-error">{error}</p>}

            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || selectedFiles.length === 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isUploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Uploading...
                </>
              ) : (
                "Upload"
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
