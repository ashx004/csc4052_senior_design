"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Minus, Plus, Trash2 } from "lucide-react";
import { collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { useSetPageContext } from "@/src/context/AIPageContext";
import AddEnrollmentModal from "@/src/components/classes/AddEnrollmentModal";
import ClassCard, { ClassCardProps } from "@/src/components/classes/ClassCard";
import EditClassScheduleModal from "@/src/components/classes/EditClassScheduleModal";
import PageTutorial from "@/src/components/tutorial/PageTutorial";
import { db } from "@/src/library/firebase";
import { Term } from "@/src/library/academicTerm";
import { EnrollmentStatus, getEnrollmentStatus } from "@/src/library/enrollmentStatus";
import { formatClassMeetingSchedule, type StructuredClassSchedule } from "@/src/library/classSchedule";
import classesSteps from "@/src/library/tutorials/steps/classes";

// Only className, classCode, and term are required. The remaining fields are
// deliberately additive so older enrollment documents remain valid.
export interface EnrollmentFields extends StructuredClassSchedule {
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
  termSeason?: Term;
  termYear?: number;
  subject?: string;
  courseNumber?: string;
  status?: EnrollmentStatus;
  creditHours?: number;
  prerequisites?: string;
  color?: string;
  courseSummary?: string;
  courseSummaryUpdatedAt?: unknown;
}

function formatEnrollmentSchedule(data: StructuredClassSchedule & Record<string, unknown>): string | undefined {
  const structuredSchedule = formatClassMeetingSchedule(data);
  if (structuredSchedule) return structuredSchedule;

  const legacyValues = [data.classSchedule, data.time]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const uniqueValues = [...new Set(legacyValues)];
  return uniqueValues.length ? uniqueValues.join(" · ") : undefined;
}

async function getAllEnrollments(userId: string): Promise<ClassCardProps[]> {
  const enrollmentRef = collection(db, "users", userId, "enrollment");
  const querySnapshot = await getDocs(enrollmentRef);

  return querySnapshot.docs.map((enrollmentDocument) => {
    const data = enrollmentDocument.data();
    return {
      classId: enrollmentDocument.id,
      className: data.className,
      classCode: data.classCode,
      term: data.term,
      color: data.color,
      scheduleLabel: formatEnrollmentSchedule(data),
      status: getEnrollmentStatus(data),
    };
  });
}

function buildClassesSummary(activeClasses: ClassCardProps[]): string {
  if (activeClasses.length === 0) return "The student has no active classes added yet.";
  const list = activeClasses.map((course) => `${course.classCode} — ${course.className} (${course.term})`).join(", ");
  return `The student's active classes on this page: ${list}.`;
}

export default function Classes() {
  const { user, loading } = useAuth();
  const [enrollments, setEnrollments] = useState<ClassCardProps[]>([]);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [scheduleClassId, setScheduleClassId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const requestedClassId = new URLSearchParams(window.location.search).get("editSchedule");
    if (requestedClassId) setScheduleClassId(requestedClassId);
  }, []);

  const refreshEnrollments = () => {
    if (!user) return;

    getAllEnrollments(user.uid)
      .then(setEnrollments)
      .catch((error) => {
        console.error("Error refreshing enrollments:", error);
        setEnrollments([]);
      });
  };

  useEffect(() => {
    refreshEnrollments();
  }, [user]);

  const activeEnrollments = useMemo(
    () => enrollments.filter((enrollment) => enrollment.status !== "completed"),
    [enrollments]
  );

  useSetPageContext(
    { page: "classes", label: "Classes", summary: buildClassesSummary(activeEnrollments) },
    [activeEnrollments]
  );

  const confirmingClass = enrollments.find((enrollment) => enrollment.classId === confirmingDeleteId);

  const handlePermanentDelete = async (classId: string) => {
    if (!user) return;

    try {
      await deleteDoc(doc(db, "users", user.uid, "enrollment", classId));
      refreshEnrollments();
    } catch (error) {
      console.error("Error deleting class document from database:", error);
      alert("Failed to delete the class. Please try again.");
    } finally {
      setConfirmingDeleteId(null);
    }
  };

  const handleColorChange = async (classId: string, color: string) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "users", user.uid, "enrollment", classId), { color });
      setEnrollments((current) => current.map((enrollment) => (
        enrollment.classId === classId ? { ...enrollment, color } : enrollment
      )));
    } catch (error) {
      console.error("Error updating class color:", error);
    }
  };

  const handleMarkCompletedOnDelete = async (classId: string) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "users", user.uid, "enrollment", classId), { status: "completed" });
      refreshEnrollments();
    } catch (error) {
      console.error("Error marking class completed:", error);
      alert("Failed to update the class. Please try again.");
    } finally {
      setConfirmingDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <p className="text-sm text-text-muted">Loading classes...</p>
      </div>
    );
  }

  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8">
      <PageTutorial id="classes" steps={classesSteps} />
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 mt-9 flex items-center gap-2 text-xs text-text-muted">
              <BookOpen size={15} strokeWidth={1.8} />
              <span>Dashboard</span>
              <span>/</span>
              <span className="font-medium text-text-main">Classes</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-main" data-tutorial="classes-heading">
              Classes
            </h1>
            <p className="mt-2 text-sm text-text-muted">All your classes in one place. Click a card to go to that class.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeEnrollments.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteMode((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  deleteMode
                    ? "border-alert-error bg-alert-error text-text-inverse hover:bg-alert-error-hover"
                    : "border-border-light bg-bg-container text-text-main hover:bg-bg-warm"
                }`}
              >
                <Trash2 size={16} strokeWidth={1.8} />
                {deleteMode ? "Done managing" : "Manage classes"}
              </button>
            )}
            <button
              type="button"
              data-tutorial="classes-add"
              onClick={() => setAddClassOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Plus size={16} strokeWidth={2} />
              Add Class
            </button>
          </div>
        </header>

        {activeEnrollments.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-border-light bg-bg-container px-6 py-12 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-warm text-primary">
              <BookOpen size={25} strokeWidth={1.8} />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-text-main">Build your class list</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">Add a class to organize its course space and optionally keep its meeting time handy.</p>
            <button
              type="button"
              onClick={() => setAddClassOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Plus size={16} strokeWidth={2} />
              Add your first class
            </button>
          </div>
        ) : (
          <div className="rounded-3xl border border-border-light bg-bg-container p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-border-light pb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-main">Current classes</h2>
                <p className="mt-1 text-sm text-text-muted">{activeEnrollments.length} active {activeEnrollments.length === 1 ? "class" : "classes"}</p>
              </div>
              {deleteMode && <p className="text-xs font-medium text-alert-error">Choose a class to remove or complete.</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-tutorial="classes-grid">
              {activeEnrollments.map((enrollment) => (
                <div key={enrollment.classId} className="relative">
                  <ClassCard
                    {...enrollment}
                    onColorChange={(color) => enrollment.classId && handleColorChange(enrollment.classId, color)}
                    onScheduleEdit={() => enrollment.classId && setScheduleClassId(enrollment.classId)}
                  />
                  {deleteMode && (
                    <button
                      type="button"
                      onClick={() => enrollment.classId && setConfirmingDeleteId(enrollment.classId)}
                      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-alert-error text-text-inverse shadow-sm transition hover:bg-alert-error-hover focus:outline-none focus:ring-2 focus:ring-alert-error"
                      aria-label={`Remove ${enrollment.className}`}
                    >
                      <Minus size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AddEnrollmentModal
        open={addClassOpen}
        onOpenChange={setAddClassOpen}
        hideOwnTrigger
        onEnrollmentAdded={refreshEnrollments}
      />

      {scheduleClassId && (
        <EditClassScheduleModal
          classId={scheduleClassId}
          onClose={() => setScheduleClassId(null)}
          onSaved={refreshEnrollments}
        />
      )}

      {confirmingClass?.classId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-bg-container p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-text-main">Remove {confirmingClass.className}?</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Finished this course? Mark it completed to retain it in Advising. Otherwise, remove it permanently.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => handleMarkCompletedOnDelete(confirmingClass.classId!)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition hover:bg-primary-hover">
                Mark completed
              </button>
              <button type="button" onClick={() => handlePermanentDelete(confirmingClass.classId!)} className="rounded-lg bg-alert-error px-4 py-2 text-sm font-medium text-text-inverse transition hover:bg-alert-error-hover">
                Delete permanently
              </button>
              <button type="button" onClick={() => setConfirmingDeleteId(null)} className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-main transition hover:bg-bg-warm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
