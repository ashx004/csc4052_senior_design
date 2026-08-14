'use client';

import { useParams } from 'next/navigation';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';

export default function CourseAssignments() {
  const params = useParams();
  const courseId = params.courseId as string;
  const { displayName, loading } = useCourseInfo(courseId);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">
        Assignments — {loading ? 'Loading...' : displayName}
      </h1>
    </div>
  );
}
