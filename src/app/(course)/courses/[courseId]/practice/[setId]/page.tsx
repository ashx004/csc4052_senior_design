'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { ArrowLeft, Clock, Loader2, Play, Trophy } from 'lucide-react';
import { db } from '@/src/library/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { usePracticeGeneration, type PracticeSource } from '@/src/hooks/usePracticeGeneration';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import FillBlankRunner from '@/src/components/practice/FillBlankRunner';
import WordProblemRunner from '@/src/components/practice/WordProblemRunner';
import DragDropRunner from '@/src/components/practice/DragDropRunner';
import PracticeResults from '@/src/components/practice/PracticeResults';
import { PRIMARY_BUTTON } from '@/src/components/practice/PracticeShell';
import { totalScore } from '@/src/library/practice/grading';
import { createConceptWeakSpotRepository } from '@/src/library/studyPlan/conceptWeakSpotRepository';
import { finishFocusedSession, itemsFromPracticeResults } from '@/src/library/studyPlan/focusedSessionService';
import { formatClock } from '@/src/library/practice/dragDrop';
import {
  DIFFICULTY_LABELS,
  KIND_LABELS,
  type DragDropItem,
  type DragDropMode,
  type FillBlankItem,
  type ItemResult,
  type PracticeDifficulty,
  type PracticeItem,
  type PracticeKind,
  type WordProblemItem,
} from '@/src/library/practice/types';

interface LoadedSet {
  name: string;
  kind: PracticeKind;
  items: PracticeItem[];
  sourceDocKey: string;
  sourceName: string;
  difficulty: PracticeDifficulty;
  bestPercent: number | null;
}

