'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { ArrowRight, BookOpen, Layers3, Loader2, Sparkles } from 'lucide-react';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import LectureChoiceModal from '@/src/components/learning/LectureChoiceModal';
import SourcePickerModal from '@/src/components/learning/SourcePickerModal';
import StudySetupStep from '@/src/components/learning/StudySetupStep';
import { useAuth } from '@/src/context/AuthContext';
import { useGenerateQuizFromResource } from '@/src/hooks/useGenerateQuizFromResource';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import { db } from '@/src/library/firebase';
import { getEffectiveModelKey } from '@/src/library/chatMode';
import { publishStudySet } from '@/src/library/discover/publishStudySet';
import { buildSourcesPayload, completeSourceKeys } from '@/src/library/studySets/buildSourcesPayload';
import { liveDeps } from '@/src/library/studySets/persistDepsLive';
import { persistStudySet } from '@/src/library/studySets/persistStudySet';
import { auditSummary } from '@/src/library/studySets/auditSummary';
import type { SourceAudit } from '@/src/library/generation/orchestrator';
import { subscribeNotes } from '@/src/library/notes/notesStore';
import { DEFAULT_QUIZ_DIFFICULTY } from '@/src/library/quizDifficulty';
import { eligibleSourceIds, validSourceSelection, normalizeSourceOptions, sourceStatusLabel } from '@/src/library/studySets/sourceOptions';
import {
  canCreateStudySet,
  liveGeneratorBlock,
  MULTI_SOURCE_GENERATION_READY,
  validateStudyConfig,
  type StudyConfig,
  type StudyKind,
} from '@/src/library/studySets/setupRules';
import launchStyles from '@/src/app/(course)/courses/[courseId]/learning/studySets.module.css';
import pickerStyles from './SourcePickerModal.module.css';

interface CourseResource {
  id: string;
  name: string;
  url: string;
  indexStatus?: string;
}

interface StudyLaunchProps {
  courseId: string;
  variant: 'hero' | 'compact';
  initialKind?: StudyKind;
  preselectedIds?: string[];
  children?: (open: (kind?: StudyKind) => void) => ReactNode;
}

const NO_PRESELECTION: string[] = [];

const DEFAULT_CONFIG = (kind: StudyKind): StudyConfig => ({
  count: kind === 'quiz' ? 30 : 20,
  visibility: 'public',
  questionTypes: { multipleChoice: true, trueFalse: false, matching: false },
  difficulty: DEFAULT_QUIZ_DIFFICULTY,
});

