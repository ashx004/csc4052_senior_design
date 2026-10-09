"use client";

import { useEffect, useState, useRef, use } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Pencil, Loader2, X, Sparkles, FileText, CalendarDays } from 'lucide-react';
import CircleIconButton from '@/src/components/resourceManagement/CircleIconButton';
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/library/firebase';
import { EnrollmentFields } from '@/src/app/(dashboard)/classes/page';
import { useAuth } from '@/src/context/AuthContext';
import ContextualAiPanel, { CatalystLauncher } from '@/src/components/aiAssistant/ContextualAiPanel';
import { buildPageTextSuggestions, type PageTextPageContext } from '@/src/library/Contextual_AI/contextualAi';
import { useChatContext } from '@/src/hooks/useChatContext';
import PageTutorial from '@/src/components/tutorial/PageTutorial';
import courseSteps from '@/src/library/tutorials/steps/course';
import { DATA_CHANGED_EVENT, notifyDataChanged } from '@/src/library/dataChanged';
import { buildCourseIdentityUpdate, MAX_COURSE_CODE_LENGTH, MAX_COURSE_NAME_LENGTH } from '@/src/library/courseIdentity';
import SyllabusModal from '@/src/components/course/SyllabusModal';

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
        courseSummary: data.courseSummary,
        syllabus: data.syllabus,
    };
}

