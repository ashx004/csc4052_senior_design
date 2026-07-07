'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileEdit, BookOpen, Bookmark } from 'lucide-react';

// Mock data — will be replaced with getCourseResources() in Phase 2
const mockDocuments = [
  { id: 'doc-1', label: 'NOTE 1', title: 'Binary Addition.pdf', type: 'pdf' },
  { id: 'doc-2', label: 'NOTE 2', title: 'Bash Terminal Creation', type: 'pdf' },
  { id: 'doc-3', label: 'NOTE 3', title: 'Culture Assessment', type: 'docx' },
  { id: 'doc-4', label: 'NOTE 4', title: 'Data Structures Overview', type: 'pdf' },
  { id: 'doc-5', label: 'NOTE 5', title: 'Sorting Algorithms', type: 'pdf' },
  { id: 'doc-6', label: 'NOTE 6', title: 'Recursion Basics', type: 'pdf' },
];

export default function CourseLearningPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const displayName = courseId.replace(/-/g, ' ').toUpperCase();

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-md hover:bg-[#F5F0EB] transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-[#1a1a2e]">{displayName}</h1>
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
      <div className="px-6 py-8">
        {mockDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BookOpen size={48} className="mb-4" />
            <p className="text-lg font-medium">No documents yet</p>
            <p className="text-sm mt-1">Upload resources to your course to start learning</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {mockDocuments.map((doc) => (
              <button
                key={doc.id}
                onClick={() =>
                  router.push(
                    `/courses/${courseId}/flashcards?docId=${doc.id}&docName=${encodeURIComponent(doc.title)}`
                  )
                }
                className="text-left rounded-xl overflow-hidden border border-gray-100 
                           hover:shadow-md transition-shadow bg-white group"
              >
                {/* Preview placeholder — will show real thumbnail in Phase 2 */}
                <div className="h-36 bg-[#E8E3DA] flex items-center justify-center">
                  <FileEdit size={36} className="text-[#8B7B5E] opacity-50 group-hover:opacity-75 transition-opacity" />
                </div>

                {/* Card info */}
                <div className="bg-[#F0EBE1] px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileEdit size={14} className="text-[#8B7B5E]" />
                    <span className="text-[10px] font-semibold tracking-wider text-[#8B7B5E] uppercase">
                      {doc.label}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#1a1a2e] leading-snug">
                    {doc.title}
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