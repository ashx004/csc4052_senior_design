"use client";

import { Notebook, Upload, UploadCloud, FileText } from "lucide-react";
import { useSetPageContext } from "@/src/context/AIPageContext";

export default function Notes() {
  useSetPageContext(
    {
      page: "notes",
      label: "Notes",
      summary:
        "The student is viewing their Notes page, where they can upload documents to be scanned in and review documents they've previously scanned. These documents are handwritten notes that an OCR model will scan and transcribe to plain text that can be viewed and stored.",
    },
    []
  );

  return (
    <section className="min-h-screen bg-bg-main px-8 py-8 text-text-main">
      <div className="mx-auto max-w-7xl">
        {/* ── Page header ── */}
        <header className="mb-7 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 mt-9 flex items-center gap-2 text-xs text-text-muted">
              <Notebook size={15} strokeWidth={1.8} />
              <span>Dashboard</span>
              <span>/</span>
              <span className="font-medium text-text-main">Notes</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-main">
              Notes
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-text-muted">
              Upload documents to have them scanned in, and come back here to
              review everything you've already scanned.
            </p>
          </div>
        </header>

        {/* ── Upload area ── */}
        <div className="rounded-3xl border-2 border-dashed border-border-hover bg-bg-container p-10 shadow-sm">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-warm">
              <UploadCloud size={28} strokeWidth={1.8} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-text-main">
              Upload a document
            </h2>
            <p className="mt-1 max-w-md text-sm text-text-muted">
              Drop a picture of your handwritten notes to have it scanned in. Once it's processed, it'll show up in your document list below.
            </p>
            <button
              type="button"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover"
            >
              <Upload size={16} strokeWidth={2} />
              Browse files
            </button>
          </div>
        </div>

        {/* ── Previously scanned documents ── */}
        <div className="mt-8 rounded-3xl border border-border-light bg-bg-container p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border-light pb-4">
            <div>
              <h2 className="text-xl font-semibold text-text-main">
                Your documents
              </h2>
              <p className="mt-0.5 text-sm text-text-muted">
                Documents you've had scanned in will show up here.
              </p>
            </div>
            <span className="rounded-full bg-bg-warm px-3 py-1 text-xs font-medium text-text-muted">
              0 documents
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-warm">
              <FileText size={24} strokeWidth={1.8} className="text-text-muted" />
            </div>
            <p className="font-medium text-text-main">No documents yet</p>
            <p className="mt-1 max-w-sm text-sm text-text-muted">
              Upload a document above to have it scanned in — it'll appear
              here so you can review it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
