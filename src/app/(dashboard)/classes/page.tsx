"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/src/context/AuthContext";
import ClassCard, { ClassCardProps } from '@/src/components/classes/ClassCard';
import AddEnrollmentModal from '@/src/components/classes/AddEnrollmentModal';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/src/library/firebase';

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

    useEffect(() => {
        if (!user) return;

        getAllEnrollments(user.uid)
            .then(setEnrollments)
            .catch((error) => {
                console.error("Error getting enrollments: ", error);
                setEnrollments([]);
            });
    }, [user]);

    if (loading) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-orange-50">
                <p className="text-lg text-gray-700">Loading...</p>
            </div>
        );
    }

    if (enrollments.length === 0) {
        return (
            <div className="relative flex min-h-screen items-center justify-center bg-orange-50">
                <AddEnrollmentModal />
                <div className="flex flex-col items-center justify-center min-h-screen py-2">
                    <h1 className="text-4xl font-bold mb-8">Classes</h1>
                    <p className="text-lg text-gray-700">No classes found. Please add a new class.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center bg-orange-50">
            <AddEnrollmentModal />
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