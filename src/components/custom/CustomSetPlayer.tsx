"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Play, Trash2, Trophy } from "lucide-react";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import FlashCard from "@/src/components/learning/FlashCard";
import QuestionCard from "@/src/components/quizzes/QuestionCard";
import MatchingQuestionGroup from "@/src/components/quizzes/MatchingQuestionGroup";
import QuizResults from "@/src/components/quizzes/QuizResults";
import FillBlankRunner from "@/src/components/practice/FillBlankRunner";
import WordProblemRunner from "@/src/components/practice/WordProblemRunner";
import DragDropRunner from "@/src/components/practice/DragDropRunner";
import PracticeResults from "@/src/components/practice/PracticeResults";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/src/components/practice/PracticeShell";
import { totalScore } from "@/src/library/practice/grading";
import { formatClock } from "@/src/library/practice/dragDrop";
import {
  DIFFICULTY_LABELS,
  KIND_LABELS,
  type DragDropItem,
  type FillBlankItem,
  type ItemResult,
  type PracticeItem,
  type PracticeKind,
  type WordProblemItem,
} from "@/src/library/practice/types";
import { answerableQuestions, groupQuizQuestions, scoreQuiz, type CustomQuizQuestion } from "@/src/library/custom/quizItems";
import type { CustomType } from "@/src/library/custom/customRequest";

interface Card {
  question: string;
  answer: string;
}

interface LoadedSet {
  type: CustomType;
  name: string;
  difficulty: keyof typeof DIFFICULTY_LABELS;
  sourceNames: string[];
  bestPercent: number | null;
  attempts: number;
  cards: Card[];
  questions: CustomQuizQuestion[];
  practiceKind: PracticeKind;
  items: PracticeItem[];
}

interface PastAttempt {
  id: string;
  percent: number;
  completedAt: Timestamp | null;
}

const TYPE_TITLE: Record<CustomType, string> = { quiz: "Quiz", flashcards: "Flashcards", practice: "Practice exam" };

