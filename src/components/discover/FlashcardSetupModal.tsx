"use client";

import { FileText, X, Loader2 } from "lucide-react";
import VisibilitySelector from "@/src/components/discover/VisibilitySelector";
import { useState } from "react";
import type { StudySetVisibility } from "@/src/library/discover/types";

interface FlashcardSetupModalProps {
  open: boolean;
  onClose: () => void;
  documentName: string;
  onGenerate: (visibility: StudySetVisibility) => void;
  loading?: boolean;
}

export default function FlashcardSetupModal({
  open,
  onClose,
  documentName,
  onGenerate,
  loading = false,
}: FlashcardSetupModalProps) {
  const [visibility, setVisibility] = useState<StudySetVisibility>("public");

  if (!open) return null;

  const handleGenerate = () => {
    if (loading) return;
    onGenerate(visibility);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-bg-container p-7 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={18} className="shrink-0 text-[#8B6914]" />
            <h2 className="truncate text-base font-bold text-[#1a1a2e]">{documentName}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-bg-warm transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-5">Generate flashcards from this document</p>

        <VisibilitySelector value={visibility} onChange={setVisibility} disabled={loading} />

        <div className="flex justify-end mt-6">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a2a3e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              "Generate"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