export default function StudyLaunch({ courseId, variant, initialKind, preselectedIds = NO_PRESELECTION, children }: StudyLaunchProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { courseCode } = useCourseInfo(courseId);
  const quizFromResource = useGenerateQuizFromResource(courseId);
  const [resources, setResources] = useState<CourseResource[]>([]);
  const [notes, setNotes] = useState<Array<{ id: string; title: string; kind: string; courseId: string | null; resourceId?: string; url?: string; fileType?: string; plainText?: string; hidden?: boolean }>>([]);
  const [kind, setKind] = useState<StudyKind>(initialKind ?? 'quiz');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<'closed' | 'kind' | 'sources' | 'setup'>('closed');
  const [showDocuments, setShowDocuments] = useState(false);
  const [config, setConfig] = useState<StudyConfig>(DEFAULT_CONFIG(initialKind ?? 'quiz'));
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const [creatingCards, setCreatingCards] = useState(false);
  const [lastAudit, setLastAudit] = useState<SourceAudit[]>([]);
  const [lastSkipped, setLastSkipped] = useState<Array<{ title: string; reason: string }>>([]);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCourseResources(user.uid, courseId)
      .then((rows) => {
        if (!cancelled) setResources(rows as CourseResource[]);
      })
      .catch((error) => console.error('Error fetching study sources:', error));
    const unsubscribe = subscribeNotes(user.uid, (next) => {
      if (!cancelled) {
        setNotes(next.filter((note) => !note.hidden).map((note) => ({
          id: note.id,
          title: note.title,
          kind: note.kind,
          courseId: note.courseId,
          resourceId: note.resourceId,
          url: note.url,
          fileType: note.fileType,
          plainText: note.plainText,
        })));
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, courseId]);

  const options = useMemo(
    () => normalizeSourceOptions(resources, notes, courseId),
    [resources, notes, courseId],
  );
  useEffect(() => {
    if (preselectedIds.length === 0) return;
    setSelectedIds(eligibleSourceIds(preselectedIds, options));
    setStep(initialKind ? 'sources' : 'kind');
  }, [preselectedIds, initialKind, options]);

  const selected = options.filter((option) => selectedIds.includes(option.id));
  const validation = validateStudyConfig(kind, selectedIds.length, config);
  const sourcesValid = validSourceSelection(selectedIds, options);
  const blockedMessage = !sourcesValid ? 'Choose available course sources to continue.' : liveGeneratorBlock(kind, selectedIds.length, config);
  const loading = quizFromResource.loading || creatingCards;
  const canCreate = canCreateStudySet(selectedIds, validation, loading, MULTI_SOURCE_GENERATION_READY) && sourcesValid && !blockedMessage;

  const openKind = (next: StudyKind) => {
    setKind(next);
    setConfig(DEFAULT_CONFIG(next));
    setQuery('');
    setFlashcardError(null);
    setLastAudit([]);
    setLastSkipped([]);
    setPendingRoute(null);
    setStep('sources');
  };

  const createFlashcards = async () => {
    if (!user) return;
    setCreatingCards(true);
    setFlashcardError(null);
    try {
      const sources = buildSourcesPayload(selected, resources, notes);
      if (sources.length === 0) {
        setFlashcardError('Choose at least one course document or note.');
        return;
      }
      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, courseId, count: config.count, modelKey: getEffectiveModelKey('flashcards') }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate flashcards.');
      const cards = Array.isArray(data.questions) ? data.questions : [];
      const sourceKeys = completeSourceKeys(Array.isArray(data.sourceKeys) ? data.sourceKeys : [], selected, notes);
      const name: string = data.topicName || selected[0]?.title || 'Flashcards';
      const { setId } = await persistStudySet(liveDeps(db, user.uid, courseId), {
        kind: 'flashcards', sourceKeys, name, items: cards, visibility: config.visibility,
      });
      if (config.visibility === 'public' && courseCode) {
        try {
          const publicSetId = await publishStudySet({
            type: 'flashcard',
            setData: { name, cards },
            courseCode,
            ownerUid: user.uid,
            originalPath: `users/${user.uid}/enrollment/${courseId}/flashcardSets/${setId}`,
          });
          await updateDoc(doc(db, 'users', user.uid, 'enrollment', courseId, 'flashcardSets', setId), { publicSetId });
        } catch (publishError) {
          console.error('Error publishing flashcard set:', publishError);
        }
      }
      const audit: SourceAudit[] = Array.isArray(data.audit) ? data.audit : [];
      const skipped = Array.isArray(data.skipped) ? data.skipped : [];
      const route = `/courses/${courseId}/flashcards/${setId}`;
      if (auditSummary(audit, skipped).message) {
        setLastAudit(audit);
        setLastSkipped(skipped);
        setPendingRoute(route);
      } else {
        setStep('closed');
        router.push(route);
      }
    } catch (error) {
      setFlashcardError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setCreatingCards(false);
    }
  };

  const create = async () => {
    if (!canCreate || loading || !validSourceSelection(selectedIds, options)) return;
    if (kind === 'quiz') {
      const sources = buildSourcesPayload(selected, resources, notes);
      if (sources.length === 0) {
        setFlashcardError('Choose at least one course document or note.');
        return;
      }
      const result = await quizFromResource.generateFromSources(sources, selected, {
        questionCount: config.count,
        questionTypes: config.questionTypes ?? { multipleChoice: true, trueFalse: false, matching: false },
        difficulty: config.difficulty ?? DEFAULT_QUIZ_DIFFICULTY,
        visibility: config.visibility,
      }, notes);
      if (result) {
        if (auditSummary(result.audit, result.skipped).message) {
          setLastAudit(result.audit);
          setLastSkipped(result.skipped);
          setPendingRoute(result.route);
        } else {
          setStep('closed');
          router.push(result.route);
        }
      }
      return;
    }
    await createFlashcards();
  };

  const preselectedTitle = options.find((option) => option.id === preselectedIds[0])?.title
    ?? resources.find((resource) => resource.id === preselectedIds[0])?.name
    ?? 'this document';

  const auditMessage = auditSummary(lastAudit, lastSkipped).message;

  return (
    <>
      {children ? children((next) => openKind(next ?? initialKind ?? 'quiz')) : variant === 'hero' ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2" data-tutorial="course-learning-grid">
            <LaunchCard kind="quiz" onClick={() => openKind('quiz')} />
            <LaunchCard kind="flashcards" onClick={() => openKind('flashcards')} />
          </div>
          <section className="mt-8 rounded-2xl border border-border-light bg-bg-container px-5 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setShowDocuments((value) => !value)}
              aria-expanded={showDocuments}
              className="flex w-full items-center justify-between gap-4 rounded-lg text-left focus-visible:bg-bg-warm focus-visible:outline-none"
            >
              <span>
                <span className="block font-semibold text-text-main">Already have a document in mind?</span>
                <span className="mt-0.5 block text-sm text-text-muted">Start from your course resources and choose quiz or flashcards there.</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-text-main">
                {showDocuments ? 'Hide' : <>Browse documents<ArrowRight size={18} strokeWidth={2.5} aria-hidden="true" /></>}
              </span>
            </button>
            {showDocuments && (
              <div className="mt-5 grid gap-2 border-t border-border-light pt-5 sm:grid-cols-2 lg:grid-cols-3">
                {resources.length === 0 ? (
                  <p className="text-sm text-text-muted">No documents in this course yet.</p>
                ) : resources.map((resource) => (
                  <button
                    key={resource.id}
                    type="button"
                    disabled={!eligibleSourceIds([resource.id], options).length}
                    onClick={() => {
                      const ids = eligibleSourceIds([resource.id], options);
                      if (!ids.length) return;
                      setSelectedIds(ids);
                      setShowDocuments(false);
                      setStep('kind');
                    }}
                    className="flex min-w-0 items-center gap-3 rounded-xl bg-bg-main p-3 text-left text-sm font-medium text-text-main hover:bg-bg-warm focus-visible:bg-bg-warm focus-visible:outline-none"
                  >
                    <BookOpen size={18} className="shrink-0 text-text-muted" />
                    <span className="min-w-0"><span className="block truncate">{resource.name}</span><span className="block text-xs text-text-muted">{sourceStatusLabel(options.find((option) => option.id === resource.id)?.status ?? 'unavailable')}</span></span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <button type="button" className={pickerStyles.pill} onClick={() => openKind(initialKind ?? 'quiz')}>
          {initialKind === 'flashcards' ? 'Make flashcards' : 'Make a quiz'}
          <ArrowRight size={20} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}

      <LectureChoiceModal
        open={step === 'kind'}
        documentName={preselectedTitle}
        onClose={() => setStep('closed')}
        onSelectQuiz={() => openKind('quiz')}
        onSelectFlashcard={() => openKind('flashcards')}
      />
      <SourcePickerModal
        open={step === 'sources'}
        kind={kind}
        options={options}
        selectedIds={selectedIds}
        query={query}
        onQueryChange={setQuery}
        onChange={setSelectedIds}
        onBack={preselectedIds.length > 0 && !initialKind ? () => setStep('kind') : undefined}
        customHref={`/custom/new?type=${kind === 'quiz' ? 'quiz' : 'flashcards'}`}
        onContinue={() => { if (sourcesValid) setStep('setup'); }}
        onClose={() => setStep('closed')}
      />
      {step === 'setup' && (
        <SetupDialog onClose={() => setStep('closed')}>
          <div className={pickerStyles.head}>
            <div>
              <p className={pickerStyles.step}>Step 2 of 2</p>
              <h2 id="study-setup-title">Set up your {kind === 'quiz' ? 'quiz' : 'flashcards'}</h2>
              <p className={pickerStyles.sub}>Choose how much to study.</p>
            </div>
            <button type="button" className={pickerStyles.close} aria-label="Close" onClick={() => setStep('closed')}>×</button>
          </div>
          <div className={pickerStyles.body}>
            <StudySetupStep
              kind={kind}
              selected={selected}
              config={config}
              validation={validation}
              blockedMessage={blockedMessage}
              loading={loading}
              error={flashcardError || quizFromResource.error}
              onChange={setConfig}
              onRaiseCount={() => setConfig((current) => ({ ...current, count: validation.minimum }))}
            />
            {auditMessage && <p className={pickerStyles.sub} role="status">{auditMessage}</p>}
            {pendingRoute && (
              <button type="button" className={pickerStyles.pill} onClick={() => { setStep('closed'); router.push(pendingRoute); }}>
                Continue to your set
              </button>
            )}
          </div>
          <div className={pickerStyles.foot}>
            <button type="button" className={pickerStyles.all} onClick={() => setStep('sources')}>Back</button>
            <button type="button" className={pickerStyles.pill} disabled={!canCreate} onClick={() => void create()}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : kind === 'quiz' ? 'Create quiz' : 'Create flashcards'}
            </button>
          </div>
        </SetupDialog>
      )}
    </>
  );
}

function SetupDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog ref={dialogRef} className={pickerStyles.dialog} aria-labelledby="study-setup-title">
      {children}
    </dialog>
  );
}

function LaunchCard({ kind, onClick }: { kind: StudyKind; onClick: () => void }) {
  const quiz = kind === 'quiz';
  return (
    <article className={`${launchStyles.launchCard} ${quiz ? launchStyles.quizCard : launchStyles.flashcardCard}`}>
      <div className={launchStyles.launchCopy}>
        <span className={launchStyles.cardIcon}>{quiz ? <BookOpen size={20} /> : <Layers3 size={20} />}</span>
        <h3>
          {quiz ? <>Ready for a <span className={launchStyles.marked}>quick quiz?</span></> : <>Make it stick with <span className={launchStyles.marked}>flashcards.</span></>}
        </h3>
        <p>
          {quiz
            ? 'See what you remember. Pick your sources and make a quiz that fits your session.'
            : 'Break a topic into cards you can review whenever you have a few minutes.'}
        </p>
        <button type="button" onClick={onClick} className={launchStyles.launchButton}>
          {quiz ? 'Make a quiz' : 'Make flashcards'} <ArrowRight size={19} />
        </button>
      </div>
      <Image
        src={quiz ? '/illustrations/study/quiz-reader.webp' : '/illustrations/study/flashcard-student.webp'}
        alt=""
        width={420}
        height={420}
        className={launchStyles.launchIllustration}
        priority
      />
    </article>
  );
}

export function StudySpaceHeading() {
  return (
    <div className="mb-7 max-w-2xl" data-tutorial="course-learning-heading">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-text-muted"><Sparkles size={16} /> Your study space</p>
      <h2 className="text-3xl font-bold tracking-tight text-text-main sm:text-4xl">What would you like to study?</h2>
      <p className="mt-3 text-base text-text-muted">Turn class material into a quick check or a set of cards.</p>
    </div>
  );
}
