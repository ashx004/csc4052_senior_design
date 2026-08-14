'use client';

import { useParams } from 'next/navigation';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';

export default function CourseNotes() {
  const params = useParams();
  const courseId = params.courseId as string;
  const { displayName, loading } = useCourseInfo(courseId);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">
        Notes — {loading ? 'Loading...' : displayName}
      </h1>
    </div>
  );
}