function formatPhoneNumber(phone?: string): string {
    if (!phone) return "Not provided";
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

type EditSection = "details" | "instructor" | "course" | null;

const DETAIL_FIELDS: { key: keyof EnrollmentFields; label: string; multiline?: boolean }[] = [
    { key: "classSchedule", label: "Schedule" },
    { key: "time", label: "Time" },
    { key: "classRoom", label: "Classroom" },
    { key: "classDescription", label: "Description", multiline: true },
];

const COURSE_FIELDS: { key: keyof EnrollmentFields; label: string; multiline?: boolean }[] = [
    { key: "classCode", label: "Course code" },
    { key: "className", label: "Course title" },
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
    const searchParams = useSearchParams();
    const initialResourceId = searchParams.get("resourceId");

    const { user, loading: authLoading } = useAuth();

    const [enrollment, setEnrollment] = useState<EnrollmentFields | null>(null);
    const [pageLoading, setPageLoading] = useState(true);

    const [editingSection, setEditingSection] = useState<EditSection>(null);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [syllabusOpen, setSyllabusOpen] = useState(false);

    // "Ask Catalyst" floating panel — same pattern as the flashcards/quiz
    // pages, briefed with a plain-text summary of this course page (see
    // coursePageContext below) rather than a bespoke schema, since there's
    // nothing here as structured as a flashcard/quiz result to model.
    const [catalystOpen, setCatalystOpen] = useState(false);
    const catalystBtnRef = useRef<HTMLButtonElement | null>(null);
    
    const catalystChatContext = useChatContext(user?.uid, user?.email);

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
        // The AI panel changed this class's details (a confirmed edit): show them.
        window.addEventListener(DATA_CHANGED_EVENT, fetchCourseData);
        return () => window.removeEventListener(DATA_CHANGED_EVENT, fetchCourseData);
    }, [courseId, user, authLoading]);

    function fieldsFor(section: Exclude<EditSection, null>) {
        return section === "details" ? DETAIL_FIELDS : section === "course" ? COURSE_FIELDS : INSTRUCTOR_FIELDS;
    }

    function openEdit(section: "details" | "instructor" | "course") {
        if (!enrollment) return;
        setEditError(null);
        const fields = fieldsFor(section);
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
            if (editingSection === "course") {
                const result = buildCourseIdentityUpdate({
                    classCode: editValues.classCode ?? "",
                    className: editValues.className ?? "",
                });
                if (!result.ok) {
                    setEditError(result.error);
                    return;
                }
                await updateDoc(docRef, {
                    classCode: result.classCode,
                    className: result.className,
                    subject: result.subject ?? deleteField(),
                    courseNumber: result.courseNumber ?? deleteField(),
                });
                setEnrollment((prev) => (prev ? { ...prev, classCode: result.classCode, className: result.className } : prev));
                // The sidebar and other open pages show the old name until told.
                notifyDataChanged();
            } else {
                await updateDoc(docRef, editValues);
                setEnrollment((prev) => (prev ? ({ ...prev, ...editValues } as EnrollmentFields) : prev));
            }
            setEditingSection(null);
        } catch (err) {
            console.error("Error saving edit:", err);
            setEditError("Couldn't save changes. Please try again.");
        } finally {
            setSavingEdit(false);
        }
    }

    // Plain-text briefing of this page for the Catalyst panel — document
    // names come from catalystChatContext (already loaded per-class for the
    // main AI assistant) rather than a separate fetch, matched on courseId
    // since that's the same id used as classId there.
    const currentClass = catalystChatContext?.classes.find((c) => c.classId === courseId);
    const documentNames = currentClass?.documents.map((d) => d.name) ?? [];
    const pageText = enrollment
        ? [
              `${enrollment.classCode} — ${enrollment.className} (${enrollment.term})`,
              enrollment.classDescription ? `Description: ${enrollment.classDescription}` : "",
              enrollment.courseSummary ? `AI-generated course summary: ${enrollment.courseSummary}` : "",
              `Schedule: ${enrollment.classSchedule || "not listed"}${enrollment.time ? `, ${enrollment.time}` : ""}${
                  enrollment.classRoom ? `, ${enrollment.classRoom}` : ""
              }`,
              `Instructor: ${enrollment.facultyName || "not listed"}`,
              documentNames.length
                  ? `Uploaded documents (${documentNames.length}): ${documentNames.join(", ")}`
                  : "No documents uploaded yet for this class.",
          ]
              .filter(Boolean)
              .join("\n")
        : "";
    const coursePageContext: PageTextPageContext | null =
        enrollment && pageText
            ? { kind: "page_text", courseId, pageTitle: `the ${enrollment.classCode} course page`, pageText }
            : null;
    const catalystSuggestions = coursePageContext ? buildPageTextSuggestions(coursePageContext) : [];

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
                        <div className="h-40 rounded-xl bg-bg-container shadow-sm ring-1 ring-border-light" />
                        <div className="h-40 rounded-xl bg-bg-container shadow-sm ring-1 ring-border-light" />
                    </div>
                    <div className="mt-6 h-32 rounded-xl bg-bg-container shadow-sm ring-1 ring-border-light" />
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
            <PageTutorial id="course" steps={courseSteps} />
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="mb-8" data-tutorial="course-heading">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="font-medium text-primary">{enrollment.classCode}</span>
                        <span>&middot;</span>
                        <span>{enrollment.term}</span>
                    </div>
                    <div className="mt-1 flex items-start gap-2">
                        <h1 className="min-w-0 flex-1 break-words text-3xl font-semibold tracking-tight text-text-main">
                            {enrollment.className}
                        </h1>
                        <CircleIconButton
                            icon={<Pencil size={14} />}
                            ariaLabel="Edit course code and title"
                            size="sm"
                            onClick={() => openEdit("course")}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setSyllabusOpen(true)}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border-light bg-bg-container px-3.5 py-2 text-sm font-medium text-text-main shadow-sm transition hover:bg-bg-warm"
                    >
                        <FileText size={15} className="text-primary" />
                        {enrollment.syllabus ? "Update course info from syllabus" : "Course info from syllabus"}
                    </button>
                </div>

                {/* Course Summary — AI-generated from uploaded documents, see
                    src/library/courseSummary.ts. Absent until at least one
                    supported document has been uploaded and indexed. */}
                {enrollment.courseSummary && (
                    <div className="mb-6 rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light" data-tutorial="course-summary">
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-primary" />
                            <h2 className="text-sm font-semibold text-text-main">Course Summary</h2>
                            <span className="text-xs text-text-muted">Generated by Catalyst AI</span>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-text-main">{enrollment.courseSummary}</p>
                    </div>
                )}

                {enrollment.syllabus && (
                    <div className="mb-6 rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light" data-tutorial="course-syllabus">
                        <div className="flex items-center gap-2">
                            <CalendarDays size={16} className="text-primary" />
                            <h2 className="text-sm font-semibold text-text-main">Schedule &amp; key dates</h2>
                            <span className="min-w-0 truncate text-xs text-text-muted">from {enrollment.syllabus.name}</span>
                        </div>
                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                            {([
                                ["Office hours", enrollment.syllabus.officeHours],
                                ["Textbooks", enrollment.syllabus.textbooks],
                                ["Grading", enrollment.syllabus.grading],
                            ] as const).filter(([, value]) => value).map(([label, value]) => (
                                <div key={label} className={label === "Grading" ? "sm:col-span-2" : ""}>
                                    <dt className="text-xs text-text-muted">{label}</dt>
                                    <dd className="mt-0.5 text-text-main">{value}</dd>
                                </div>
                            ))}
                        </dl>
                        {enrollment.syllabus.dates?.length > 0 && (
                            <ul className="mt-4 divide-y divide-border-light rounded-lg border border-border-light">
                                {enrollment.syllabus.dates.map((d, i) => (
                                    <li key={`${d.date}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                                        <span className="w-28 shrink-0 text-xs tabular-nums text-text-muted">{d.date}</span>
                                        <span className="min-w-0 flex-1 text-text-main">{d.title}</span>
                                        {d.kind !== "other" && (
                                            <span className="shrink-0 rounded bg-bg-warm px-1.5 py-0.5 text-[10px] font-medium capitalize text-text-muted">{d.kind}</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* Info cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light" data-tutorial="course-details">
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
                    <div className="rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light" data-tutorial="course-instructor">
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
                <div className="mt-6 rounded-xl bg-bg-container p-6 shadow-sm ring-1 ring-border-light" data-tutorial="course-resources">
                    <h2 className="text-sm font-semibold text-text-main mb-4">Course Resources</h2>
                    {/* PASSING DOWN DYNAMIC CURRENT USER ID TO CLEANLY REROUTE CAROUSEL MINIO FETCHES */}
                    <ResourcePreview
                        userId={user.uid}
                        courseId={courseId}
                        initialResourceId={initialResourceId}
                        taskId={searchParams.get("taskId")}
                    />
                </div>
            </div>

            {coursePageContext && catalystChatContext && (
                <>
                    <CatalystLauncher
                        onClick={() => setCatalystOpen(true)}
                        visible={!catalystOpen}
                        buttonRef={catalystBtnRef}
                    />
                    <ContextualAiPanel
                        open={catalystOpen}
                        onClose={() => setCatalystOpen(false)}
                        contextLabel={`${enrollment.classCode} — ${enrollment.className}`}
                        suggestions={catalystSuggestions}
                        pageContext={coursePageContext}
                        chatContext={catalystChatContext}
                        panelContextKey={`course:${courseId}`}
                        launcherRef={catalystBtnRef}
                    />
                </>
            )}

            {syllabusOpen && user && (
                <SyllabusModal
                    uid={user.uid}
                    courseId={courseId}
                    current={enrollment}
                    onClose={() => setSyllabusOpen(false)}
                    onApplied={(fields) => {
                        setEnrollment((prev) => (prev ? ({ ...prev, ...fields } as EnrollmentFields) : prev));
                        notifyDataChanged();
                    }}
                />
            )}

            {/* Edit modal — shared by Class Details, Instructor and course name */}
            {editingSection && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !savingEdit && setEditingSection(null)}
                >
                    <div className="w-full max-w-sm rounded-xl bg-bg-container p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-text-main">
                                Edit {editingSection === "details" ? "class details" : editingSection === "course" ? "course name" : "instructor info"}
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
                            {fieldsFor(editingSection).map(
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
                                                className="w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                                            />
                                        ) : (
                                            <input
                                                value={editValues[key] || ""}
                                                onChange={(e) =>
                                                    setEditValues((prev) => ({ ...prev, [key]: e.target.value }))
                                                }
                                                disabled={savingEdit}
                                                maxLength={editingSection === "course" ? (key === "classCode" ? MAX_COURSE_CODE_LENGTH : MAX_COURSE_NAME_LENGTH) : undefined}
                                                className="w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                                            />
                                        )}
                                    </div>
                                )
                            )}
                        </div>

                        {editError && <p className="mt-4 text-xs text-alert-error">{editError}</p>}

                        <button
                            onClick={handleSaveEdit}
                            disabled={savingEdit}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
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