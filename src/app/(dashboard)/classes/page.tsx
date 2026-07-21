"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/src/context/AuthContext";
import ClassCard, { ClassCardProps } from '@/src/components/classes/ClassCard';
import AddEnrollmentModal from '@/src/components/classes/AddEnrollmentModal';
import { doc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { Minus } from "lucide-react";

// database fields that a class should have (YOU MUST FOLLOW THIS STRUCTURE IF YOU INSERT A CLASS!!!!)
// note that only className, classCode, and term are required, the rest are optional
export interface EnrollmentFields {
    className: string;
    classCode: string;
    term: string;
    time: string;
    facultyPhoneNumber: string;
    facultyOfficeNumber: string;
    facultyEmail: string;
    facultyName: string;
    classSchedule: string;
    classRoom?: string;
    classDescription?: string;
}

async function getEnrollment(
    userId: string,
    enrollmentId: string
): Promise<EnrollmentFields | null> {
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

export default function Classes() {
    const { user, loading } = useAuth();
    const [enrollments, setEnrollments] = useState<ClassCardProps[]>([]);
    const [deleteMode, setDeleteMode] = useState(false);

    // Define the data re-fetch function cleanly
    const refreshEnrollments = () => {
        if (!user) return;
        
        getAllEnrollments(user.uid)
            .then(setEnrollments)
            .catch((error) => {
                console.error("Error refreshing enrollments: ", error);
                setEnrollments([]);
            });
    };

    const handleDeleteClass = async (classId: string) => {
        if (!user) return;

        const confirmDelete = window.confirm("Are you sure you want to delete this class?");
        if (!confirmDelete) return;

        try {
            const docRef = doc(db, "users", user.uid, "enrollment", classId);
            await deleteDoc(docRef);
            refreshEnrollments();
        } catch (error) {
            console.error("Error deleting class document from database: ", error);
            alert("Failed to delete the class. Please try again.");
        }
    };

    // Trigger state fetch when the authentic user context resolves
    useEffect(() => {
        refreshEnrollments();
    }, [user]);

    // Combined/Cleaned condition checks (No duplicates)
    if (loading) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-bg-main">
                <p className="text-lg text-text-muted">Loading...</p>
            </div>
        );
    }

    // View state when no classes are found in Firestore
    if (enrollments.length === 0) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-bg-main">
                <AddEnrollmentModal
                    onEnrollmentAdded={refreshEnrollments}
                    deleteMode={deleteMode}
                    onToggleDeleteMode={() => setDeleteMode((d) => !d)}
                />
                <div className="flex flex-col items-center justify-center min-h-screen py-2">
                    <h1 className="text-4xl font-bold mb-8">Classes</h1>
                    <p className="text-lg text-text-muted">No classes found. Please add a new class.</p>
                </div>
            </div>
        )
    }

    // Default view layout when user has active class cards
    return (
        <div className="relative flex min-h-screen items-center justify-center bg-bg-main">
            <AddEnrollmentModal
                onEnrollmentAdded={refreshEnrollments}
                deleteMode={deleteMode}
                onToggleDeleteMode={() => setDeleteMode((d) => !d)}
            />
            <div className="flex flex-col items-center justify-center min-h-screen py-2 mx-10">
                <h1 className="text-4xl font-bold mb-8">Classes</h1>
                <div className="flex flex-wrap justify-center gap-8">
                    {enrollments.map((enrollment) => (
                        <div key={enrollment.classId} className="relative">
                            <ClassCard {...enrollment} />
                            {deleteMode && (
                                <button
                                    onClick={() => enrollment.classId && handleDeleteClass(enrollment.classId)}
                                    className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
                                    aria-label={`Delete ${enrollment.className}`}
                                >
                                    <Minus size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}