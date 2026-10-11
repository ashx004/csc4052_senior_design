'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { useChatContext } from '@/src/hooks/useChatContext';
import ContextualAiPanel, { CatalystLauncher } from '@/src/components/aiAssistant/ContextualAiPanel';
import { buildPageTextSuggestions, type PageTextPageContext } from '@/src/library/Contextual_AI/contextualAi';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { ArrowLeft, ArrowRight, BookOpen, Layers3, Loader2, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import RecentItemRow, { RecentItem } from '@/src/components/learning/RecentItemRow';
import SortDropdown, { SortOption } from '@/src/components/learning/SortDropdown';
import LectureChoiceModal from '@/src/components/learning/LectureChoiceModal';
import StudySourcePicker from '@/src/components/learning/StudySourcePicker';
import ConfirmDeleteModal from '@/src/components/learning/ConfirmDeleteModal';
import QuizSetupModal from '@/src/components/quizzes/QuizSetupModal';
import { useGenerateQuizFromResource } from '@/src/hooks/useGenerateQuizFromResource';
import { publishStudySet } from '@/src/library/discover/publishStudySet';
import { unpublishStudySet } from '@/src/library/discover/unpublishStudySet';
import type { StudySetVisibility } from '@/src/library/discover/types';
import PageTutorial from '@/src/components/tutorial/PageTutorial';
import courseLearningSteps from '@/src/library/tutorials/steps/course-learning';
import styles from './studySets.module.css';

interface Resource {
  id: string;
  name: string;
  url: string;
  fileType: string;
  category: string;
}

type DeleteTarget = { id: string; kind: 'flashcard' | 'quiz' };

function extractStorageKey(url: string): string {
  return decodeURIComponent(url.split('key=')[1] ?? '');
}

function sortRecentItems(items: RecentItem[], sort: SortOption): RecentItem[] {
  const copy = [...items];
  if (sort === 'title') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  }
  return copy;
}

