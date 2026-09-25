"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import { noteToMarkdown } from "@/src/library/notes/noteText";
import type { ClassOption, Note, Notebook } from "@/src/library/notes/types";
import ClassSelect from "./ClassSelect";
import Modal from "./Modal";

/** Flashcards or a quiz from every note in a notebook. The set is saved to
 *  a class (study sets live per class), defaulting to the class most of the
 *  notebook's notes come from. */
export default function GenerateFromNotebookModal({
  kind,
  notebook,
  notes,
  classes,
  onClose,
}: {
  kind: "flashcards" | "quiz";
  notebook: Notebook;
  notes: Note[];
  classes: ClassOption[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const majorityCourse = useMemo(() => {
    const counts = new Map<string, number>();
    notes.forEach((n) => n.courseId && counts.set(n.courseId, (counts.get(n.courseId) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? classes[0]?.id ?? "";
  }, [notes, classes]);
  const [courseId, setCourseId] = useState(majorityCourse);
  const [questionCount, setQuestionCount] = useState(10);
  const [types, setTypes] = useState({ multipleChoice: true, trueFalse: true, matching: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!user || !courseId) return;
    setBusy(true);
    setError(null);
    try {
      const sources = notes.map((n) =>
        n.kind === "typed" ? { title: n.title, text: noteToMarkdown(n.content) } : { title: n.title, url: n.url, fileType: n.fileType }
      );
      const token = await user.getIdToken();
      const response = await fetch("/api/notebooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind,
          sources,
          questionCount,
          questionTypes: types,
          modelKey: getEffectiveModelKey(kind === "quiz" ? "quiz" : "flashcards"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed.");

      const sourceNotebookKey = `notebook:${notebook.id}`;
      if (kind === "flashcards") {
        const ref = await addDoc(collection(db, "users", user.uid, "enrollment", courseId, "flashcardSets"), {
          name: data.topicName || notebook.name,
          sourceDocKey: sourceNotebookKey,
          sourceNotebookId: notebook.id,
          cards: data.questions,
          pinned: true,
          visibility: "private",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        router.push(`/courses/${courseId}/flashcards?setId=${ref.id}`);
      } else {
        const ref = await addDoc(collection(db, "users", user.uid, "enrollment", courseId, "quizSets"), {
          name: data.topicName || notebook.name,
          sourceDocKey: sourceNotebookKey,
          sourceNotebookId: notebook.id,
          questions: data.questions,
          questionTypes: types,
          questionCount: data.questions.length,
          pinned: true,
          visibility: "private",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        router.push(`/courses/${courseId}/quizzes/${ref.id}?mode=take`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setBusy(false);
    }
  }

  const label = kind === "quiz" ? "quiz" : "flashcards";
  return (
    <Modal title={`Make ${label} from "${notebook.name}"`} onClose={onClose} busy={busy}>
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Uses all {notes.length} note{notes.length === 1 ? "" : "s"} in this notebook.
        </p>
        <div>
          <label htmlFor="gen-class" className="mb-1.5 block text-xs font-medium text-text-muted">
            Save to class
          </label>
          {classes.length ? (
            <ClassSelect id="gen-class" classes={classes} value={courseId} onChange={setCourseId} disabled={busy} />
          ) : (
            <p className="text-sm text-text-muted">Add a class first - study sets are saved to a class.</p>
          )}
        </div>
        {kind === "quiz" && (
          <>
            <div>
              <label htmlFor="gen-count" className="mb-1.5 flex justify-between text-xs font-medium text-text-muted">
                Questions <span className="tabular-nums text-text-main">{questionCount}</span>
              </label>
              <input id="gen-count" type="range" min={5} max={20} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="w-full accent-primary" disabled={busy} />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-medium text-text-muted">Question types</legend>
              {(
                [
                  ["multipleChoice", "Multiple choice"],
                  ["trueFalse", "True / false"],
                  ["matching", "Matching"],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-text-main">
                  <input type="checkbox" checked={types[key]} onChange={(e) => setTypes({ ...types, [key]: e.target.checked })} className="accent-primary" disabled={busy} />
                  {text}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {error && <p className="text-xs text-alert-error">{error}</p>}
        <button
          type="button"
          onClick={generate}
          disabled={busy || !courseId || notes.length === 0 || (kind === "quiz" && !types.multipleChoice && !types.trueFalse && !types.matching)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-40"
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Generating - this can take a minute
            </>
          ) : (
            `Make ${label}`
          )}
        </button>
      </div>
    </Modal>
  );
}
