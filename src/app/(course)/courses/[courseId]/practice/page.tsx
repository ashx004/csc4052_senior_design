'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { ArrowLeft, Clock, Loader2, PenLine, Puzzle, Trash2, Trophy, Variable } from 'lucide-react';
import { db } from '@/src/library/firebase';
import { useAuth } from '@/src/context/AuthContext';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import { usePracticeGeneration } from '@/src/hooks/usePracticeGeneration';
import { getCourseResources, INDEXABLE_FILE_TYPES } from '@/src/components/resourceManagement/fileUploadService';
import ConfirmDeleteModal from '@/src/components/learning/ConfirmDeleteModal';
import PracticeSetup, { type SetupResource } from '@/src/components/practice/PracticeSetup';
import { deletePracticeSet } from '@/src/library/practice/deleteSet';
import { KIND_LABELS, PRACTICE_KINDS, type PracticeKind } from '@/src/library/practice/types';

interface SetSummary {
  id: string;
  name: string;
  kind: PracticeKind;
  count: number;
  sourceName: string;
  attempts: number;
  bestPercent: number | null;
  createdAt: Timestamp | null;
}

const KIND_ICONS = { fill_blank: PenLine, word_problem: Variable, drag_drop: Puzzle } as const;

function extractStorageKey(url: string): string {
  return decodeURIComponent(url.split('key=')[1] ?? '');
}

export default function PracticeHubPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { displayName, loading: courseLoading } = useCourseInfo(courseId);
  const generation = usePracticeGeneration(courseId);

  const [resources, setResources] = useState<SetupResource[] | null>(null);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestedKind = searchParams.get('kind');
  const initialKind = PRACTICE_KINDS.find((k) => k === requestedKind);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    getCourseResources(user.uid, courseId)
      .then((data) => {
        if (cancelled) return;
        setResources(
          data
            .filter((r) => INDEXABLE_FILE_TYPES.includes(String(r.fileType ?? '').toLowerCase()) && r.url)
            .map((r) => ({ id: r.id, name: String(r.name ?? 'Untitled'), source: { sourceDocKey: extractStorageKey(r.url), name: String(r.name ?? 'Untitled'), url: String(r.url) } })),
        );
      })
      .catch(() => !cancelled && setResources([]));
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, courseId]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'enrollment', courseId, 'practiceSets'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) =>
        setSets(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: String(data.name ?? 'Practice'),
              kind: data.kind as PracticeKind,
              count: Array.isArray(data.items) ? data.items.length : 0,
              sourceName: String(data.sourceName ?? ''),
              attempts: Number(data.attempts ?? 0),
              bestPercent: typeof data.bestPercent === 'number' ? data.bestPercent : null,
              createdAt: (data.createdAt as Timestamp) ?? null,
            };
          }),
        ),
      (error) => {
        console.error('Error loading practice sets:', error);
        setSets([]);
      },
    );
  }, [user, courseId]);

  const grouped = useMemo(() => PRACTICE_KINDS.map((kind) => ({ kind, sets: sets.filter((s) => s.kind === kind) })).filter((g) => g.sets.length > 0), [sets]);

  async function confirmDelete() {
    if (!user || !deleteId) return;
    setDeleting(true);
    try {
      await deletePracticeSet(db, user.uid, courseId, deleteId);
    } catch (error) {
      console.error('Error deleting practice set:', error);
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  if (authLoading || resources === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main">
      <header className="flex items-center gap-3 border-b border-border-light px-6 py-4 sm:px-14">
        <button onClick={() => router.back()} className="rounded-md p-1.5 transition-colors hover:bg-bg-warm" aria-label="Back">
          <ArrowLeft size={20} className="text-text-main" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-main">Practice</h1>
          <p className="text-xs text-text-muted">{courseLoading ? 'Loading...' : displayName}</p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-8 px-6 py-6 sm:px-8">
        <PracticeSetup
          resources={resources}
          initialKind={initialKind}
          loading={generation.loading}
          error={generation.error}
          onGenerate={async (choice) => {
            const id = await generation.generate(choice);
            if (id) router.push(`/courses/${courseId}/practice/${id}`);
          }}
        />

        {grouped.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">No practice yet. Make your first set above.</p>
        ) : (
          grouped.map(({ kind, sets: kindSets }) => {
            const Icon = KIND_ICONS[kind];
            return (
              <section key={kind}>
                <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text-main">
                  <Icon size={16} className="text-primary" /> {KIND_LABELS[kind].title}
                </h2>
                <ul className="divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-bg-container">
                  {kindSets.map((set) => (
                    <li key={set.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-bg-warm">
                      <Link href={`/courses/${courseId}/practice/${set.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-main">{set.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
                          <span>{set.count} {kind === 'drag_drop' ? 'rounds' : 'questions'}</span>
                          {set.sourceName && <span className="truncate">from {set.sourceName}</span>}
                          <span className="flex items-center gap-1">
                            <Clock size={11} /> {set.attempts === 0 ? 'Not tried yet' : `${set.attempts} ${set.attempts === 1 ? 'try' : 'tries'}`}
                          </span>
                        </p>
                      </Link>
                      {set.bestPercent !== null && (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-text-main">
                          <Trophy size={13} className="text-amber-500" /> {set.bestPercent}%
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteId(set.id)}
                        aria-label={`Delete ${set.name}`}
                        className="shrink-0 rounded-md p-1.5 text-text-muted opacity-60 transition hover:bg-bg-main hover:text-alert-error group-hover:opacity-100"
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      <ConfirmDeleteModal
        open={!!deleteId}
        title="Delete practice set"
        message="This permanently deletes this set and its history. This can't be undone."
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
