"use client";

import { X } from "lucide-react";
import type { ActivityTarget } from "@/src/library/studyPlan/types";

interface DocumentPickerModalProps {
  open: boolean;
  courseId: string;
  resources: Array<{ id: string; name: string; sourceDocKey: string }>;
  onSelect(target: Extract<ActivityTarget, { kind: "document" }>): void;
  onClose(): void;
}

export default function DocumentPickerModal({
  open,
  courseId,
  resources,
  onSelect,
  onClose,
}: DocumentPickerModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-picker-title"
        data-course-id={courseId}
        className="w-full max-w-md rounded-2xl bg-bg-container p-6 shadow-xl ring-1 ring-border-light"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="document-picker-title" className="text-lg font-semibold text-text-main">
            Choose a document
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:text-text-main"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-text-muted">
          Pick the document this reading task should open.
        </p>
        {resources.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            No documents are available for this class.
          </p>
        ) : (
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {resources.map((resource) => (
              <li key={resource.id}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      kind: "document",
                      resourceId: resource.id,
                      sourceDocKey: resource.sourceDocKey,
                    })
                  }
                  className="w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-text-main ring-1 ring-border-light hover:bg-black/5"
                >
                  {resource.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
