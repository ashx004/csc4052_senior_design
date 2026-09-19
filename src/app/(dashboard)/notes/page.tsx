"use client";

import { useEffect, useRef, useState } from "react";
import {
  Notebook,
  Upload,
  UploadCloud,
  FileText,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  Presentation,
  BookOpen,
  FileImage,
  ScanText,
  Loader2,
  X,
  Download,
  Trash2,
  RotateCcw,
  GraduationCap,
} from "lucide-react";
import Link from "next/link";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { renderAsync } from "docx-preview";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useSetPageContext } from "@/src/context/AIPageContext";
import {
  uploadOcrDocument,
  uploadUserResource,
  deleteUserResource,
  MAX_FILE_SIZE_BYTES,
} from "@/src/components/resourceManagement/fileUploadService";

type Category = "classDoc" | "notes" | "assignments";
type OcrStatus = "queued" | "processing" | "complete" | "failed";
type IndexStatus = "queued" | "processing" | "complete" | "failed";

const CATEGORY_LABELS: Record<Category, string> = {
  classDoc: "Class Doc",
  notes: "Notes",
  assignments: "Assignments",
};

const MAX_FILES_PER_BATCH = 5;

// Kept in sync with the file types the class resources preview can render —
// anything outside this set would upload but silently disappear from the
// course's resource grid (see getFileType in ResourcePreview).
const VALID_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "xls",
  "zip",
  "pptx",
  "one",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "txt",
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "java",
  "go",
  "sql",
  "c",
  "cpp",
  "cs",
  "rs",
  "html",
  "css",
  "php",
  "rb",
  "kt",
  "swift",
  "sh",
  "asm",
];

const IMAGE_TYPES = ["png", "jpg", "jpeg", "webp"];

const ACCEPT_ATTR = VALID_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function getFileType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || !VALID_EXTENSIONS.includes(ext)) return null;
  return ext === "xls" ? "xlsx" : ext;
}

function toDateSafe(value: any): Date {
  if (value && typeof value.toDate === "function") return value.toDate();
  return new Date();
}

