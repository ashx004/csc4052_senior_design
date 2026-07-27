"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { useSetPageContext } from "@/src/context/AIPageContext";
import ClassCard, { ClassCardProps } from '@/src/components/classes/ClassCard';
import AddEnrollmentModal from '@/src/components/classes/AddEnrollmentModal';
import { doc, getDoc, collection, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { Minus } from "lucide-react";
import { Term } from "@/src/library/academicTerm";
import { EnrollmentStatus, getEnrollmentStatus } from "@/src/library/enrollmentStatus";

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
    // Structured mirrors of classCode/term, added alongside the original
    // free-text fields so nothing existing breaks. Populated for new
    // enrollments via AddEnrollmentModal; absent on older docs, which fall
    // back to parseTermString/parseCourseCode (src/library/academicTerm.ts)
    // wherever structured data is needed.
    termSeason?: Term;
    termYear?: number;
    subject?: string;
    courseNumber?: string;
    // Curriculum-progress tracking, additive — docs without it are treated
    // as "in-progress" via getEnrollmentStatus (src/library/enrollmentStatus.ts).
    status?: EnrollmentStatus;
    // Self-reported — no external source has credit-hour/prerequisite data
    // for arbitrary courses (confirmed during the Advising work: the
    // scraped course-offering source only has offering history, not a full
    // catalog). Used for a simple "credits completed" tally on Advising;
    // prerequisites is free text since there's no structured course list to
    // validate against.
    creditHours?: number;
    prerequisites?: string;
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
            status: getEnrollmentStatus(data),
        });
    });

    return enrollments;
}

function buildClassesSummary(activeClasses: ClassCardProps[]): string {
    if (activeClasses.length === 0) {
        return "The student has no active classes added yet.";
    }
    const list = activeClasses.map((c) => `${c.classCode} — ${c.className} (${c.term})`).join(", ");
    return `The student's active classes on this page: ${list}.`;
}

export default function Classes() {
    const { user, loading } = useAuth();
    const [enrollments, setEnrollments] = useState<ClassCardProps[]>([]);
    const [deleteMode, setDeleteMode] = useState(false);
    // Holds the class being asked about — offers "mark completed" as a real
    // alternative to permanent deletion, instead of just a plain confirm.
    const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

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

    const handlePermanentDelete = async (classId: string) => {
        if (!user) return;

        try {
            const docRef = doc(db, "users", user.uid, "enrollment", classId);
            await deleteDoc(docRef);
            refreshEnrollments();
        } catch (error) {
            console.error("Error deleting class document from database: ", error);
            alert("Failed to delete the class. Please try again.");
        } finally {
            setConfirmingDeleteId(null);
        }
    };

    const handleMarkCompletedOnDelete = async (classId: string) => {
        if (!user) return;

        try {
            const docRef = doc(db, "users", user.uid, "enrollment", classId);
            await updateDoc(docRef, { status: "completed" });
            refreshEnrollments();
        } catch (error) {
            console.error("Error marking class completed: ", error);
            alert("Failed to update the class. Please try again.");
        } finally {
            setConfirmingDeleteId(null);
        }
    };

    // Trigger state fetch when the authentic user context resolves
    useEffect(() => {
        refreshEnrollments();
    }, [user]);

    // Completed classes move to Advising's "Completed courses" section
    // instead of cluttering the active list here.
    const activeEnrollments = useMemo(
        () => enrollments.filter((e) => e.status !== "completed"),
        [enrollments]
    );

    useSetPageContext(
        { page: "classes", label: "Classes", summary: buildClassesSummary(activeEnrollments) },
        [activeEnrollments]
    );

    const confirmingClass = enrollments.find((e) => e.classId === confirmingDeleteId);

    // Combined/Cleaned condition checks (No duplicates)
    if (loading) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-bg-main">
                <p className="text-lg text-text-muted">Loading...</p>
            </div>
        );
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-bg-main">
            <AddEnrollmentModal
                onEnrollmentAdded={refreshEnrollments}
                deleteMode={deleteMode}
                onToggleDeleteMode={() => setDeleteMode((d) => !d)}
            />

            {confirmingClass && confirmingClass.classId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-lg bg-bg-container p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-text-main">Remove {confirmingClass.className}?</h3>
                        <p className="mt-2 text-sm text-text-muted">
                            If you've finished this class, mark it completed to keep it in your course history —
                            it'll show up under Advising's completed courses. Otherwise, delete it permanently.
                        </p>
                        <div className="mt-5 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => confirmingClass.classId && handleMarkCompletedOnDelete(confirmingClass.classId)}
                                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
                            >
                                Mark as completed
                            </button>
                            <button
                                type="button"
                                onClick={() => confirmingClass.classId && handlePermanentDelete(confirmingClass.classId)}
                                className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                            >
                                Delete permanently
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(null)}
                                className="rounded-md border border-border-light px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-warm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeEnrollments.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-screen py-2">
                    <h1 className="text-4xl font-bold mb-8">Classes</h1>
                    <p className="text-lg text-text-muted">No classes found. Please add a new class.</p>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center min-h-screen py-2 mx-10">
                    <h1 className="text-4xl font-bold mb-8">Classes</h1>
                    <div className="flex flex-wrap justify-center gap-8">
                        {activeEnrollments.map((enrollment) => (
                            <div key={enrollment.classId} className="relative">
                                <ClassCard {...enrollment} />
                                {deleteMode && (
                                    <button
                                        onClick={() => enrollment.classId && setConfirmingDeleteId(enrollment.classId)}
                                        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
                                        aria-label={`Remove ${enrollment.className}`}
                                    >
                                        <Minus size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
