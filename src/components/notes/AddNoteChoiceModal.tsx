"use client";

import { NotebookPen, ScanText } from "lucide-react";
import Modal from "./Modal";

/** First step of the + button: scan/upload a document, or type a note. */
export default function AddNoteChoiceModal({
  onChoose,
  onClose,
}: {
  onChoose: (choice: "ocr" | "typed") => void;
  onClose: () => void;
}) {
  const option = (choice: "ocr" | "typed", icon: React.ReactNode, title: string, body: string) => (
    <button
      type="button"
      onClick={() => onChoose(choice)}
      className="flex w-full items-start gap-3 rounded-xl border border-border-light p-4 text-left transition-colors hover:border-primary hover:bg-bg-warm"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg-warm text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-text-main">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{body}</span>
      </span>
    </button>
  );
  return (
    <Modal title="Add notes" onClose={onClose}>
      <div className="space-y-3">
        {option("ocr", <ScanText size={20} />, "Scan or upload (OCR)", "Photograph handwritten notes or upload files. Catalyst reads the text so you can search and study from it.")}
        {option("typed", <NotebookPen size={20} />, "Custom note", "Start a blank page with headings, bold, italics, drawing and highlighting.")}
      </div>
    </Modal>
  );
}