function formatDate(ts: Timestamp | null): string {
  return ts ? ts.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

/** Firestore rejects undefined fields, so only keep what is set. */
function storable(result: ItemResult): ItemResult {
  return { itemId: result.itemId, score: result.score, response: result.response ?? null, ...(result.seconds !== undefined ? { seconds: result.seconds } : {}) };
}

export default function CustomSetPlayer({ setId }: { setId: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [set, setSet] = useState<LoadedSet | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [attempts, setAttempts] = useState<PastAttempt[]>([]);
  const [deleting, setDeleting] = useState(false);
  // The best score so far, kept in a ref so recording a run doesn't depend on render state.
  const bestRef = useRef(0);

  const setRef = useCallback(() => doc(db, "users", user!.uid, "customSets", setId), [user, setId]);

  const loadAttempts = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDocs(query(collection(setRef(), "attempts"), orderBy("completedAt", "desc")));
      setAttempts(snap.docs.map((d) => ({ id: d.id, percent: Number(d.data().percent ?? 0), completedAt: (d.data().completedAt as Timestamp) ?? null })));
    } catch (error) {
      console.error("Error loading attempts:", error);
      setAttempts([]);
    }
  }, [user, setRef]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(setRef());
        if (cancelled) return;
        if (!snap.exists()) return setStatus("missing");
        const data = snap.data();
        const type = (["quiz", "flashcards", "practice"].includes(data.type) ? data.type : "quiz") as CustomType;
        setSet({
          type,
          name: String(data.name ?? "Custom set"),
          difficulty: (data.difficulty in DIFFICULTY_LABELS ? data.difficulty : "exam") as LoadedSet["difficulty"],
          sourceNames: Array.isArray(data.sourceNames) ? data.sourceNames.map(String) : [],
          bestPercent: typeof data.bestPercent === "number" ? data.bestPercent : null,
          attempts: Number(data.attempts ?? 0),
          cards: Array.isArray(data.cards) ? (data.cards as Card[]) : [],
          questions: Array.isArray(data.questions) ? (data.questions as CustomQuizQuestion[]) : [],
          practiceKind: (data.kind as PracticeKind) ?? "fill_blank",
          items: Array.isArray(data.items) ? (data.items as PracticeItem[]) : [],
        });
        bestRef.current = typeof data.bestPercent === "number" ? data.bestPercent : 0;
        setStatus("ready");
        void loadAttempts();
      } catch (error) {
        console.error("Error loading custom set:", error);
        if (!cancelled) setStatus("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router, setRef, loadAttempts]);

  // Records a finished run on the set; a failure never loses the on-screen result.
  const recordAttempt = useCallback(
    async (payload: Record<string, unknown>, percent: number) => {
      if (!user) return;
      try {
        await addDoc(collection(setRef(), "attempts"), { ...payload, percent, completedAt: serverTimestamp() });
        const best = Math.max(bestRef.current, percent);
        bestRef.current = best;
        await updateDoc(setRef(), { attempts: increment(1), bestPercent: best, lastPlayedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        setSet((current) => (current ? { ...current, bestPercent: best, attempts: current.attempts + 1 } : current));
        void loadAttempts();
      } catch (error) {
        console.error("Error saving attempt:", error);
      }
    },
    [user, setRef, loadAttempts]
  );

  async function remove() {
    if (!user || deleting || !window.confirm("Delete this set? This can't be undone.")) return;
    setDeleting(true);
    try {
      const old = await getDocs(collection(setRef(), "attempts"));
      await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(setRef());
      router.push("/learning");
    } catch (error) {
      console.error("Error deleting custom set:", error);
      setDeleting(false);
    }
  }

  if (authLoading || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }
  if (status === "missing" || !set) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-main px-6 text-center">
        <p className="text-lg font-semibold text-text-main">This set couldn&apos;t be found.</p>
        <button onClick={() => router.push("/learning")} className={PRIMARY_BUTTON}>
          Back to Learning
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main">
      <header className="flex items-center gap-3 border-b border-border-light px-4 py-4 sm:px-10">
        <button onClick={() => router.push("/learning")} className="rounded-md p-1.5 transition-colors hover:bg-bg-warm" aria-label="Back to Learning">
          <ArrowLeft size={20} className="text-text-main" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-text-main">{set.name}</h1>
          <p className="truncate text-xs text-text-muted">
            Custom {TYPE_TITLE[set.type].toLowerCase()}
            {set.type === "practice" ? ` · ${KIND_LABELS[set.practiceKind].title}` : ""}
            {set.type !== "flashcards" ? ` · ${DIFFICULTY_LABELS[set.difficulty]}` : ""}
            {set.sourceNames.length ? ` · from ${set.sourceNames.join(", ")}` : ""}
          </p>
        </div>
        <button onClick={() => void remove()} disabled={deleting} aria-label="Delete this set" className="rounded-md p-2 text-text-muted transition-colors hover:bg-bg-warm hover:text-alert-error disabled:opacity-50">
          <Trash2 size={17} />
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
        {set.type === "flashcards" && <FlashcardDeck cards={set.cards} />}
        {set.type === "quiz" && <QuizTaker set={set} attempts={attempts} onFinish={recordAttempt} />}
        {set.type === "practice" && <PracticeTaker set={set} setId={setId} attempts={attempts} onFinish={recordAttempt} />}
      </div>
    </div>
  );
}

function FlashcardDeck({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  if (cards.length === 0) return <p className="text-center text-sm text-text-muted">This deck has no cards.</p>;
  const card = cards[Math.min(index, cards.length - 1)];
  return (
    <div className="space-y-6">
      <p className="text-center text-sm text-text-muted" aria-live="polite">
        Card {index + 1} of {cards.length}
      </p>
      {/* Keyed so each card starts face-up. */}
      <FlashCard key={index} question={card.question} answer={card.answer} />
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className={SECONDARY_BUTTON}>
          <ChevronLeft size={16} /> Previous
        </button>
        <button type="button" onClick={() => setIndex((i) => Math.min(cards.length - 1, i + 1))} disabled={index >= cards.length - 1} className={PRIMARY_BUTTON}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Landing({ noun, count, set, attempts, onStart }: { noun: string; count: number; set: LoadedSet; attempts: PastAttempt[]; onStart: () => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border-light bg-bg-container p-6 text-center shadow-sm">
        <p className="text-2xl font-bold text-text-main">
          {count} {noun}
        </p>
        {set.bestPercent !== null && (
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-text-muted">
            <Trophy size={14} className="text-amber-500" /> Best: {set.bestPercent}%
          </p>
        )}
        <button type="button" onClick={onStart} className={`${PRIMARY_BUTTON} mt-5`}>
          <Play size={15} /> {attempts.length ? "Try again" : "Start"}
        </button>
      </div>
      {attempts.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-text-main">Your tries</h2>
          <ul className="divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-bg-container">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-12 text-sm font-bold tabular-nums text-text-main">{attempt.percent}%</span>
                <span className="text-xs text-text-muted">{formatDate(attempt.completedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QuizTaker({ set, attempts, onFinish }: { set: LoadedSet; attempts: PastAttempt[]; onFinish: (payload: Record<string, unknown>, percent: number) => Promise<void> }) {
  const [mode, setMode] = useState<"landing" | "taking" | "results">("landing");
  const [run, setRun] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const questions = answerableQuestions(set.questions);
  const items = groupQuizQuestions(questions);
  const answered = questions.filter((q) => answers[q.id]).length;
  const result = scoreQuiz(questions, answers);

  if (mode === "landing") {
    return (
      <Landing
        noun="questions"
        count={questions.length}
        set={set}
        attempts={attempts}
        onStart={() => {
          setAnswers({});
          setRun((r) => r + 1);
          setMode("taking");
        }}
      />
    );
  }

  const select = (id: string, answer: string) => {
    if (mode === "taking") setAnswers((current) => ({ ...current, [id]: answer }));
  };

  return (
    <div>
      {mode === "results" && (
        <div className="mb-4 space-y-3">
          <QuizResults score={result.score} total={result.total} />
          <div className="flex justify-center gap-3">
            <button type="button" className={PRIMARY_BUTTON} onClick={() => { setAnswers({}); setRun((r) => r + 1); setMode("taking"); }}>
              Try again
            </button>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => setMode("landing")}>
              Back to this set
            </button>
          </div>
        </div>
      )}
      <div key={run} className="flex flex-col gap-4">
        {items.map((item, index) =>
          item.kind === "standard" ? (
            <QuestionCard
              key={item.question.id}
              question={{ ...item.question, type: item.question.type as "multiple_choice" | "true_false" }}
              questionNumber={index + 1}
              selectedAnswer={answers[item.question.id]}
              onSelect={(answer) => select(item.question.id, answer)}
              mode={mode === "results" ? "results" : "taking"}
            />
          ) : (
            <MatchingQuestionGroup key={item.groupId} questions={item.questions} answers={answers} onSelect={select} mode={mode === "results" ? "results" : "taking"} />
          )
        )}
      </div>
      {mode === "taking" && (
        <div className="mt-8 flex flex-col items-end gap-2 pb-10">
          <p className="text-xs text-text-muted">
            {answered} of {questions.length} answered
          </p>
          <button
            type="button"
            disabled={answered < questions.length}
            onClick={() => {
              setMode("results");
              window.scrollTo({ top: 0 });
              void onFinish({ score: result.score, total: result.total, answers }, result.percent);
            }}
            className="rounded-xl bg-[#1a1a2e] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a3e] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

type PracticeView = { name: "landing" } | { name: "playing"; run: number } | { name: "results"; results: ItemResult[]; durationMs: number; points?: number };

function PracticeTaker({ set, setId, attempts, onFinish }: { set: LoadedSet; setId: string; attempts: PastAttempt[]; onFinish: (payload: Record<string, unknown>, percent: number) => Promise<void> }) {
  const [view, setView] = useState<PracticeView>({ name: "landing" });
  const startedAt = useRef(0);
  const start = () => {
    startedAt.current = Date.now();
    setView({ name: "playing", run: Date.now() });
  };

  const finish = (results: (ItemResult & { points?: number })[]) => {
    const { score, total, percent } = totalScore(results);
    const durationMs = Date.now() - startedAt.current;
    const points = set.practiceKind === "drag_drop" ? results.reduce((sum, r) => sum + (r.points ?? 0), 0) : undefined;
    setView({ name: "results", results: results.map(storable), durationMs, points });
    void onFinish({ score, total, durationMs, points: points ?? null, results: results.map(storable) }, percent);
  };

  if (view.name === "landing") {
    return <Landing noun={set.practiceKind === "drag_drop" ? "rounds" : set.practiceKind === "word_problem" ? "problems" : "questions"} count={set.items.length} set={set} attempts={attempts} onStart={start} />;
  }
  if (view.name === "playing") {
    return set.practiceKind === "fill_blank" ? (
      <FillBlankRunner key={view.run} items={set.items as FillBlankItem[]} onFinish={finish} />
    ) : set.practiceKind === "word_problem" ? (
      <WordProblemRunner key={view.run} courseId={null} setId={setId} items={set.items as WordProblemItem[]} onFinish={finish} />
    ) : (
      <DragDropRunner key={view.run} items={set.items as DragDropItem[]} onFinish={finish} />
    );
  }
  return (
    <div className="space-y-4">
      <PracticeResults kind={set.practiceKind} items={set.items} results={view.results} durationMs={view.durationMs} points={view.points} onRetry={start} />
      <p className="text-center text-xs text-text-muted">Time {formatClock(view.durationMs / 1000)}</p>
      <div className="text-center">
        <button type="button" onClick={() => setView({ name: "landing" })} className="text-sm font-medium text-primary hover:underline">
          Back to this set
        </button>
      </div>
    </div>
  );
}