export default function CourseLearningPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const courseId = params.courseId as string;
  const {
    displayName: courseDisplayName,
    courseCode,
    loading: courseInfoLoading,
  } = useCourseInfo(courseId);

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  const [flashcardSets, setFlashcardSets] = useState<RecentItem[]>([]);
  const [flashcardSort, setFlashcardSort] = useState<SortOption>('recent');

  const [quizSets, setQuizSets] = useState<RecentItem[]>([]);
  const [quizSort, setQuizSort] = useState<SortOption>('recent');

  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [sourcePickerKind, setSourcePickerKind] = useState<'quiz' | 'flashcard' | null>(null);
  const [showDocumentShortcuts, setShowDocumentShortcuts] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const quizFromResource = useGenerateQuizFromResource(courseId);

  const searchParams = useSearchParams();
  const quizFromId = searchParams.get('quizFrom');
  const handledQuizFromRef = useRef<string | null>(null);

  useEffect(() => {
    if (!quizFromId || loading || handledQuizFromRef.current === quizFromId) return;
    const resource = resources.find((item) => item.id === quizFromId);
    if (!resource) return;
    handledQuizFromRef.current = quizFromId;
    quizFromResource.begin({
      sourceDocKey: extractStorageKey(resource.url),
      resourceId: resource.id,
      name: resource.name,
      url: resource.url,
    });
  }, [quizFromId, loading, resources, quizFromResource.begin]);

  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);

  // "Ask Catalyst" floating panel — same page_text pattern as the course
  // overview page, since this page (choosing a document to turn into
  // flashcards/quizzes) has nothing as structured as a flashcard/quiz
  // result to model either.
  const [catalystOpen, setCatalystOpen] = useState(false);
  const catalystBtnRef = useRef<HTMLButtonElement | null>(null);
  
  const catalystChatContext = useChatContext(user?.uid, user?.email);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchResources = async () => {
      try {
        const data = await getCourseResources(user.uid, courseId);
        setResources(data as Resource[]);
      } catch (error) {
        console.error('Error fetching resources:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, [user, authLoading, courseId]);

  // Recent flashcard sets — every set for this course, regardless of pinned status
  useEffect(() => {
    if (!user) {
      setFlashcardSets([]);
      return;
    }

    const setsRef = collection(db, 'users', user.uid, 'enrollment', courseId, 'flashcardSets');
    const q = query(setsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setFlashcardSets(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: (data.name as string) || 'Untitled',
              itemCount: Array.isArray(data.cards) ? data.cards.length : 0,
              createdAt: (data.createdAt as Timestamp) ?? null,
              pinned: data.pinned as boolean | undefined,
              visibility: data.visibility as StudySetVisibility | undefined,
              publicSetId: data.publicSetId as string | undefined,
            };
          })
        );
      },
      (error) => {
        console.error('Error fetching flashcard sets:', error);
        setFlashcardSets([]);
      }
    );

    return () => unsubscribe();
  }, [user, courseId]);

  // Recent quizzes — every set for this course, regardless of pinned status
  useEffect(() => {
    if (!user) {
      setQuizSets([]);
      return;
    }

    const setsRef = collection(db, 'users', user.uid, 'enrollment', courseId, 'quizSets');
    const q = query(setsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setQuizSets(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: (data.name as string) || 'Untitled',
              itemCount: Array.isArray(data.questions) ? data.questions.length : 0,
              createdAt: (data.createdAt as Timestamp) ?? null,
              pinned: data.pinned as boolean | undefined,
              visibility: data.visibility as StudySetVisibility | undefined,
              publicSetId: data.publicSetId as string | undefined,
            };
          })
        );
      },
      (error) => {
        console.error('Error fetching quiz sets:', error);
        setQuizSets([]);
      }
    );

    return () => unsubscribe();
  }, [user, courseId]);

  const sortedFlashcardSets = useMemo(
    () => sortRecentItems(flashcardSets, flashcardSort),
    [flashcardSets, flashcardSort]
  );
  const sortedQuizSets = useMemo(() => sortRecentItems(quizSets, quizSort), [quizSets, quizSort]);

  const handleSelectFlashcard = () => {
    if (!selectedResource) return;
    router.push(
      `/courses/${courseId}/flashcards?docId=${selectedResource.id}&docName=${encodeURIComponent(
        selectedResource.name
      )}`
    );
  };

  const handleSelectQuiz = () => {
    if (!selectedResource) return;
    quizFromResource.begin({
      sourceDocKey: extractStorageKey(selectedResource.url),
      resourceId: selectedResource.id,
      name: selectedResource.name,
      url: selectedResource.url,
    });
    setSelectedResource(null);
  };

  const handlePickSource = (id: string) => {
    const resource = resources.find((item) => item.id === id);
    if (!resource || !sourcePickerKind) return;
    if (sourcePickerKind === 'quiz') {
      quizFromResource.begin({
        sourceDocKey: extractStorageKey(resource.url),
        resourceId: resource.id,
        name: resource.name,
        url: resource.url,
      });
    } else {
      router.push(`/courses/${courseId}/flashcards?docId=${resource.id}&docName=${encodeURIComponent(resource.name)}`);
    }
    setSourcePickerKind(null);
  };

  // Toggles a quiz or flashcard set between Public and Private after
  // creation. Mirrors the same publish/unpublish calls used at creation
  // time (2C/2D), just triggered from the RecentItemRow menu instead.
  const handleToggleVisibility = async (kind: 'flashcard' | 'quiz', id: string) => {
    if (!user) return;
    setTogglingVisibilityId(id);

    try {
      const collectionName = kind === 'flashcard' ? 'flashcardSets' : 'quizSets';
      const setRef = doc(db, 'users', user.uid, 'enrollment', courseId, collectionName, id);
      const current = kind === 'flashcard' ? flashcardSets : quizSets;
      const item = current.find((set) => set.id === id);
      const isCurrentlyPublic = item?.visibility === 'public';

      if (isCurrentlyPublic) {
        if (item?.publicSetId) {
          await unpublishStudySet(item.publicSetId, user.uid);
        }
        await updateDoc(setRef, { visibility: 'private' });
        return;
      }

      if (!courseCode) {
        console.error('Cannot publish study set: course code not loaded yet.');
        return;
      }

      const setSnap = await getDoc(setRef);
      if (!setSnap.exists()) return;
      const setData = setSnap.data();

      const publicSetId = await publishStudySet({
        type: kind === 'flashcard' ? 'flashcard' : 'quiz',
        setData:
          kind === 'flashcard'
            ? { name: setData.name, cards: setData.cards }
            : { name: setData.name, questions: setData.questions },
        courseCode,
        ownerUid: user.uid,
        originalPath: `users/${user.uid}/enrollment/${courseId}/${collectionName}/${id}`,
      });

      await updateDoc(setRef, { visibility: 'public', publicSetId });
    } catch (error) {
      console.error('Error toggling study set visibility:', error);
    } finally {
      setTogglingVisibilityId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      const collectionName = deleteTarget.kind === 'flashcard' ? 'flashcardSets' : 'quizSets';
      await deleteDoc(doc(db, 'users', user.uid, 'enrollment', courseId, collectionName, deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error('Error deleting item:', error);
    } finally {
      setDeleting(false);
    }
  };

  const learningPageText = [
    `${courseCode || courseDisplayName} — Learning page (create flashcards/quizzes from a document, or open an existing set).`,
    resources.length
      ? `Documents available to turn into flashcards/quizzes (${resources.length}): ${resources.map((r) => r.name).join(', ')}`
      : 'No documents uploaded to this class yet — the student needs to upload one before creating flashcards or a quiz.',
    `Existing flashcard sets: ${flashcardSets.length ? flashcardSets.map((s) => s.name).join(', ') : 'none yet'}`,
    `Existing quiz sets: ${quizSets.length ? quizSets.map((s) => s.name).join(', ') : 'none yet'}`,
  ].join('\n');
  const learningPageContext: PageTextPageContext | null =
    !loading ? { kind: 'page_text', courseId, pageTitle: `the ${courseCode || courseDisplayName} Learning page`, pageText: learningPageText } : null;
  const catalystSuggestions = learningPageContext ? buildPageTextSuggestions(learningPageContext) : [];

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-main">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main">
      <PageTutorial id="course-learning" steps={courseLearningSteps} />
      {/* Header */}
      <div className="flex min-h-[68px] items-center justify-between border-b border-border-light px-5 sm:px-8 lg:px-14">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="p-1.5 rounded-md hover:bg-bg-warm transition-colors"
          >
            <ArrowLeft size={20} className="text-text-main" />
          </button>
          <h1 className="ml-1 text-xl font-bold text-text-main">
            {courseInfoLoading ? 'Loading...' : courseDisplayName}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-14 lg:py-11">
        <div className="mb-7 max-w-2xl" data-tutorial="course-learning-heading">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-text-muted"><Sparkles size={16} /> Your study space</p>
          <h2 className="text-3xl font-bold tracking-tight text-text-main sm:text-4xl">What would you like to study?</h2>
          <p className="mt-3 text-base text-text-muted">Turn your course material into a quick check or a set of cards.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2" data-tutorial="course-learning-grid">
          <article className={`${styles.launchCard} ${styles.quizCard}`}>
            <div className={styles.launchCopy}>
              <span className={styles.cardIcon}><BookOpen size={20} /></span>
              <h3>Ready for a <span className={styles.marked}>quick quiz?</span></h3>
              <p>See what you remember. Choose a document and make a quiz that fits your study session.</p>
              <button type="button" onClick={() => setSourcePickerKind('quiz')} className={styles.launchButton}>Make a quiz <ArrowRight size={19} /></button>
            </div>
            <Image src="/illustrations/study/quiz-reader.png" alt="Student reading a book with hand-drawn stars" width={420} height={420} className={styles.launchIllustration} priority />
          </article>
          <article className={`${styles.launchCard} ${styles.flashcardCard}`}>
            <div className={styles.launchCopy}>
              <span className={styles.cardIcon}><Layers3 size={20} /></span>
              <h3>Make it stick with <span className={styles.marked}>flashcards.</span></h3>
              <p>Break a topic into cards you can review whenever you have a few minutes.</p>
              <button type="button" onClick={() => setSourcePickerKind('flashcard')} className={styles.launchButton}>Make flashcards <ArrowRight size={19} /></button>
            </div>
            <Image src="/illustrations/study/flashcard-student.png" alt="Student holding colorful flashcards" width={420} height={420} className={styles.launchIllustration} priority />
          </article>
        </div>

        <section className="mt-8 rounded-2xl border border-border-light bg-bg-container px-5 py-4 sm:px-6">
          <button type="button" onClick={() => setShowDocumentShortcuts((value) => !value)} aria-expanded={showDocumentShortcuts} className="flex w-full items-center justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <span><span className="block font-semibold text-text-main">Already have a document in mind?</span><span className="mt-0.5 block text-sm text-text-muted">Pick it first, then choose quiz or flashcards.</span></span>
            <span className="shrink-0 text-sm font-semibold text-text-main">{showDocumentShortcuts ? 'Hide' : 'Browse documents'}</span>
          </button>
          {showDocumentShortcuts && <div className="mt-5 grid gap-2 border-t border-border-light pt-5 sm:grid-cols-2 lg:grid-cols-3">
            {resources.length === 0 ? <p className="text-sm text-text-muted">No documents in this course yet.</p> : resources.map((resource) => <button key={resource.id} type="button" onClick={() => setSelectedResource(resource)} className="flex min-w-0 items-center gap-3 rounded-xl border border-border-light bg-bg-main p-3 text-left text-sm font-medium text-text-main hover:bg-bg-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><BookOpen size={18} className="shrink-0 text-text-muted" /><span className="truncate">{resource.name}</span></button>)}
          </div>}
        </section>

        {/* Recent Flashcard */}
        <div className="mt-12" data-tutorial="course-learning-recent">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#1a1a2e]">Recent Flashcard</h2>
            <SortDropdown value={flashcardSort} onChange={setFlashcardSort} />
          </div>

          {sortedFlashcardSets.length === 0 ? (
            <p className="px-1 py-6 text-sm text-text-muted">No flashcards yet</p>
          ) : (
            <div className="flex flex-col divide-y divide-border-light rounded-xl border border-border-light bg-bg-container">
              {sortedFlashcardSets.map((set) => (
                <RecentItemRow
                  key={set.id}
                  item={set}
                  courseId={courseId}
                  courseName={courseDisplayName}
                  kind="flashcard"
                  onDelete={(id) => setDeleteTarget({ id, kind: 'flashcard' })}
                  onToggleVisibility={(id) => handleToggleVisibility('flashcard', id)}
                  togglingVisibility={togglingVisibilityId === set.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Quizzes */}
        <div className="mt-10 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#1a1a2e]">Recent Quizzes</h2>
            <SortDropdown value={quizSort} onChange={setQuizSort} />
          </div>

          {sortedQuizSets.length === 0 ? (
            <p className="px-1 py-6 text-sm text-text-muted">No quizzes yet</p>
          ) : (
            <div className="flex flex-col divide-y divide-border-light rounded-xl border border-border-light bg-bg-container">
              {sortedQuizSets.map((set) => (
                <RecentItemRow
                  key={set.id}
                  item={set}
                  courseId={courseId}
                  courseName={courseDisplayName}
                  kind="quiz"
                  onDelete={(id) => setDeleteTarget({ id, kind: 'quiz' })}
                  onToggleVisibility={(id) => handleToggleVisibility('quiz', id)}
                  togglingVisibility={togglingVisibilityId === set.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {learningPageContext && catalystChatContext && (
        <>
          <CatalystLauncher onClick={() => setCatalystOpen(true)} visible={!catalystOpen} buttonRef={catalystBtnRef} />
          <ContextualAiPanel
            open={catalystOpen}
            onClose={() => setCatalystOpen(false)}
            contextLabel={`Learning — ${courseDisplayName}`}
            suggestions={catalystSuggestions}
            pageContext={learningPageContext}
            chatContext={catalystChatContext}
            panelContextKey={`learning:${courseId}`}
            launcherRef={catalystBtnRef}
          />
        </>
      )}

      <LectureChoiceModal
        open={!!selectedResource}
        documentName={selectedResource?.name ?? ''}
        onClose={() => setSelectedResource(null)}
        onSelectFlashcard={handleSelectFlashcard}
        onSelectQuiz={handleSelectQuiz}
      />

      <StudySourcePicker
        open={sourcePickerKind !== null}
        kind={sourcePickerKind ?? 'quiz'}
        resources={resources}
        onClose={() => setSourcePickerKind(null)}
        onSelect={handlePickSource}
      />

      <QuizSetupModal
        open={quizFromResource.open}
        documentName={quizFromResource.documentName}
        onClose={quizFromResource.close}
        onStart={quizFromResource.start}
        loading={quizFromResource.loading}
        error={quizFromResource.error}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Remove from folder"
        message="This will permanently delete this set. This action cannot be undone."
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
