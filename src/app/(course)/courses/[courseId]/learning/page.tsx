'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { ArrowLeft, FileEdit, BookOpen, Bookmark, Loader2 } from 'lucide-react';
import PdfThumbnail from '@/src/components/learning/PdfThumbnail';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import RecentItemRow, { RecentItem } from '@/src/components/learning/RecentItemRow';
import SortDropdown, { SortOption } from '@/src/components/learning/SortDropdown';
import LectureChoiceModal from '@/src/components/learning/LectureChoiceModal';
import ConfirmDeleteModal from '@/src/components/learning/ConfirmDeleteModal';
import QuizSetupModal from '@/src/components/quizzes/QuizSetupModal';

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
  const { displayName: courseDisplayName, loading: courseInfoLoading } = useCourseInfo(courseId);

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  const [flashcardSets, setFlashcardSets] = useState<RecentItem[]>([]);
  const [flashcardSort, setFlashcardSort] = useState<SortOption>('recent');

  const [quizSets, setQuizSets] = useState<RecentItem[]>([]);
  const [quizSort, setQuizSort] = useState<SortOption>('recent');

  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [quizDocument, setQuizDocument] = useState<Resource | null>(null);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

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

  // Recent quizzes — the quizSets collection does not exist yet, so this stays empty
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
    setQuizDocument(selectedResource);
    setSelectedResource(null);
    setQuizError(null);
  };

  const handleStartQuiz = async (config: {
    questionCount: number;
    questionTypes: { multipleChoice: boolean; trueFalse: boolean };
  }) => {
    if (!user || !quizDocument) return;
    setQuizGenerating(true);
    setQuizError(null);

    try {
      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docUrl: quizDocument.url,
          docName: quizDocument.name,
          questionCount: config.questionCount,
          questionTypes: config.questionTypes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate quiz.');
      }

      const sourceDocKey = extractStorageKey(quizDocument.url);
      const setsRef = collection(db, 'users', user.uid, 'enrollment', courseId, 'quizSets');
      const newDoc = await addDoc(setsRef, {
        name: data.topicName,
        sourceDocKey,
        questions: data.questions,
        questionTypes: config.questionTypes,
        questionCount: data.questions.length,
        pinned: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setQuizDocument(null);
      router.push(`/courses/${courseId}/quizzes/${newDoc.id}`);
    } catch (err) {
      console.error('Error generating quiz:', err);
      setQuizError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setQuizGenerating(false);
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

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAF8]">
        <Loader2 size={32} className="animate-spin text-[#8B6914]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex items-center justify-between px-14 py-7 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-[#1a1a2e]">
            {courseInfoLoading ? 'Loading...' : courseDisplayName}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors">
            <BookOpen size={20} className="text-gray-500" />
          </button>
          <button className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors">
            <Bookmark size={20} className="text-gray-500" />
          </button>
        </div>
      </div>

      <div className="px-14 py-6">
        {/* Page header */}
        <h2 className="text-left text-lg font-bold text-[#1a1a2e] mb-6">
          Choose A Lecture And Make Your Own Flashcard Or Quizzes
        </h2>

        {/* Document grid */}
        {resources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BookOpen size={48} className="mb-4" />
            <p className="text-lg font-medium">No documents yet</p>
            <p className="text-sm mt-1">Upload resources to your course to start learning</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {resources.map((resource, index) => (
              <button
                key={resource.id}
                onClick={() => setSelectedResource(resource)}
                className="text-left rounded-xl overflow-hidden border border-gray-100
                           hover:shadow-md transition-shadow bg-white group"
              >
                {/* Document preview */}
                {resource.name?.toLowerCase().endsWith('.pdf') ? (
                  <PdfThumbnail url={resource.url} className="h-36" />
                ) : (
                  <div className="h-36 bg-[#E8E3DA] flex items-center justify-center">
                    <FileEdit
                      size={36}
                      className="text-[#8B7B5E] opacity-50 group-hover:opacity-75 transition-opacity"
                    />
                  </div>
                )}

                {/* Card info */}
                <div className="bg-[#F0EBE1] px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileEdit size={14} className="text-[#8B7B5E]" />
                    <span className="text-[10px] font-semibold tracking-wider text-[#8B7B5E] uppercase">
                      NOTE {index + 1}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#1a1a2e] leading-snug truncate">
                    {resource.name}
                  </h3>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Recent Flashcard */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#1a1a2e]">Recent Flashcard</h2>
            <SortDropdown value={flashcardSort} onChange={setFlashcardSort} />
          </div>

          {sortedFlashcardSets.length === 0 ? (
            <p className="px-1 py-6 text-sm text-gray-400">No flashcards yet</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
              {sortedFlashcardSets.map((set) => (
                <RecentItemRow
                  key={set.id}
                  item={set}
                  courseId={courseId}
                  courseName={courseDisplayName}
                  kind="flashcard"
                  onDelete={(id) => setDeleteTarget({ id, kind: 'flashcard' })}
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
            <p className="px-1 py-6 text-sm text-gray-400">No quizzes yet</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
              {sortedQuizSets.map((set) => (
                <RecentItemRow
                  key={set.id}
                  item={set}
                  courseId={courseId}
                  courseName={courseDisplayName}
                  kind="quiz"
                  onDelete={(id) => setDeleteTarget({ id, kind: 'quiz' })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <LectureChoiceModal
        open={!!selectedResource}
        documentName={selectedResource?.name ?? ''}
        onClose={() => setSelectedResource(null)}
        onSelectFlashcard={handleSelectFlashcard}
        onSelectQuiz={handleSelectQuiz}
      />

      <QuizSetupModal
        open={!!quizDocument}
        documentName={quizDocument?.name ?? ''}
        onClose={() => {
          setQuizDocument(null);
          setQuizError(null);
        }}
        onStart={handleStartQuiz}
        loading={quizGenerating}
        error={quizError}
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
