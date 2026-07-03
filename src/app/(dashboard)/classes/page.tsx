import ClassCard, { ClassCardProps } from '@/src/components/ClassCard';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/src/library/firebase';

// database fields that a class should have
// note that only className, classCode, and term are required, the rest are optional
export interface ClassProps {
    className: string;
    classCode: string;
    term: string;
    time?: string;
    facultyPhoneNumber?: string;
    facultyOfficeNumber?: string;
    facultyEmail?: string;
    facultyName?: string;
    classSchedule?: string;
}

// TODO: test with auth when implemented
// the hope is that the auth system will store UID once logged in so we can route grab classes for the current user
async function getEnrollment(
    userId: string,
    enrollmentId: string
): Promise<ClassProps | null> {
    const docRef = doc(db, "users", userId, "enrollment", enrollmentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        console.log("No such document!");
        return null;
    }

    const data = docSnap.data();
    
    return {
        className: data.className,
        classCode: data.classCode,
        term: data.term,
        time: data.time,
        facultyPhoneNumber: data.facultyPhoneNumber,
        facultyOfficeNumber: data.facultyOfficeNumber,
        facultyEmail: data.facultyEmail,
        facultyName: data.facultyName,
        classSchedule: data.classSchedule
    }
}

// TODO: test with auth when implemented
async function getAllEnrollments(userId: string): Promise<ClassCardProps[]> {
    const enrollmentRef = collection(db, "users", userId, "enrollment");
    const querySnapshot = await getDocs(enrollmentRef);
    let enrollments: ClassCardProps[] = [];

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        enrollments.push({
            classId: doc.id,
            className: data.className,
            classCode: data.classCode,
            term: data.term,
        });
    });

    return enrollments;
}

export default async function Classes() {
    // TODO: when auth is implemented, replace "12345678" with the current user's ID
    const enrollments: ClassCardProps[] = await getAllEnrollments("12345678").then((enrollments) => {
        return enrollments;
    }).catch((error) => {
        console.error("Error getting enrollments: ", error);
        return [];
    });

    enrollments.forEach((enrollment) => {
        console.log(enrollment);
    });

    return (
        <div className="flex min-h-screen items-center justify-center bg-orange-50">
            <div className="flex flex-col items-center justify-center min-h-screen py-2">
                <h1 className="text-4xl font-bold mb-8">Classes</h1>
                <div className="flex flex-wrap justify-center gap-8">
                    {enrollments.map((enrollment) => (
                        <ClassCard key={enrollment.classId} {...enrollment} />
                    ))}
                </div>
            </div>
        </div>
    );
}