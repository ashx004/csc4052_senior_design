"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, FileText, Search, X } from "lucide-react";

export interface StudySource {
  id: string;
  name: string;
  fileType: string;
}

interface StudySourcePickerProps {
  open: boolean;
  kind: "quiz" | "flashcard";
  resources: StudySource[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function StudySourcePicker({ open, kind, resources, onClose, onSelect }: StudySourcePickerProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const filtered = resources.filter((resource) => resource.name.toLowerCase().includes(search.toLowerCase()));
  const title = kind === "quiz" ? "Choose a source for your quiz" : "Choose a source for your flashcards";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="study-source-title" className="flex max-h-[min(760px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-border-light bg-bg-container shadow-2xl">
        <div className="flex items-start justify-between gap-5 border-b border-border-light px-6 py-6 sm:px-8">
          <div>
            <p className="mb-2 text-sm font-medium text-text-muted">{kind === "quiz" ? "Make a quiz" : "Make flashcards"}</p>
            <h2 id="study-source-title" className="text-2xl font-bold tracking-tight text-text-main">{title}</h2>
            <p className="mt-2 text-sm text-text-muted">Pick a document, then set up your study session.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close source picker" className="rounded-full p-2 text-text-muted hover:bg-bg-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><X size={20} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 py-5 sm:px-8">
          <label className="relative block">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <span className="sr-only">Search documents</span>
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your documents" className="w-full rounded-xl border border-border-light bg-bg-main py-3 pl-11 pr-4 text-sm text-text-main outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          {resources.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Image src="/illustrations/study/quiz-reader.png" alt="" width={130} height={130} className="mb-4 h-28 w-28 object-contain" />
              <p className="font-semibold text-text-main">No documents in this course yet</p>
              <p className="mt-1 max-w-xs text-sm text-text-muted">Upload a document in your course resources, then come back to create a set.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">No documents match “{search}”.</p>
          ) : (
            <div className="mt-5 space-y-2">
              {filtered.map((resource) => (
                <button key={resource.id} type="button" onClick={() => onSelect(resource.id)} className="group flex w-full items-center gap-4 rounded-2xl border border-border-light bg-bg-container px-4 py-4 text-left transition-colors hover:border-primary hover:bg-bg-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg-warm text-text-main"><FileText size={22} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-text-main">{resource.name}</span><span className="mt-0.5 block text-xs text-text-muted">{resource.fileType?.toUpperCase() || "DOCUMENT"}</span></span>
                  <ArrowRight size={18} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-text-main" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
