'use client';

import { useParams } from 'next/navigation';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';

export default function CourseDueDates() {
  const params = useParams();
  const courseId = params.courseId as string;
  const { displayName, loading } = useCourseInfo(courseId);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">
        Due Dates — {loading ? 'Loading...' : displayName}
      </h1>
    </div>
  );
}
