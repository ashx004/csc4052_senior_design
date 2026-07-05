"use client";

import { useEffect, useState, use } from 'react';
import { Pencil, Loader2, UploadCloud } from 'lucide-react';
import CircleIconButton from '@/src/components/CircleIconButton';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { EnrollmentFields } from '@/src/app/(dashboard)/classes/page';
import ResourcePreview from '@/src/components/ResourcePreview';

// Import your newly created upload and fetch service tools
import { uploadUserResource, getCourseResources } from '@/src/components/fileUploadService';

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
        classDescription: data.classDescription
    };
}

function formatPhoneNumber(phone?: string): string {
    if (!phone) return "Not provided";
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function CourseOverview({
    params,
}: {
    params: Promise<{ courseId: string }>;
}) {
    // Unwraps the params promise cleanly in client environment
    const { courseId } = use(params);

    // TODO: replace with your global auth context uid when ready
    const currentUserId = "12345678"; 

    // UI States
    const [enrollment, setEnrollment] = useState<EnrollmentFields | null>(null);
    const [resources, setResources] = useState<any[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Pull course details AND uploaded document records on mount
    useEffect(() => {
        async function fetchCourseData() {
            try {
                const [courseData, fetchedResources] = await Promise.all([
                    getEnrollment(currentUserId, courseId),
                    getCourseResources(currentUserId, courseId)
                ]);
                setEnrollment(courseData);
                setResources(fetchedResources);
            } catch (err) {
                console.error("Error synchronizing backend data:", err);
            } finally {
                setPageLoading(false);
            }
        }
        fetchCourseData();
    }, [courseId]);

    // Handle incoming local uploads
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const result = await uploadUserResource({
                userId: currentUserId,
                classDocId: courseId,
                file: file,
                category: "notes" // Categorization value
            });

            // Optimistically update the UI list instantly
            setResources((prev) => [
                {
                    id: result.id,
                    name: file.name,
                    url: result.url,
                    fileType: file.name.split('.').pop()?.toLowerCase() || "",
                    category: "notes",
                },
                ...prev,
            ]);
        } catch (err) {
            alert("File upload pipeline failed. Check console contexts.");
        } finally {
            setUploading(false);
        }
    };

    if (pageLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
                <div className="flex flex-col items-center gap-2 text-sm text-[#8A8477]">
                    <Loader2 size={24} className="animate-spin text-[#B08957]" />
                    <p>Loading course dashboard...</p>
                </div>
            </div>
        );
    }

    if (!enrollment) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF7F0]">
                <div className="text-center">
                    <h1 className="text-xl font-semibold text-[#3D3A34]">Course not found</h1>
                    <p className="mt-1 text-sm text-[#8A8477]">We couldn&apos;t find a class with that ID.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FAF7F0] px-6 py-10 sm:px-10">
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-[#8A8477]">
                        <span className="font-medium text-[#B08957]">{enrollment.classCode}</span>
                        <span>&middot;</span>
                        <span>{enrollment.term}</span>
                    </div>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#3D3A34]">
                        {enrollment.className}
                    </h1>
                </div>

                {/* Info cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#EDE6D8]">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-[#3D3A34]">Class Details</h2>
                            <CircleIconButton icon={<Pencil size={14} />} ariaLabel="Edit class details" size="sm" />
                        </div>
                        <dl className="mt-4 space-y-3">
                            <div className="flex mt-4 space-x-[20%]">
                                <div>
                                    <dt className="text-xs text-[#8A8477]">Schedule</dt>
                                    <dd className="mt-0.5 text-sm text-[#3D3A34]">{enrollment.classSchedule || "Not provided"}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-[#8A8477]">Time</dt>
                                    <dd className="mt-0.5 text-sm text-[#3D3A34]">{enrollment.time || "Not provided"}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-[#8A8477]">Classroom</dt>
                                    <dd className="mt-0.5 text-sm text-[#3D3A34]">{enrollment.classRoom || "Not provided"}</dd>
                                </div>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Description</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">{enrollment.classDescription || "Not provided"}</dd>
                            </div>
                        </dl>
                    </div>

                    {/* Instructor Card */}
                    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#EDE6D8]">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-[#3D3A34]">Instructor</h2>
                            <CircleIconButton icon={<Pencil size={14} />} ariaLabel="Edit instructor info" size="sm" />
                        </div>
                        <dl className="mt-4 space-y-3">
                            <div>
                                <dt className="text-xs text-[#8A8477]">Name</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">{enrollment.facultyName || "Not provided"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Office</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">{enrollment.facultyOfficeNumber || "Not provided"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Email</dt>
                                <dd className="mt-0.5 text-sm">
                                    {enrollment.facultyEmail ? (
                                        <a href={`mailto:${enrollment.facultyEmail}`} className="text-[#B08957] hover:underline">
                                            {enrollment.facultyEmail}
                                        </a>
                                    ) : (
                                        <span className="text-[#3D3A34]">Not provided</span>
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-[#8A8477]">Phone</dt>
                                <dd className="mt-0.5 text-sm text-[#3D3A34]">{formatPhoneNumber(enrollment.facultyPhoneNumber)}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* File Upload Zone */}
                <div className="mt-6 rounded-xl border-2 border-dashed border-[#EDE6D8] bg-white p-6 text-center shadow-sm">
                    <label className="flex flex-col items-center justify-center gap-2 cursor-pointer py-4 group">
                        {uploading ? (
                            <>
                                <Loader2 size={28} className="animate-spin text-[#B08957]" />
                                <span className="text-sm font-medium text-[#8A8477]">Encrypting and uploading file to vault...</span>
                            </>
                        ) : (
                            <>
                                <UploadCloud size={28} className="text-[#8A8477] group-hover:text-[#B08957] transition-colors" />
                                <span className="text-sm font-medium text-[#3D3A34] group-hover:text-[#B08957] transition-colors">
                                    Click to upload a document to this course
                                </span>
                            </>
                        )}
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                </div>

                {/* Course Resources List Container in page.tsx */}
                <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-[#EDE6D8]">
                    <h2 className="text-sm font-semibold text-[#3D3A34] mb-4">Course Resources</h2>
                    
                    {resources.length === 0 ? (
                        <p className="text-sm text-[#8A8477] text-center py-4">
                            No documents uploaded for this course yet.
                        </p>
                    ) : (
                        /* Pass the array straight through. Your grid layout wrapper inside ResourcePreview handles the rest! */
                        <ResourcePreview resources={resources} />
                    )}
                </div>
            </div>
        </div>
    );
}