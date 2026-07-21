"use client";

import { useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import { Pencil, Loader2, X } from 'lucide-react';
import CircleIconButton from '@/src/components/resourceManagement/CircleIconButton';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { EnrollmentFields } from '@/src/app/(dashboard)/classes/page';
import { useAuth } from '@/src/context/AuthContext';

// Lazy-loaded: pulls in docx-preview, pdfjs-dist, xlsx, and syntax
// highlighting — heavy, and not needed until this section actually renders.
const ResourcePreview = dynamic(() => import('@/src/components/resourceManagement/ResourcePreview'), {
  loading: () => <p className="text-sm text-text-muted">Loading resources…</p>,
  ssr: false,
});

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
        classSchedule: data.classSchedule,
        classRoom: data.classRoom,
        classDescription: data.classDescription,
    };
}

function formatPhoneNumber(phone?: string): string {
    if (!phone) return "Not provided";
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

type EditSection = "details" | "instructor" | null;

const DETAIL_FIELDS: { key: keyof EnrollmentFields; label: string; multiline?: boolean }[] = [
    { key: "classSchedule", label: "Schedule" },
    { key: "time", label: "Time" },
    { key: "classRoom", label: "Classroom" },
    { key: "classDescription", label: "Description", multiline: true },
];

const INSTRUCTOR_FIELDS: { key: keyof EnrollmentFields; label: string; multiline?: boolean }[] = [
    { key: "facultyName", label: "Name" },
    { key: "facultyOfficeNumber", label: "Office" },
    { key: "facultyEmail", label: "Email" },
    { key: "facultyPhoneNumber", label: "Phone" },
];

export default function CourseOverview({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    const { courseId } = use(params);

    const { user, loading: authLoading } = useAuth();

    const [enrollment, setEnrollment] = useState<EnrollmentFields | null>(null);
    const [pageLoading, setPageLoading] = useState(true);

    const [editingSection, setEditingSection] = useState<EditSection>(null);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        // Halt processing if the context session payload is still resolving
        if (authLoading) return;

        async function fetchCourseData() {
            try {
                // Securely query Firestore using the active user's authentic UID
                if (user?.uid) {
                    const courseData = await getEnrollment(user.uid, courseId);
                    setEnrollment(courseData);
                } else {
                    setEnrollment(null);
                }
            } catch (err) {
                console.error("Error fetching enrollment:", err);
            } finally {
                setPageLoading(false);
            }
        }
        
        fetchCourseData();
    }, [courseId, user, authLoading]);

    function openEdit(section: "details" | "instructor") {
        if (!enrollment) return;
        const fields = section === "details" ? DETAIL_FIELDS : INSTRUCTOR_FIELDS;
        const initial: Record<string, string> = {};
        fields.forEach(({ key }) => {
            initial[key] = (enrollment[key] as string) || "";
        });
        setEditValues(initial);
        setEditingSection(section);
    }

    async function handleSaveEdit() {
        if (!editingSection || !user?.uid) return;
        setSavingEdit(true);
        try {
            // Updated to route updates back to the authentic user space
            const docRef = doc(db, "users", user.uid, "enrollment", courseId);
            await updateDoc(docRef, editValues);
            setEnrollment((prev) => (prev ? ({ ...prev, ...editValues } as EnrollmentFields) : prev));
            setEditingSection(null);
        } catch (err) {
            console.error("Error saving edit:", err);
            alert("Couldn't save changes. Please try again.");
        } finally {
            setSavingEdit(false);
        }
    }

    // Page shell renders immediately — only the parts that actually depend on
    // Firestore data show a skeleton, instead of blanking the whole screen
    // behind one spinner until both auth and the fetch resolve.
    if (authLoading || pageLoading) {
        return (
            <div className="min-h-screen bg-bg-main px-6 py-10 sm:px-10">
                <div className="mx-auto max-w-4xl animate-pulse">
                    <div className="mb-8">
                        <div className="h-4 w-40 rounded bg-border-light" />
                        <div className="mt-3 h-8 w-72 rounded bg-border-light" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="h-40 rounded-xl bg-white shadow-sm ring-1 ring-border-light" />
                        <div className="h-40 rounded-xl bg-white shadow-sm ring-1 ring-border-light" />
                    </div>
                    <div className="mt-6 h-32 rounded-xl bg-white shadow-sm ring-1 ring-border-light" />
                </div>
            </div>
        );
    }

    // UNAUTHENTICATED SAFETY BLOCK
    if (!user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-bg-main">
                <div className="text-center">
                    <h1 className="text-xl font-semibold text-text-main">Access Denied</h1>
                    <p className="mt-1 text-sm text-text-muted">Please log in to view your dashboard resources.</p>
                </div>
            </div>
        );
    }

    if (!enrollment) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-bg-main">
                <div className="text-center">
                    <h1 className="text-xl font-semibold text-text-main">Course not found</h1>
                    <p className="mt-1 text-sm text-text-muted">We couldn&apos;t find a class with that ID.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bg-main px-6 py-10 sm:px-10">
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="font-medium text-primary">{enrollment.classCode}</span>
                        <span>&middot;</span>
                        <span>{enrollment.term}</span>
                    </div>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-main">
                        {enrollment.className}
                    </h1>
                </div>

                {/* Info cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border-light">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-text-main">Class Details</h2>
                            <CircleIconButton
                                icon={<Pencil size={14} />}
                                ariaLabel="Edit class details"
                                size="sm"
                                onClick={() => openEdit("details")}
                            />
                        </div>
                        <dl className="mt-4 space-y-3">
                            <div className="flex mt-4 space-x-[20%]">
                                <div>
                                    <dt className="text-xs text-text-muted">Schedule</dt>
                                    <dd className="mt-0.5 text-sm text-text-main">{enrollment.classSchedule || "Not provided"}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-text-muted">Time</dt>
                                    <dd className="mt-0.5 text-sm text-text-main">{enrollment.time || "Not provided"}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-text-muted">Classroom</dt>
                                    <dd className="mt-0.5 text-sm text-text-main">{enrollment.classRoom || "Not provided"}</dd>
                                </div>
                            </div>
                            <div>
                                <dt className="text-xs text-text-muted">Description</dt>
                                <dd className="mt-0.5 text-sm text-text-main">{enrollment.classDescription || "Not provided"}</dd>
                            </div>
                        </dl>
                    </div>

                    {/* Instructor Card */}
                    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-border-light">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-text-main">Instructor</h2>
                            <CircleIconButton
                                icon={<Pencil size={14} />}
                                ariaLabel="Edit instructor info"
                                size="sm"
                                onClick={() => openEdit("instructor")}
                            />
                        </div>
                        <dl className="mt-4 space-y-3">
                            <div>
                                <dt className="text-xs text-text-muted">Name</dt>
                                <dd className="mt-0.5 text-sm text-text-main">{enrollment.facultyName || "Not provided"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-text-muted">Office</dt>
                                <dd className="mt-0.5 text-sm text-text-main">{enrollment.facultyOfficeNumber || "Not provided"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-text-muted">Email</dt>
                                <dd className="mt-0.5 text-sm">
                                    {enrollment.facultyEmail ? (
                                        <a href={`mailto:${enrollment.facultyEmail}`} className="text-primary hover:underline">
                                            {enrollment.facultyEmail}
                                        </a>
                                    ) : (
                                        <span className="text-text-main">Not provided</span>
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-text-muted">Phone</dt>
                                <dd className="mt-0.5 text-sm text-text-main">{formatPhoneNumber(enrollment.facultyPhoneNumber)}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Course Resources */}
                <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-border-light">
                    <h2 className="text-sm font-semibold text-text-main mb-4">Course Resources</h2>
                    {/* PASSING DOWN DYNAMIC CURRENT USER ID TO CLEANLY REROUTE CAROUSEL MINIO FETCHES */}
                    <ResourcePreview userId={user.uid} courseId={courseId} />
                </div>
            </div>

            {/* Edit modal — shared between Class Details and Instructor */}
            {editingSection && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !savingEdit && setEditingSection(null)}
                >
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-text-main">
                                Edit {editingSection === "details" ? "class details" : "instructor info"}
                            </h3>
                            <CircleIconButton
                                icon={<X size={16} />}
                                ariaLabel="Close"
                                size="sm"
                                onClick={() => setEditingSection(null)}
                                disabled={savingEdit}
                            />
                        </div>

                        <div className="space-y-3">
                            {(editingSection === "details" ? DETAIL_FIELDS : INSTRUCTOR_FIELDS).map(
                                ({ key, label, multiline }) => (
                                    <div key={key}>
                                        <label className="mb-1 block text-xs font-medium text-text-muted">{label}</label>
                                        {multiline ? (
                                            <textarea
                                                value={editValues[key] || ""}
                                                onChange={(e) =>
                                                    setEditValues((prev) => ({ ...prev, [key]: e.target.value }))
                                                }
                                                rows={3}
                                                disabled={savingEdit}
                                                className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                                            />
                                        ) : (
                                            <input
                                                value={editValues[key] || ""}
                                                onChange={(e) =>
                                                    setEditValues((prev) => ({ ...prev, [key]: e.target.value }))
                                                }
                                                disabled={savingEdit}
                                                className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                                            />
                                        )}
                                    </div>
                                )
                            )}
                        </div>

                        <button
                            onClick={handleSaveEdit}
                            disabled={savingEdit}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {savingEdit ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" /> Saving...
                                </>
                            ) : (
                                "Save changes"
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}