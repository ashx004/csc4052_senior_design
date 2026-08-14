import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { ClassCardProps } from "@/src/components/classes/ClassCard";
import { getEnrollmentStatus } from "@/src/library/enrollmentStatus";

export async function getAllEnrollments(
  userId: string
): Promise<ClassCardProps[]> {
  const enrollmentRef = collection(
    db,
    "users",
    userId,
    "enrollment"
  );

  const querySnapshot = await getDocs(enrollmentRef);

  const enrollments: ClassCardProps[] = [];

  querySnapshot.forEach((enrollmentDocument) => {
    const data = enrollmentDocument.data();

    enrollments.push({
      classId: enrollmentDocument.id,
      className: data.className,
      classCode: data.classCode,
      term: data.term,
      color: data.color,
      status: getEnrollmentStatus(data),
    });
  });

  return enrollments;
}