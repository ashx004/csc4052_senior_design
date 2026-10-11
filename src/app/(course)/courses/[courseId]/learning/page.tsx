'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { useChatContext } from '@/src/hooks/useChatContext';
import ContextualAiPanel, { CatalystLauncher } from '@/src/components/aiAssistant/ContextualAiPanel';
import { buildPageTextSuggestions, type PageTextPageContext } from '@/src/library/Contextual_AI/contextualAi';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import {
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import ConfirmDeleteModal from '@/src/components/learning/ConfirmDeleteModal';
import RecentStudySets from '@/src/components/learning/RecentStudySets';
import StudyLaunch, { StudySpaceHeading } from '@/src/components/learning/StudyLaunch';
import { useStudySets } from '@/src/hooks/useStudySets';
import { publishStudySet } from '@/src/library/discover/publishStudySet';
import { unpublishStudySet } from '@/src/library/discover/unpublishStudySet';
import PageTutorial from '@/src/components/tutorial/PageTutorial';
import courseLearningSteps from '@/src/library/tutorials/steps/course-learning';
interface Resource {
  id: string;
  name: string;
  url: string;
  fileType: string;
  category: string;
}

type DeleteTarget = { id: string; kind: 'flashcard' | 'quiz' };

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

  const { flashcards, quizzes, loading: setsLoading, error: setsError } = useStudySets(courseId);
  const [documentEntry, setDocumentEntry] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const searchParams = useSearchParams();
  const quizFromId = searchParams.get('quizFrom');
  const handledQuizFromRef = useRef<string | null>(null);

  useEffect(() => {
    if (!quizFromId || loading || handledQuizFromRef.current === quizFromId) return;
    const resource = resources.find((item) => item.id === quizFromId);
    if (!resource) return;
    handledQuizFromRef.current = quizFromId;
    setDocumentEntry([resource.id]);
  }, [quizFromId, loading, resources]);

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

  // Toggles a quiz or flashcard set between Public and Private after
  // creation. Mirrors the same publish/unpublish calls used at creation
  // time (2C/2D), just triggered from the RecentItemRow menu instead.
  const handleToggleVisibility = async (kind: 'flashcard' | 'quiz', id: string) => {
    if (!user) return;
    setTogglingVisibilityId(id);

    try {
      const collectionName = kind === 'flashcard' ? 'flashcardSets' : 'quizSets';
      const setRef = doc(db, 'users', user.uid, 'enrollment', courseId, collectionName, id);
      const current = kind === 'flashcard' ? flashcards : quizzes;
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
    `Existing flashcard sets: ${flashcards.length ? flashcards.map((s) => s.name).join(', ') : 'none yet'}`,
    `Existing quiz sets: ${quizzes.length ? quizzes.map((s) => s.name).join(', ') : 'none yet'}`,
  ].join('\n');
  const learningPageContext: PageTextPageContext | null =
    !loading ? { kind: 'page_text', courseId, pageTitle: `the ${courseCode || courseDisplayName} Learning page`, pageText: learningPageText } : null;
  const catalystSuggestions = learningPageContext ? buildPageTextSuggestions(learningPageContext) : [];

  if (authLoading || loading || setsLoading) {
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
        {setsError && <p role="alert" className="mb-5 text-sm text-red-700">Could not load some saved study sets. Please try again.</p>}
        <StudySpaceHeading />
        <StudyLaunch courseId={courseId} variant="hero" initialKind={documentEntry.length ? 'quiz' : undefined} preselectedIds={documentEntry} />
        <RecentStudySets
          flashcards={flashcards.slice(0, 4)}
          quizzes={quizzes.slice(0, 4)}
          courseId={courseId}
          onDelete={setDeleteTarget}
          onToggleVisibility={handleToggleVisibility}
          togglingVisibilityId={togglingVisibilityId}
        />
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
