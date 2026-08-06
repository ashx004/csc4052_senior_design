"use client";

import { useState } from "react";
import { FileText, X, Loader2 } from "lucide-react";

interface QuestionTypes {
  multipleChoice: boolean;
  trueFalse: boolean;
  matching: boolean;
}

interface QuizSetupModalProps {
  open: boolean;
  onClose: () => void;
  documentName: string;
  onStart: (config: { questionCount: number; questionTypes: QuestionTypes }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        disabled ? "bg-border-light cursor-not-allowed" : checked ? "bg-[#1a1a2e]" : "bg-border-hover"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function QuizSetupModal({
  open,
  onClose,
  documentName,
  onStart,
  loading = false,
  error = null,
}: QuizSetupModalProps) {
  const [questionCount, setQuestionCount] = useState(10);
  const [trueFalse, setTrueFalse] = useState(false);
  const [multipleChoice, setMultipleChoice] = useState(true);
  const [matching, setMatching] = useState(false);

  if (!open) return null;

  const isCountValid = questionCount >= 1 && questionCount <= 20;
  const hasTypeSelected = trueFalse || multipleChoice || matching;
  const canStart = isCountValid && hasTypeSelected && !loading;

  const handleStart = () => {
    if (!canStart) return;
    void onStart({
      questionCount,
      questionTypes: { multipleChoice, trueFalse, matching },
    });
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
        <p className="text-xs text-text-muted mb-5">Set up your test</p>

        {/* Question count */}
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-text-main mb-8">
            Questions (max 20)
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            disabled={loading}
            className="w-15 rounded-lg border border-border-light px-4 py-2 text-sm focus:border-[#8B6914] focus:outline-none disabled:opacity-50"
          />
        </div>
        {!isCountValid && (
            <p className="mt-1 text-xs text-red-400">Enter a number between 1 and 20.</p>
          )}

        {/* Question types */}
        <div className="flex flex-col gap-3 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-main">True/False</span>
            <ToggleSwitch checked={trueFalse} onChange={setTrueFalse} disabled={loading} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-main">Multiple choice</span>
            <ToggleSwitch checked={multipleChoice} onChange={setMultipleChoice} disabled={loading} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-main">Matching</span>
            <ToggleSwitch checked={matching} onChange={setMatching} disabled={loading} />
          </div>
        </div>

        {!hasTypeSelected && (
          <p className="mt-2 text-xs text-red-400">Select at least one question type.</p>
        )}

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        <div className="flex justify-end mt-6">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="flex items-center gap-2 rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a2a3e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating your quiz...
              </>
            ) : (
              "Start test"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
