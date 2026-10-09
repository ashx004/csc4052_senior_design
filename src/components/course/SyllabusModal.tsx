"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { AlertCircle, ArrowLeft, FileText, Loader2, Upload, X } from "lucide-react";
import { db } from "@/src/library/firebase";
import { INDEXABLE_FILE_TYPES, MAX_FILE_SIZE_BYTES, uploadUserResource } from "@/src/components/resourceManagement/fileUploadService";
import {
  SYLLABUS_ENROLLMENT_FIELDS,
  type SyllabusDate,
  type SyllabusEnrollmentField,
  type SyllabusInfo,
} from "@/src/library/syllabusInfo";

export interface StoredSyllabus {
  resourceId: string;
  name: string;
  officeHours: string;
  textbooks: string;
  grading: string;
  dates: SyllabusDate[];
}

const FIELD_LABELS: Record<SyllabusEnrollmentField, string> = {
  classSchedule: "Meeting days",
  time: "Time",
  classRoom: "Classroom",
  classDescription: "Description",
  facultyName: "Instructor",
  facultyEmail: "Instructor email",
  facultyOfficeNumber: "Office",
  facultyPhoneNumber: "Phone",
};

const ACCEPT = ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp";

type Resource = { id: string; name: string; fileType: string };
type Step = "choose" | "reading" | "review";