function formatRelativeDate(date: Date): string {
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  const months = Math.floor(diffDays / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

function typeIcon(type: string) {
  switch (type) {
    case "zip":
      return <FileArchive size={16} />;
    case "pptx":
      return <Presentation size={16} />;
    case "one":
      return <BookOpen size={16} />;
    case "xlsx":
      return <FileSpreadsheet size={16} />;
    case "pdf":
    case "docx":
      return <FileText size={16} />;
    default:
      if (IMAGE_TYPES.includes(type)) return <FileImage size={16} />;
      return <FileCode size={16} />;
  }
}

function isOcrStatus(value: unknown): value is OcrStatus {
  return value === "queued" || value === "processing" || value === "complete" || value === "failed";
}

function OcrStatusBadge({ status }: { status: OcrStatus }) {
  const labels: Record<OcrStatus, string> = {
    queued: "OCR queued",
    processing: "OCR processing",
    complete: "OCR ready",
    failed: "OCR failed",
  };
  const classes: Record<OcrStatus, string> = {
    queued: "bg-bg-warm text-text-muted",
    processing: "bg-bg-warm text-primary",
    complete: "bg-bg-warm text-primary",
    failed: "bg-alert-error-bg text-alert-error",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${classes[status]}`}>
      {status === "processing" ? <Loader2 size={11} className="animate-spin" /> : <ScanText size={11} />}
      {labels[status]}
    </span>
  );
}

function isIndexStatus(value: unknown): value is IndexStatus {
  return value === "queued" || value === "processing" || value === "complete" || value === "failed";
}

function IndexStatusBadge({ status }: { status: IndexStatus }) {
  const labels: Record<IndexStatus, string> = {
    queued: "Queued for AI",
    processing: "Adding to AI",
    complete: "AI ready",
    failed: "AI indexing failed",
  };
  const classes: Record<IndexStatus, string> = {
    queued: "bg-bg-warm text-text-muted",
    processing: "bg-bg-warm text-primary",
    complete: "bg-bg-warm text-primary",
    failed: "bg-alert-error-bg text-alert-error",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${classes[status]}`}>
      {status === "processing" ? <Loader2 size={11} className="animate-spin" /> : <ScanText size={11} />}
      {labels[status]}
    </span>
  );
}

interface EnrolledClass {
  id: string;
  className: string;
  classCode: string;
  term: string;
}

interface NoteDoc {
  id: string;
  classId: string;
  name: string;
  url: string;
  fileType: string;
  category: Category;
  uploadedAt: Date;
  ocrScanned?: boolean;
  ocrStatus?: OcrStatus;
  ocrTranscriptUrl?: string;
  ocrError?: string;
  indexStatus?: IndexStatus;
  indexError?: string;
}

function DocumentPreviewModal({
  doc,
  onRetryOcr,
  retryingOcr,
  onClose,
}: {
  doc: NoteDoc;
  onRetryOcr: (doc: NoteDoc) => void;
  retryingOcr: boolean;
  onClose: () => void;
}) {
  const isPdf = doc.fileType === "pdf";
  const isDocx = doc.fileType === "docx";
  const isXlsx = doc.fileType === "xlsx";
  const isImage = IMAGE_TYPES.includes(doc.fileType);
  const isDownloadOnly = doc.fileType === "zip" || doc.fileType === "pptx" || doc.fileType === "one";
  const ocrStatus = isImage ? doc.ocrStatus ?? "processing" : undefined;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [excelHtml, setExcelHtml] = useState<string | null>(null);
  const docxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPdf || isImage || isDownloadOnly) {
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMsg(null);
    setText(null);
    setExcelHtml(null);

    async function load() {
      try {
        const res = await fetch(doc.url);
        if (!res.ok) throw new Error("File not found");

        if (isDocx) {
          const buffer = await res.arrayBuffer();
          if (cancelled || !docxRef.current) return;
          docxRef.current.innerHTML = "";
          await renderAsync(buffer, docxRef.current, undefined, {
            className: "docx-render",
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            trimXmlDeclaration: true,
            useBase64URL: true,
          });
        } else if (isXlsx) {
          const XLSX = await import("xlsx");
          const buffer = await res.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          if (!cancelled) setExcelHtml(XLSX.utils.sheet_to_html(sheet));
        } else {
          const content = await res.text();
          if (!cancelled) setText(content);
        }

        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("Preview load error:", err);
        if (!cancelled) {
          setStatus("error");
          setErrorMsg("Couldn't load this document's content.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [doc, isPdf, isDocx, isDownloadOnly, isXlsx, isImage]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-10"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-bg-container shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text-main">{doc.name}</p>
              {ocrStatus && <OcrStatusBadge status={ocrStatus} />}
              {doc.indexStatus && <IndexStatusBadge status={doc.indexStatus} />}
            </div>
            <p className="text-xs text-text-muted">{CATEGORY_LABELS[doc.category] ?? doc.category}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={doc.url}
              download
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-primary-hover"
            >
              <Download size={13} />
              Download
            </a>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted transition hover:bg-bg-main hover:text-text-main"
              aria-label="Close preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto bg-bg-container">
          {isPdf ? (
            <iframe src={doc.url} title={doc.name} className="h-full w-full" />
          ) : isImage ? (
            <div className="flex h-full flex-col gap-4 p-4">
              <img
                src={doc.url}
                alt={doc.name}
                className="mx-auto max-h-[65vh] max-w-full rounded-lg border border-border-light object-contain shadow-sm"
              />
              {ocrStatus === "queued" || ocrStatus === "processing" ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-border-light bg-bg-main p-4 text-sm text-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  {ocrStatus === "queued" ? "Transcription queued…" : "Transcription processing…"} This preview will update automatically when it is ready.
                </div>
              ) : ocrStatus === "failed" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-alert-error bg-alert-error-bg p-4 text-sm text-alert-error">
                  <p>{doc.ocrError || "Transcription failed. You can try again."}</p>
                  <button
                    onClick={() => onRetryOcr(doc)}
                    disabled={retryingOcr}
                    className="flex items-center gap-1.5 rounded-md border border-alert-error px-3 py-1.5 text-xs font-medium transition hover:bg-bg-container disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {retryingOcr ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    Retry OCR
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-light bg-bg-main p-4 text-sm text-text-muted">
                  <span className="flex items-center gap-2"><ScanText size={16} /> Transcription ready.</span>
                  {doc.ocrTranscriptUrl && (
                    <a href={doc.ocrTranscriptUrl} download className="text-xs font-medium text-primary hover:underline">
                      Download transcription
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : isDownloadOnly ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-warm text-text-muted">
                {doc.fileType === "pptx" ? (
                  <Presentation size={28} />
                ) : doc.fileType === "one" ? (
                  <BookOpen size={28} />
                ) : (
                  <FileArchive size={28} />
                )}
              </div>
              <p className="max-w-sm text-sm text-text-main">
                {doc.fileType.toUpperCase()} files can&apos;t be previewed here — download it to
                view the contents.
              </p>
            </div>
          ) : isDocx ? (
            <>
              <style>{`
                .docx-render p { margin: 0 0 8px 0; }
                .docx-render table { border-collapse: collapse; }
                .docx-render table td, .docx-render table th { border: 1px solid #ddd; padding: 4px 8px; }
                .docx-render ul, .docx-render ol { list-style: revert; padding-left: 1.5rem; margin: revert; }
                .docx-render h1, .docx-render h2, .docx-render h3 { font-weight: revert; font-size: revert; margin: revert; }
              `}</style>
              <div className="p-6">
                <div ref={docxRef} className="mx-auto max-w-[850px] bg-white p-8 shadow-sm" />
              </div>
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-bg-container/80 text-sm text-text-muted">
                  <Loader2 size={16} className="animate-spin" />
                  Loading preview...
                </div>
              )}
            </>
          ) : isXlsx ? (
            <>
              <style>{`
                .xlsx-render { background: #ffffff; color: #1f1712; }
                .xlsx-render table { border-collapse: collapse; font-size: 0.8rem; }
                .xlsx-render td, .xlsx-render th { border: 1px solid #ddd; padding: 4px 10px; white-space: nowrap; }
                .xlsx-render tr:first-child td { background: #E8D2AF; font-weight: 600; }
              `}</style>
              <div
                className="xlsx-render overflow-auto p-4"
                dangerouslySetInnerHTML={{ __html: excelHtml ?? "" }}
              />
            </>
          ) : status === "loading" ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading preview...
            </div>
          ) : status === "error" ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-alert-error">
              {errorMsg}
            </div>
          ) : text !== null ? (
            <pre className="whitespace-pre-wrap break-words p-6 text-sm text-[#1f1712]">{text}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Notes() {
  const { user, loading: authLoading } = useAuth();

  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [category, setCategory] = useState<Category>("notes");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [combineOcrImages, setCombineOcrImages] = useState(false);
  const [ocrDocumentName, setOcrDocumentName] = useState("");
  const [ocrPageNames, setOcrPageNames] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [retryingOcrIds, setRetryingOcrIds] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState("all");
  const [previewDoc, setPreviewDoc] = useState<NoteDoc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NoteDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  useSetPageContext(
    {
      page: "notes",
      label: "Notes",
      summary:
        "The student is viewing their Notes page, where they can upload documents to be scanned in and review documents they've previously scanned. Each upload is tied to one of their enrolled classes. These documents are handwritten notes that an OCR model will scan and transcribe to plain text that can be viewed and stored.",
      data: { documentCount: notes.length },
    },
    [notes.length]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setClassesLoading(false);
      return;
    }

    const fetchClasses = async () => {
      try {
        const snap = await getDocs(collection(db, "users", user.uid, "enrollment"));
        const list: EnrolledClass[] = [];
        snap.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            className: data.className ?? "",
            classCode: data.classCode ?? "",
            term: data.term ?? "",
          });
        });
        list.sort((a, b) => a.classCode.localeCompare(b.classCode));
        setClasses(list);
        setSelectedClassId((prev) =>
          prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? "")
        );
      } catch (err) {
        console.error("Error fetching enrollments:", err);
      } finally {
        setClassesLoading(false);
      }
    };

    fetchClasses();
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    if (classes.length === 0) {
      setNotes([]);
      setNotesError(null);
      setNotesLoading(false);
      return;
    }

    setNotesLoading(true);
    setNotesError(null);

    const notesByClass = new Map<string, NoteDoc[]>();
    const initializedClasses = new Set<string>();
    const failedClasses = new Set<string>();

    const publishNotes = () => {
      const all = Array.from(notesByClass.values()).flat();
      all.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
      setNotes(all);

      if (initializedClasses.size === classes.length) {
        setNotesLoading(false);
        setNotesError(
          failedClasses.size === classes.length ? "Couldn't load your documents." : null
        );
      }
    };

    const unsubscribers = classes.map((cls) =>
      onSnapshot(
        collection(db, "users", user.uid, "enrollment", cls.id, "resources"),
        (snapshot) => {
          const classNotes: NoteDoc[] = [];
          snapshot.forEach((resourceDoc) => {
            const resource = resourceDoc.data();
            if (resource.category !== "notes") return;

            const name = resource.name ?? "Untitled";
            classNotes.push({
              id: resourceDoc.id,
              classId: cls.id,
              name,
              url: resource.url ?? "",
              fileType:
                getFileType(`resource.${resource.fileType ?? ""}`) ??
                getFileType(name) ??
                "txt",
              category: (resource.category as Category) ?? "notes",
              uploadedAt: toDateSafe(resource.uploadedAt),
              ocrScanned: resource.ocrScanned === true,
              ocrStatus: isOcrStatus(resource.ocrStatus) ? resource.ocrStatus : undefined,
              ocrTranscriptUrl:
                typeof resource.ocrTranscriptUrl === "string" ? resource.ocrTranscriptUrl : undefined,
              ocrError: typeof resource.ocrError === "string" ? resource.ocrError : undefined,
              indexStatus: isIndexStatus(resource.indexStatus) ? resource.indexStatus : undefined,
              indexError: typeof resource.indexError === "string" ? resource.indexError : undefined,
            });
          });

          notesByClass.set(cls.id, classNotes);
          initializedClasses.add(cls.id);
          failedClasses.delete(cls.id);
          publishNotes();
        },
        (error) => {
          console.error(`Failed to watch resources for class ${cls.id}:`, error);
          notesByClass.set(cls.id, []);
          initializedClasses.add(cls.id);
          failedClasses.add(cls.id);
          publishNotes();
        }
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user, classes]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewDoc(null);
        setDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function applyFileSelection(files: File[]) {
    let remaining = files;
    let error: string | null = null;

    if (remaining.length > MAX_FILES_PER_BATCH) {
      error = `You can upload up to ${MAX_FILES_PER_BATCH} files at once — only the first ${MAX_FILES_PER_BATCH} were kept.`;
      remaining = remaining.slice(0, MAX_FILES_PER_BATCH);
    }

    const oversized = remaining.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      const msg = `Skipped (over 20MB): ${oversized.map((f) => f.name).join(", ")}`;
      error = error ? `${error} ${msg}` : msg;
      remaining = remaining.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    }

    const unsupported = remaining.filter((f) => !getFileType(f.name));
    if (unsupported.length > 0) {
      const msg = `Skipped unsupported files: ${unsupported.map((f) => f.name).join(", ")}`;
      error = error ? `${error} ${msg}` : msg;
      remaining = remaining.filter((f) => getFileType(f.name));
    }

    setUploadError(error);
    setSelectedFiles(remaining);
    setOcrPageNames(remaining.map((file) => file.name));
    if (!remaining.every((file) => IMAGE_TYPES.includes(getFileType(file.name) ?? ""))) {
      setCombineOcrImages(false);
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      applyFileSelection(Array.from(e.dataTransfer.files));
    }
  };

  async function handleUpload() {
    if (!user || !selectedClassId || selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const allImages = selectedFiles.every((file) => IMAGE_TYPES.includes(getFileType(file.name) ?? ""));
      if (combineOcrImages) {
        if (!allImages) throw new Error("An OCR document can contain image files only.");
        await uploadOcrDocument({
          userId: user.uid,
          classDocId: selectedClassId,
          files: selectedFiles,
          category,
          name: ocrDocumentName,
          pageNames: ocrPageNames,
        });
      } else {
        await Promise.all(
          selectedFiles.map((file) =>
            uploadUserResource({ userId: user.uid, classDocId: selectedClassId, file, category })
          )
        );
      }
      setSelectedFiles([]);
      setCombineOcrImages(false);
      setOcrDocumentName("");
      setOcrPageNames([]);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleRetryOcr(doc: NoteDoc) {
    if (!user || retryingOcrIds.has(doc.id)) return;

    setRetryingOcrIds((previous) => new Set(previous).add(doc.id));
    fetch("/api/embed-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.uid, courseId: doc.classId, resourceId: doc.id }),
      keepalive: true,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`OCR retry failed (${response.status})`);
      })
      .catch((error) => console.error(`OCR retry failed for "${doc.name}":`, error))
      .finally(() => {
        setRetryingOcrIds((previous) => {
          const next = new Set(previous);
          next.delete(doc.id);
          return next;
        });
      });
  }

  async function handleDelete() {
    if (!user || !deleteTarget) return;

    setDeleting(true);
    try {
      const key = decodeURIComponent(deleteTarget.url.split("key=")[1] ?? "");
      await deleteUserResource(user.uid, deleteTarget.classId, deleteTarget.id, key);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }

  if (authLoading || classesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const classById = (id: string) => classes.find((c) => c.id === id);
  const visibleNotes =
    classFilter === "all" ? notes : notes.filter((n) => n.classId === classFilter);
  const syncedPreviewDoc = previewDoc
    ? notes.find((note) => note.id === previewDoc.id && note.classId === previewDoc.classId) ??
      previewDoc
    : null;

  return (
    <section className="min-h-screen bg-bg-main px-8 py-8 text-text-main">
      <div className="mx-auto max-w-7xl">
        {/* ── Page header ── */}
        <header className="mb-7 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 mt-9 flex items-center gap-2 text-xs text-text-muted">
              <Notebook size={15} strokeWidth={1.8} />
              <span>Dashboard</span>
              <span>/</span>
              <span className="font-medium text-text-main">Notes</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-main">Notes</h1>
            <p className="mt-1.5 max-w-xl text-sm text-text-muted">
              Upload documents to have them scanned in, and come back here to review everything
              you&apos;ve already scanned. Each upload is tied to a class, so it also shows up in
              that class&apos;s resources.
            </p>
          </div>
        </header>

        {/* ── Upload area ── */}
        {classes.length === 0 ? (
          <div className="rounded-3xl border border-border-light bg-bg-container p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-warm">
              <GraduationCap size={28} strokeWidth={1.8} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-text-main">
              You&apos;re not enrolled in any classes yet
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
              Documents are stored with a class. Add a class first, then come back here to upload
              your notes.
            </p>
            <Link
              href="/classes"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover"
            >
              Go to Classes
            </Link>
          </div>
        ) : (
          <div className="rounded-3xl border border-border-light bg-bg-container p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row">
              <label className="block flex-1">
                <span className="mb-1.5 block text-xs font-medium text-text-muted">Class</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  disabled={isUploading}
                  className="w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main outline-none transition focus:border-primary"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.classCode} — {c.className}
                      {c.term ? ` (${c.term})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block w-full sm:w-52">
                <span className="mb-1.5 block text-xs font-medium text-text-muted">Tag</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  disabled={isUploading}
                  className="w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main outline-none transition focus:border-primary"
                >
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
              onClick={() => {
                if (!isUploading) fileInputRef.current?.click();
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                isDragging ? "border-primary bg-bg-warm" : "border-border-hover bg-bg-main hover:border-primary"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) applyFileSelection(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-warm">
                <UploadCloud size={24} strokeWidth={1.8} className="text-primary" />
              </div>
              <h2 className="text-base font-semibold text-text-main">Drop your document here</h2>
              <p className="mt-1 max-w-md text-sm text-text-muted">
                Drop a picture or file of your handwritten notes to have it scanned in, or browse
                your files below.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover">
                <Upload size={16} strokeWidth={2} />
                Browse files
              </span>
            </div>

            {selectedFiles.length > 0 && (
              <ul className="mt-4 space-y-2">
                {selectedFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-border-light bg-bg-main px-3 py-2"
                  >
                    <span className="text-text-muted">{typeIcon(getFileType(file.name) ?? "txt")}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-main">{file.name}</span>
                    <span className="shrink-0 text-xs text-text-muted">
                      {(file.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
                        setOcrPageNames((prev) => prev.filter((_, i) => i !== index));
                      }}
                      disabled={isUploading}
                      className="shrink-0 text-text-muted transition hover:text-alert-error"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selectedFiles.length > 0 && selectedFiles.every((file) => IMAGE_TYPES.includes(getFileType(file.name) ?? "")) && (
              <div className="mt-4 rounded-xl border border-border-light bg-bg-main p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-main">
                  <input
                    type="checkbox"
                    checked={combineOcrImages}
                    onChange={(event) => setCombineOcrImages(event.target.checked)}
                    disabled={isUploading}
                  />
                  Combine these images into one OCR document
                </label>
                <p className="mt-1 text-xs text-text-muted">
                  The combined transcript will be the one class resource the AI uses.
                </p>
                {combineOcrImages && (
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-medium text-text-main">
                      Class resource title
                      <input
                        value={ocrDocumentName}
                        onChange={(event) => setOcrDocumentName(event.target.value)}
                        placeholder="Homework 3 notes"
                        disabled={isUploading}
                        className="mt-1 w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </label>
                    <div>
                      <p className="text-xs font-medium text-text-main">Source-image names</p>
                      <p className="mt-0.5 text-xs text-text-muted">These label the pages in the combined transcript.</p>
                      <div className="mt-2 space-y-2">
                        {selectedFiles.map((file, index) => (
                          <label key={`${file.name}-${index}`} className="block text-xs text-text-muted">
                            Image {index + 1}
                            <input
                              value={ocrPageNames[index] ?? file.name}
                              onChange={(event) => setOcrPageNames((previous) => previous.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}
                              disabled={isUploading}
                              className="mt-1 w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {uploadError && <p className="mt-3 text-xs text-alert-error">{uploadError}</p>}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                Up to {MAX_FILES_PER_BATCH} files at a time, 20MB each
              </p>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading || selectedFiles.length === 0 || !selectedClassId}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={16} strokeWidth={2} />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Previously scanned documents ── */}
        <div className="mt-8 rounded-3xl border border-border-light bg-bg-container p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border-light pb-4">
            <div>
              <h2 className="text-xl font-semibold text-text-main">Your documents</h2>
              <p className="mt-0.5 text-sm text-text-muted">
                Notes uploaded here show up below, and in the resources area of their class.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {classes.length > 1 && (
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="rounded-md border border-border-light bg-bg-main px-2 py-1.5 text-xs text-text-main outline-none focus:border-primary"
                >
                  <option value="all">All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.classCode}
                    </option>
                  ))}
                </select>
              )}
              <span className="rounded-full bg-bg-warm px-3 py-1 text-xs font-medium text-text-muted">
                {visibleNotes.length} {visibleNotes.length === 1 ? "document" : "documents"}
              </span>
            </div>
          </div>

          {notesLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading documents...
            </div>
          ) : notesError ? (
            <p className="py-16 text-center text-sm text-alert-error">{notesError}</p>
          ) : visibleNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-warm">
                <FileText size={24} strokeWidth={1.8} className="text-text-muted" />
              </div>
              <p className="font-medium text-text-main">No documents yet</p>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                Upload a document above to have it scanned in — it&apos;ll appear here so you can
                review it.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border-light rounded-xl border border-border-light">
              {visibleNotes.map((doc) => {
                const cls = classById(doc.classId);
                return (
                  <li
                    key={doc.id}
                    className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-bg-main"
                  >
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-warm text-text-muted">
                        {typeIcon(doc.fileType)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text-main group-hover:text-primary">
                          {doc.name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
                          <span className="font-medium text-primary">{cls?.classCode ?? doc.classId}</span>
                          {cls?.className && <span>{cls.className}</span>}
                          <span>&middot; {formatRelativeDate(doc.uploadedAt)}</span>
                          <span className="rounded-full bg-bg-warm px-2 py-0.5 text-[10px] font-medium text-text-muted">
                            {CATEGORY_LABELS[doc.category] ?? doc.category}
                          </span>
                          {doc.ocrStatus ? (
                            <OcrStatusBadge status={doc.ocrStatus} />
                          ) : doc.ocrScanned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-bg-warm px-2 py-0.5 text-[10px] font-medium text-primary">
                              <ScanText size={11} /> OCR
                            </span>
                          ) : null}
                          {doc.indexStatus && <IndexStatusBadge status={doc.indexStatus} />}
                        </span>
                      </span>
                    </button>
                    {doc.ocrStatus === "failed" && (
                      <button
                        onClick={() => handleRetryOcr(doc)}
                        disabled={retryingOcrIds.has(doc.id)}
                        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary transition hover:bg-bg-warm disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Retry OCR for ${doc.name}`}
                      >
                        {retryingOcrIds.has(doc.id) ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(doc)}
                      className="shrink-0 rounded-md p-2 text-text-muted transition hover:bg-alert-error-bg hover:text-alert-error"
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {syncedPreviewDoc && (
        <DocumentPreviewModal
          doc={syncedPreviewDoc}
          onRetryOcr={handleRetryOcr}
          retryingOcr={retryingOcrIds.has(syncedPreviewDoc.id)}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-bg-container p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-sm font-semibold text-text-main">
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h3>
            <p className="mb-6 text-sm text-text-muted">
              This removes it from your notes and the class resources. This can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-md border border-border-light py-2 text-sm font-medium text-text-main hover:bg-bg-main"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-alert-error py-2 text-sm font-medium text-text-inverse transition hover:bg-alert-error-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
