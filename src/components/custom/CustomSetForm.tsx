"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import { MAX_FILE_SIZE_BYTES } from "@/src/components/resourceManagement/fileUploadService";
import { SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentTypes";
import { QUIZ_DIFFICULTY_OPTIONS, DEFAULT_QUIZ_DIFFICULTY, type QuizDifficulty } from "@/src/library/quizDifficulty";
import {
  CUSTOM_TYPES,
  MAX_CUSTOM_FILES,
  MAX_CUSTOM_ITEMS,
  MAX_PROMPT_CHARS,
  MIN_MATERIAL_CHARS,
  customFilePrefix,
  type CustomType,
} from "@/src/library/custom/customRequest";
import { KIND_LABELS, PRACTICE_KINDS, type PracticeKind } from "@/src/library/practice/types";

const TYPE_LABELS: Record<CustomType, { title: string; noun: string; blurb: string }> = {
  quiz: { title: "Quiz", noun: "questions", blurb: "Multiple choice, true/false and matching questions." },
  flashcards: { title: "Flashcards", noun: "cards", blurb: "A deck to flip through and memorize." },
  practice: { title: "Practice exam", noun: "questions", blurb: "Fill in the blank, word problems or drag and drop." },
};

const DEFAULT_COUNTS: Record<CustomType, number> = { quiz: 10, flashcards: 20, practice: 8 };
const ACCEPT = SUPPORTED_DOCUMENT_TYPES.map((type) => `.${type}`).join(",");

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "file";
}

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * A one-off quiz, flashcard deck or practice exam from the student's own prompt
 * and files, with no class involved. Files go to the student's personal storage
 * (users/{uid}/custom/), then the server builds the set and saves it to their
 * account.
 */