export default function SyllabusModal({
  uid,
  courseId,
  current,
  onClose,
  onApplied,
}: {
  uid: string;
  courseId: string;
  /** What the course already has, so the review can show what would change. */
  current: Partial<Record<SyllabusEnrollmentField, string | undefined>>;
  onClose: () => void;
  onApplied: (fields: Record<string, unknown>) => void;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Resource | null>(null);
  const [info, setInfo] = useState<SyllabusInfo | null>(null);
  const [use, setUse] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<SyllabusDate[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "users", uid, "enrollment", courseId, "resources"),
      (snapshot) => {
        setResources(
          snapshot.docs
            .map((d) => ({ id: d.id, name: String(d.data().name ?? "Untitled"), fileType: String(d.data().fileType ?? "").toLowerCase() }))
            .filter((r) => INDEXABLE_FILE_TYPES.includes(r.fileType))
        );
      },
      () => setResources([])
    );
  }, [uid, courseId]);

  const sorted = useMemo(
    () => [...resources].sort((a, b) => Number(/syllabus/i.test(b.name)) - Number(/syllabus/i.test(a.name)) || a.name.localeCompare(b.name)),
    [resources]
  );

  async function read(resource: Resource) {
    setPicked(resource);
    setStep("reading");
    setError(null);
    try {
      const res = await fetch("/api/courses/syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, resourceId: resource.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't read that file.");
      const extracted = data.info as SyllabusInfo;
      const nextUse: Record<string, boolean> = {};
      const nextValues: Record<string, string> = {};
      for (const key of SYLLABUS_ENROLLMENT_FIELDS) {
        nextValues[key] = extracted[key] ?? "";
        nextUse[key] = !!extracted[key] && extracted[key] !== (current[key] ?? "");
      }
      setInfo(extracted);
      setValues({ ...nextValues, officeHours: extracted.officeHours, textbooks: extracted.textbooks, grading: extracted.grading });
      setUse(nextUse);
      setDates(extracted.dates);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
      setStep("choose");
    }
  }

  async function upload(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!INDEXABLE_FILE_TYPES.includes(ext)) return setError("Please choose a PDF, Word document, text file or photo.");
    if (file.size > MAX_FILE_SIZE_BYTES) return setError("That file is over the 20MB limit.");
    setUploading(true);
    setError(null);
    try {
      const { id } = await uploadUserResource({ userId: uid, classDocId: courseId, file, category: "classDoc" });
      await read({ id, name: file.name, fileType: ext });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function apply() {
    if (!info || !picked) return;
    setSaving(true);
    setError(null);
    try {
      const fields: Record<string, unknown> = {};
      for (const key of SYLLABUS_ENROLLMENT_FIELDS) if (use[key]) fields[key] = (values[key] ?? "").trim();
      const syllabus: StoredSyllabus = {
        resourceId: picked.id,
        name: picked.name,
        officeHours: (values.officeHours ?? "").trim(),
        textbooks: (values.textbooks ?? "").trim(),
        grading: (values.grading ?? "").trim(),
        dates,
      };
      await updateDoc(doc(db, "users", uid, "enrollment", courseId), { ...fields, syllabus: { ...syllabus, importedAt: serverTimestamp() } });
      onApplied({ ...fields, syllabus });
      onClose();
    } catch (err) {
      console.error("Applying syllabus failed:", err);
      setError("Couldn't save the course info. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main outline-none focus:border-primary";
  const busy = step === "reading" || uploading || saving;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-label="Course info from syllabus"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-bg-container shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-light px-5 py-3">
          {step === "review" && (
            <button type="button" onClick={() => setStep("choose")} disabled={saving} aria-label="Back" className="rounded-md p-1 text-text-muted hover:bg-bg-warm">
              <ArrowLeft size={16} />
            </button>
          )}
          <h3 className="flex-1 text-sm font-semibold text-text-main">Course info from syllabus</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-md p-1 text-text-muted hover:bg-bg-warm disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-alert-error bg-alert-error-bg p-3 text-xs text-alert-error">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}

          {step === "choose" && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                Pick the syllabus you've already added to this course, or upload a new one. Catalyst reads it and fills in the schedule, instructor and key dates for you to review.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-hover px-4 py-4 text-sm font-medium text-text-main hover:border-primary hover:bg-bg-warm disabled:opacity-50"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload a syllabus
              </button>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">From this course</p>
                {sorted.length === 0 ? (
                  <p className="rounded-lg bg-bg-main p-3 text-sm text-text-muted">No readable files in this course yet.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {sorted.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => void read(r)}
                          className="flex w-full items-center gap-3 rounded-lg border border-border-light px-3 py-2.5 text-left text-sm text-text-main hover:bg-bg-warm"
                        >
                          <FileText size={16} className="shrink-0 text-text-muted" />
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {/syllabus/i.test(r.name) && <span className="rounded bg-bg-warm px-1.5 py-0.5 text-[10px] font-medium text-primary">Likely</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {step === "reading" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-text-muted">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p>Reading {picked?.name ?? "the syllabus"}...</p>
              <p className="text-xs">This can take up to a minute for scanned pages.</p>
            </div>
          )}

          {step === "review" && info && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">Check what was found in <span className="font-medium text-text-main">{picked?.name}</span>. Untick anything you don't want to change.</p>
              {SYLLABUS_ENROLLMENT_FIELDS.map((key) => {
                const existing = current[key] ?? "";
                return (
                  <div key={key}>
                    <label className="mb-1 flex items-center gap-2 text-xs font-medium text-text-muted">
                      <input type="checkbox" checked={!!use[key]} onChange={(e) => setUse((u) => ({ ...u, [key]: e.target.checked }))} />
                      {FIELD_LABELS[key]}
                    </label>
                    {key === "classDescription" ? (
                      <textarea rows={3} value={values[key] ?? ""} onChange={(e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setUse((u) => ({ ...u, [key]: true })); }} className={input} />
                    ) : (
                      <input value={values[key] ?? ""} onChange={(e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setUse((u) => ({ ...u, [key]: true })); }} className={input} />
                    )}
                    {existing && existing !== values[key] && <p className="mt-1 text-xs text-text-muted">Now: {existing}</p>}
                  </div>
                );
              })}
              {(["officeHours", "textbooks", "grading"] as const).map((key) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-text-muted">{key === "officeHours" ? "Office hours" : key === "textbooks" ? "Textbooks" : "Grading"}</label>
                  <input value={values[key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} className={input} />
                </div>
              ))}
              <div>
                <p className="mb-1 text-xs font-medium text-text-muted">Important dates ({dates.length})</p>
                {dates.length === 0 ? (
                  <p className="text-xs text-text-muted">No dates were found.</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {dates.map((d, i) => (
                      <li key={`${d.date}-${i}`} className="flex items-center gap-2 rounded-md bg-bg-main px-3 py-1.5 text-sm text-text-main">
                        <span className="w-24 shrink-0 text-xs tabular-nums text-text-muted">{d.date}</span>
                        <span className="min-w-0 flex-1 truncate">{d.title}</span>
                        <button type="button" aria-label={`Remove ${d.title}`} onClick={() => setDates((all) => all.filter((_, j) => j !== i))} className="text-text-muted hover:text-alert-error">
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {step === "review" && (
          <div className="border-t border-border-light px-5 py-3">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-40"
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save to course"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