interface PastAttempt {
  id: string;
  percent: number;
  score: number;
  total: number;
  durationMs: number;
  points: number | null;
  results: ItemResult[];
  completedAt: Timestamp | null;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

type View = { name: 'landing' } | { name: 'playing'; run: number } | { name: 'results'; attempt: PastAttempt; fresh: boolean };

function extractStorageKey(url: string): string {
  return decodeURIComponent(url.split('key=')[1] ?? '');
}

function formatDate(ts: Timestamp | null): string {
  return ts ? ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

function itemText(item: PracticeItem): string {
  if (item.kind === 'fill_blank') return item.text;
  if (item.kind === 'word_problem') return item.problem;
  return item.tiles.map((t) => t.label).join(' ');
}

/** Firestore rejects undefined fields, so only keep what is set. */
function storable(result: ItemResult): ItemResult {
  return { itemId: result.itemId, score: result.score, response: result.response ?? null, ...(result.seconds !== undefined ? { seconds: result.seconds } : {}) };
}

export default function PracticeSetPage({ params }: { params: Promise<{ courseId: string; setId: string }> }) {
  const { courseId, setId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const generation = usePracticeGeneration(courseId);

  const [set, setSet] = useState<LoadedSet | null>(null);
  const [attempts, setAttempts] = useState<PastAttempt[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [view, setView] = useState<View>({ name: 'landing' });
  const [startedAt, setStartedAt] = useState(0);
  const [source, setSource] = useState<PracticeSource | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  // The finished run waiting to be saved, so a failed save can be retried as-is.
  const unsaved = useRef<{ attemptId: string; percent: number; payload: Record<string, unknown> } | null>(null);

  const loadAttempts = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'enrollment', courseId, 'practiceSets', setId, 'attempts'), orderBy('completedAt', 'desc')));
      setAttempts(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            percent: Number(data.percent ?? 0),
            score: Number(data.score ?? 0),
            total: Number(data.total ?? 0),
            durationMs: Number(data.durationMs ?? 0),
            points: typeof data.points === 'number' ? data.points : null,
            results: (data.results ?? []) as ItemResult[],
            completedAt: (data.completedAt as Timestamp) ?? null,
          };
        }),
      );
    } catch (error) {
      console.error('Error loading practice attempts:', error);
      setAttempts([]);
    }
  }, [user, courseId, setId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'enrollment', courseId, 'practiceSets', setId));
        if (cancelled) return;
        if (!snap.exists()) return setStatus('missing');
        const data = snap.data();
        setSet({
          name: String(data.name ?? 'Practice'),
          kind: data.kind as PracticeKind,
          items: (data.items ?? []) as PracticeItem[],
          sourceDocKey: String(data.sourceDocKey ?? ''),
          sourceName: String(data.sourceName ?? ''),
          difficulty: (data.difficulty in DIFFICULTY_LABELS ? data.difficulty : 'exam') as PracticeDifficulty,
          bestPercent: typeof data.bestPercent === 'number' ? data.bestPercent : null,
        });
        setStatus('ready');
        void loadAttempts();
        // Needed only for "New questions": the file this set was made from.
        const resources = await getCourseResources(user.uid, courseId).catch(() => []);
        if (cancelled) return;
        const match = resources.find((r) => r.url && extractStorageKey(String(r.url)) === String(data.sourceDocKey));
        if (match) setSource({ sourceDocKey: String(data.sourceDocKey), name: String(match.name ?? data.sourceName ?? 'document'), url: String(match.url) });
      } catch (error) {
        console.error('Error loading practice set:', error);
        if (!cancelled) setStatus('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, courseId, setId, router, loadAttempts]);

  // Saves the finished run and updates the set's best score in one transaction,
  // so the best score is checked against what is stored now (not what this page
  // loaded earlier, which another tab may have beaten) and the attempt and the
  // set can never get out of step. The attempt has a fixed ID, so saving again
  // after a failure can't record the run twice.
  const saveAttempt = useCallback(async () => {
    const pending = unsaved.current;
    if (!user || !pending) return;
    setSaveState('saving');
    try {
      const setRef = doc(db, 'users', user.uid, 'enrollment', courseId, 'practiceSets', setId);
      const attemptRef = doc(setRef, 'attempts', pending.attemptId);
      let best = pending.percent;
      await runTransaction(db, async (tx) => {
        const current = await tx.get(setRef);
        const stored = current.exists() && typeof current.data().bestPercent === 'number' ? (current.data().bestPercent as number) : 0;
        best = Math.max(stored, pending.percent);
        tx.set(attemptRef, { ...pending.payload, completedAt: serverTimestamp() });
        tx.update(setRef, { attempts: increment(1), bestPercent: best, lastPlayedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      unsaved.current = null;
      setSet((current) => (current ? { ...current, bestPercent: best } : current));
      setSaveState('saved');
      void loadAttempts();
    } catch (error) {
      console.error('Error saving practice attempt:', error);
      setSaveState('failed');
    }
  }, [user, courseId, setId, loadAttempts]);

  const finish = useCallback(
    (results: (ItemResult & { points?: number })[]) => {
      if (!user || !set) return;
      const { score, total, percent } = totalScore(results);
      const durationMs = Date.now() - startedAt;
      const points = set.kind === 'drag_drop' ? results.reduce((sum, r) => sum + (r.points ?? 0), 0) : null;
      const attempt: PastAttempt = { id: 'new', percent, score, total, durationMs, points, results: results.map(storable), completedAt: null };
      setView({ name: 'results', attempt, fresh: true });
      const attemptId = crypto.randomUUID();
      unsaved.current = {
        attemptId,
        percent,
        payload: { score, total, percent, durationMs, points, results: attempt.results },
      };
      void saveAttempt();
      // Scores this run against the weak concepts it covers. It is separate from saving the
      // attempt, and runs once per finished run, so retrying a failed save never counts it twice.
      void finishFocusedSession(createConceptWeakSpotRepository(user.uid), {
        sessionId: attemptId,
        courseId,
        kind: set.kind,
        completedAtMs: Date.now(),
        items: itemsFromPracticeResults(
          set.items,
          results.map((r) => ({ itemId: r.itemId, score: r.score, selfMarked: r.selfMarked === true })),
        ),
      }).catch((error) => console.error('Error updating weak concepts:', error));
    },
    [user, set, startedAt, saveAttempt, courseId],
  );

  async function newQuestions() {
    if (!set || !source) return;
    const modes = set.kind === 'drag_drop' ? [...new Set((set.items as DragDropItem[]).map((i) => i.mode))] as DragDropMode[] : undefined;
    const id = await generation.generate({ source, kind: set.kind, count: set.items.length, difficulty: set.difficulty, modes, avoid: set.items.map(itemText) });
    if (id) router.push(`/courses/${courseId}/practice/${id}`);
  }

  function start() {
    setStartedAt(Date.now());
    setSaveState('idle');
    setView({ name: 'playing', run: Date.now() });
  }

  if (authLoading || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'missing' || !set) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-main px-6 text-center">
        <p className="text-lg font-semibold text-text-main">This practice set couldn&apos;t be found.</p>
        <button onClick={() => router.push(`/courses/${courseId}/practice`)} className={PRIMARY_BUTTON}>
          Back to Practice
        </button>
      </div>
    );
  }

  const isDrag = set.kind === 'drag_drop';

  return (
    <div className="min-h-screen bg-bg-main">
      <header className="flex items-center gap-3 border-b border-border-light px-6 py-4 sm:px-14">
        <button onClick={() => router.push(`/courses/${courseId}/practice`)} className="rounded-md p-1.5 transition-colors hover:bg-bg-warm" aria-label="Back to Practice">
          <ArrowLeft size={20} className="text-text-main" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-text-main">{set.name}</h1>
          <p className="text-xs text-text-muted">
            {KIND_LABELS[set.kind].title} &middot; {DIFFICULTY_LABELS[set.difficulty]}
            {set.sourceName ? ` · from ${set.sourceName}` : ''}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 sm:px-8">
        {view.name === 'landing' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border-light bg-bg-container p-6 text-center shadow-sm">
              <p className="text-sm text-text-muted">{KIND_LABELS[set.kind].description}</p>
              <p className="mt-3 text-2xl font-bold text-text-main">
                {set.items.length} {isDrag ? 'rounds' : set.kind === 'word_problem' ? 'problems' : 'questions'}
              </p>
              {set.bestPercent !== null && (
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-text-muted">
                  <Trophy size={14} className="text-amber-500" /> Best: {set.bestPercent}%
                </p>
              )}
              <button type="button" onClick={start} className={`${PRIMARY_BUTTON} mt-5`}>
                <Play size={15} /> {attempts.length ? 'Try again' : 'Start'}
              </button>
            </div>

            {attempts.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-bold text-text-main">Your tries</h2>
                <ul className="divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-bg-container">
                  {attempts.map((attempt) => (
                    <li key={attempt.id}>
                      <button type="button" onClick={() => setView({ name: 'results', attempt, fresh: false })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-warm">
                        <span className="w-12 text-sm font-bold tabular-nums text-text-main">{attempt.percent}%</span>
                        <span className="flex-1 text-xs text-text-muted">{formatDate(attempt.completedAt)}</span>
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <Clock size={11} /> {formatClock(attempt.durationMs / 1000)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {view.name === 'playing' && set.kind === 'fill_blank' && <FillBlankRunner key={view.run} items={set.items as FillBlankItem[]} onFinish={finish} />}
        {view.name === 'playing' && set.kind === 'word_problem' && (
          <WordProblemRunner key={view.run} courseId={courseId} setId={setId} items={set.items as WordProblemItem[]} onFinish={finish} />
        )}
        {view.name === 'playing' && isDrag && <DragDropRunner key={view.run} items={set.items as DragDropItem[]} onFinish={finish} />}

        {view.name === 'results' && (
          <div className="space-y-4">
            {generation.error && <p className="rounded-lg border border-alert-error bg-alert-error-bg p-3 text-sm text-alert-error">{generation.error}</p>}
            {view.fresh && saveState === 'failed' && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-alert-error bg-alert-error-bg p-3 text-sm text-alert-error">
                <span className="flex-1">This try wasn&apos;t saved, so it won&apos;t show in your history or best score yet.</span>
                <button type="button" onClick={() => void saveAttempt()} className="rounded-md border border-alert-error px-3 py-1 text-xs font-semibold hover:bg-bg-container">
                  Try saving again
                </button>
              </div>
            )}
            {view.fresh && saveState === 'saving' && <p className="text-center text-xs text-text-muted">Saving your result...</p>}
            <PracticeResults
              kind={set.kind}
              items={set.items}
              results={view.attempt.results}
              durationMs={view.attempt.durationMs}
              points={view.attempt.points ?? undefined}
              onRetry={start}
              onNewQuestions={source ? () => void newQuestions() : undefined}
              newQuestionsBusy={generation.loading}
            />
            {!view.fresh && (
              <div className="text-center">
                <button type="button" onClick={() => setView({ name: 'landing' })} className="text-sm font-medium text-primary hover:underline">
                  Back to this set
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