export default function CustomSetForm({ initialType }: { initialType: CustomType }) {
  const router = useRouter();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<CustomType>(initialType);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [counts, setCounts] = useState<Record<CustomType, number>>(DEFAULT_COUNTS);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(DEFAULT_QUIZ_DIFFICULTY);
  const [questionTypes, setQuestionTypes] = useState({ multipleChoice: true, trueFalse: true, matching: false });
  const [practiceKind, setPracticeKind] = useState<PracticeKind>("fill_blank");
  const [busy, setBusy] = useState<"idle" | "uploading" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);

  const enoughMaterial = files.length > 0 || prompt.trim().length >= MIN_MATERIAL_CHARS;
  const typeChosen = type !== "quiz" || questionTypes.multipleChoice || questionTypes.trueFalse || questionTypes.matching;
  const canSubmit = !!user && busy === "idle" && enoughMaterial && typeChosen;

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    const problems: string[] = [];
    const next = [...files];
    for (const file of picked) {
      if (!SUPPORTED_DOCUMENT_TYPES.includes(extensionOf(file.name))) problems.push(`"${file.name}" isn't a type that can be read yet.`);
      else if (file.size > MAX_FILE_SIZE_BYTES) problems.push(`"${file.name}" is over 20MB.`);
      else if (next.length >= MAX_CUSTOM_FILES) problems.push(`Only ${MAX_CUSTOM_FILES} files fit in one set.`);
      else if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    }
    setFiles(next);
    setError(problems.length ? problems.join(" ") : null);
  }

  async function submit() {
    if (!user || !canSubmit) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      setBusy("uploading");
      const stamp = Date.now();
      const uploaded: { name: string; url: string; fileType: string }[] = [];
      for (const [index, file] of files.entries()) {
        const storagePath = `${customFilePrefix(user.uid)}${stamp}-${index}-${safeName(file.name)}`;
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream", "x-storage-path": storagePath, Authorization: `Bearer ${token}` },
          body: await file.arrayBuffer(),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Couldn't upload "${file.name}".`);
        }
        uploaded.push({ name: file.name, url: `/api/download?key=${encodeURIComponent(storagePath)}`, fileType: extensionOf(file.name) });
      }

      setBusy("generating");
      const response = await fetch("/api/generate-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type,
          prompt: prompt.trim(),
          files: uploaded,
          count: counts[type],
          difficulty,
          questionTypes,
          practiceKind,
          modelKey: getEffectiveModelKey(type === "quiz" ? "quiz" : type === "flashcards" ? "flashcards" : "quiz"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Generation failed. Please try again.");
      router.push(`/custom/${data.setId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy("idle");
    }
  }

  const max = MAX_CUSTOM_ITEMS[type];
  const label = TYPE_LABELS[type];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-text-main">Custom study material</h1>
      <p className="mt-1 text-sm text-text-muted">
        Write what you want to study and/or add files. Nothing here is tied to a class.
      </p>

      <div role="tablist" aria-label="What to make" className="mt-6 grid grid-cols-3 gap-1 rounded-xl border border-border-light bg-bg-warm p-1">
        {CUSTOM_TYPES.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={type === option}
            onClick={() => setType(option)}
            disabled={busy !== "idle"}
            className={`rounded-lg px-2 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              type === option ? "bg-bg-container text-text-main shadow-sm" : "text-text-muted hover:text-text-main"
            }`}
          >
            {TYPE_LABELS[option].title}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-muted">{label.blurb}</p>

      <div className="mt-6">
        <label htmlFor="custom-prompt" className="mb-1.5 flex justify-between text-sm font-medium text-text-main">
          Your prompt
          <span className="text-xs font-normal tabular-nums text-text-muted">
            {prompt.length.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}
          </span>
        </label>
        <textarea
          id="custom-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={MAX_PROMPT_CHARS}
          rows={9}
          disabled={busy !== "idle"}
          placeholder="Paste notes, describe the topics to cover, or say how you want to be tested (e.g. 'focus on chapters 3 and 4, mostly application questions')."
          className="w-full resize-y rounded-xl border border-border-light bg-bg-container p-3 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">
          With files, this tells the AI what to focus on. Without files, write at least {MIN_MATERIAL_CHARS} characters of notes or detail: the
          questions are checked against what you give, so they can&apos;t come from nothing.
        </p>
      </div>

      <div className="mt-6">
        <span className="mb-1.5 block text-sm font-medium text-text-main">Files (optional)</span>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} onChange={addFiles} className="hidden" aria-label="Add files" />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== "idle" || files.length >= MAX_CUSTOM_FILES}
          className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main hover:bg-bg-warm disabled:opacity-50"
        >
          <Paperclip size={15} /> Add files
        </button>
        <span className="ml-2 text-xs text-text-muted">
          PDF, Word, Excel, text, code or images &middot; up to {MAX_CUSTOM_FILES} files, 20MB each
        </span>
        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm">
                <FileText size={15} className="shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-text-main">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((f) => f !== file))}
                  disabled={busy !== "idle"}
                  aria-label={`Remove ${file.name}`}
                  className="rounded p-1 text-text-muted hover:text-text-main disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="custom-count" className="mb-1.5 flex justify-between text-sm font-medium text-text-main">
            How many {label.noun}
            <span className="tabular-nums text-text-muted">{counts[type]}</span>
          </label>
          <input
            id="custom-count"
            type="range"
            min={type === "flashcards" ? 5 : 1}
            max={max}
            value={counts[type]}
            onChange={(e) => setCounts({ ...counts, [type]: Number(e.target.value) })}
            disabled={busy !== "idle"}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label htmlFor="custom-level" className="mb-1.5 block text-sm font-medium text-text-main">
            Level
          </label>
          <select
            id="custom-level"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
            disabled={busy !== "idle" || type === "flashcards"}
            className="w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main disabled:opacity-50"
          >
            {QUIZ_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.subtitle}
              </option>
            ))}
          </select>
        </div>
      </div>

      {type === "quiz" && (
        <fieldset className="mt-5 space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium text-text-main">Question types</legend>
          {(
            [
              ["multipleChoice", "Multiple choice"],
              ["trueFalse", "True / false"],
              ["matching", "Matching"],
            ] as const
          ).map(([key, text]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-text-main">
              <input
                type="checkbox"
                checked={questionTypes[key]}
                onChange={(e) => setQuestionTypes({ ...questionTypes, [key]: e.target.checked })}
                disabled={busy !== "idle"}
                className="accent-primary"
              />
              {text}
            </label>
          ))}
        </fieldset>
      )}

      {type === "practice" && (
        <fieldset className="mt-5 space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium text-text-main">Kind of practice</legend>
          {PRACTICE_KINDS.map((kind) => (
            <label key={kind} className="flex items-start gap-2 text-sm text-text-main">
              <input
                type="radio"
                name="practice-kind"
                checked={practiceKind === kind}
                onChange={() => setPracticeKind(kind)}
                disabled={busy !== "idle"}
                className="mt-1 accent-primary"
              />
              <span>
                {KIND_LABELS[kind].title}
                <span className="block text-xs text-text-muted">{KIND_LABELS[kind].description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-alert-error bg-alert-error-bg p-3 text-sm text-alert-error">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "idle" ? (
          `Make ${label.title.toLowerCase()}`
        ) : (
          <>
            <Loader2 size={16} className="animate-spin" />
            {busy === "uploading" ? "Uploading files..." : "Generating - this can take a minute"}
          </>
        )}
      </button>
      {!enoughMaterial && busy === "idle" && (
        <p className="mt-2 text-center text-xs text-text-muted">Add a file or write at least {MIN_MATERIAL_CHARS} characters to continue.</p>
      )}
    </div>
  );
}
