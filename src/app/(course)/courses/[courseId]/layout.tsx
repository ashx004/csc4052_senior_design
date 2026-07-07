import CourseSidebar from "@/src/components/Sidebar/CourseSidebar";
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';

// TODO: test with auth when implemented
async function getEnrollmentName(userId: string, enrollmentId: string): Promise<string | null> {
    const docRef = doc(db, "users", userId, "enrollment", enrollmentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        console.log("No such document!");
        return null;
    }

    return docSnap.data().className ?? null;
}

export default async function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  // TODO: when auth is implemented, replace "12345678" with the current user's ID
  const courseName = await getEnrollmentName("12345678", courseId).catch((error) => {
    console.error("Error getting enrollment name: ", error);
    return null;
  });

  return (
    <div className="flex h-screen">
      <CourseSidebar courseId={courseId} courseName={courseName ?? undefined} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}