'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { getCourseResources } from '@/src/components/resourceManagement/fileUploadService';
import { ArrowLeft, FileEdit, BookOpen, Bookmark, Loader2 } from 'lucide-react';
import PdfThumbnail from '@/src/components/learning/PdfThumbnail';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';

interface Resource {
  id: string;
  name: string;
  url: string;
  fileType: string;
  category: string;
}

export default function CourseLearningPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const courseId = params.courseId as string;
  const { displayName: courseDisplayName, loading: courseInfoLoading } = useCourseInfo(courseId);

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

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

      {/* Document grid */}
      <div className="px-6 py-6">
        <p className="text-left text-gray-500 text-md mb-6">
          Choose a Lecture and make your own flashcard
        </p>
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
                onClick={() =>
                  router.push(
                    `/courses/${courseId}/flashcards?docId=${resource.id}&docName=${encodeURIComponent(resource.name)}`
                  )
                }
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
      </div>
    </div>
  );
}