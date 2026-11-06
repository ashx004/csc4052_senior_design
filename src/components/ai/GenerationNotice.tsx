import { Loader2 } from "lucide-react";

// One plain sentence shown while the AI writes something the student is
// waiting on (quiz, flashcards, practice, a study set). Says what is happening
// and roughly how long it takes, so a wait reads as progress, not a hang.
export function GenerationNotice({ text }: { text: string }) {
  return (
    <p role="status" aria-live="polite" className="mt-3 flex items-start gap-2 text-sm text-text-muted">
      <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

export const GENERATION_TEXT = {
  quiz: "Reading your sources and writing your questions. This usually takes 10 to 20 seconds.",
  flashcards: "Reading your sources and writing the cards. This usually takes 10 to 20 seconds.",
  practice: "Writing practice items from your sources. This usually takes 15 to 30 seconds.",
  customSet: "Reading your files and writing the set. Larger files can take a minute or two.",
  notebook: "Reading the selected notes and writing the set. This usually takes under a minute.",
} as const;
