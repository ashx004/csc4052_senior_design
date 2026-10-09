"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import CourseSidebar from "@/src/components/Sidebar/CourseSidebar";
import TopBar from "@/src/components/search/TopBar";
import { courseSearchEntries } from "@/src/library/search/siteSearchIndex";
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
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [courseName, setCourseName] = useState<string | null>(null);
  // This class's own sections, so the top-bar search can jump straight to them.
  const courseEntries = useMemo(() => courseSearchEntries(courseId, courseName), [courseId, courseName]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    getEnrollmentName(user.uid, courseId)
      .then(setCourseName)
      .catch((error) => {
        console.error("Error getting enrollment name: ", error);
        setCourseName(null);
      });
  }, [user, authLoading, courseId, router]);

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAF7F0]">
        <Loader2 size={24} className="animate-spin text-[#B08957]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <CourseSidebar courseId={courseId} courseName={courseName ?? undefined} />
      {/* The top bar (site search) also holds the phones' fixed menu
          button (Sidebar.tsx), so pages no longer need padding to clear it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar extraSearchEntries={courseEntries} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
