"use client";

import { use, useEffect, useState } from "react";
import CourseSidebar from "@/src/components/Sidebar/CourseSidebar";
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { useAuth } from "@/src/context/AuthContext";

async function getEnrollmentName(userId: string, enrollmentId: string): Promise<string | null> {
    const docRef = doc(db, "users", userId, "enrollment", enrollmentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        console.log("No such document!");
        return null;
    }

    return docSnap.data().className ?? null;
}

export default function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [courseName, setCourseName] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    getEnrollmentName(user.uid, courseId)
      .then(setCourseName)
      .catch((error) => {
        console.error("Error getting enrollment name: ", error);
        setCourseName(null);
      });
  }, [user, authLoading, courseId]);

  return (
    <div className="flex h-screen">
      <CourseSidebar courseId={courseId} courseName={courseName ?? undefined} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}