"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { // import symbols
    X,
    ChevronLeft,
    ChevronRight,
    List,
    LayoutGrid,
    GalleryHorizontal,
    CheckSquare,
    Square,
    Download,
    Trash2,
    Search,
    Filter,
    FileText,
    FileCode,
    FileArchive,
    FileSpreadsheet,
    FileImage,
    Presentation,
    BookOpen,
    Loader2,
    Minus,
    Plus,
    ScanText,
    RotateCcw,
    Pencil,
    NotebookPen,
} from "lucide-react";
import Link from "next/link";
import AddNotesFlow from "@/src/components/notes/AddNotesFlow";
import { addResourceToNotes, documentNoteId, isResourceInNotes, subscribeNotes } from "@/src/library/notes/notesStore";
// PrismLight + explicit per-language registration instead of the default
// `react-syntax-highlighter` import, which bundles all ~300 Prism language
// grammars (~400KB) even though this app only ever highlights ~20 of them —
// that was the single biggest contributor to this route's dev-compile time
// and its production JS bundle size.
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import nasm from "react-syntax-highlighter/dist/esm/languages/prism/nasm";

[
    ["python", python], ["javascript", javascript], ["jsx", jsx], ["typescript", typescript],
    ["tsx", tsx], ["java", java], ["go", go], ["sql", sql], ["c", c], ["cpp", cpp],
    ["csharp", csharp], ["rust", rust], ["markup", markup], ["css", css], ["php", php],
    ["ruby", ruby], ["kotlin", kotlin], ["swift", swift], ["bash", bash], ["nasm", nasm],
].forEach(([name, lang]) => SyntaxHighlighter.registerLanguage(name as string, lang as any));
import { renderAsync } from "docx-preview";
import { collection, getDocs, onSnapshot, orderBy, query } from "firebase/firestore";
import CircleIconButton from "./CircleIconButton";
import { addOcrDocumentPages, getCourseResources, deleteUserResource, INDEXABLE_FILE_TYPES } from "./fileUploadService";
import { db } from "@/src/library/firebase";
import { useLearningProgress } from "@/src/hooks/useLearningProgress";
import { documentTargetForResource, findResourceForSourceDocKey } from "@/src/library/studyPlan/recommendationEngine";
import { resolveFlashcardNextStep, type FlashcardNextStep, type FlashcardSetRef } from "@/src/library/studyPlan/nextStudyActivity";
import NextStepGuidance from "@/src/components/studyPlan/NextStepGuidance";

export type Category = "classDoc" | "notes" | "assignments";
type OcrStatus = "queued" | "processing" | "complete" | "failed";
type IndexStatus = "queued" | "processing" | "complete" | "failed";
type OcrPage = { id: string; name: string; order: number; url: string };

// Code language syntax highlighting support
const CODE_TYPES = {
    txt: { label: "TXT", prismLanguage: "text", color: "#8C7A67", bg: "#F0EFEA" },
    py: { label: "PY", prismLanguage: "python", color: "#4C9A6A", bg: "#EAF4EC" },
    js: { label: "JS", prismLanguage: "javascript", color: "#7A4F30", bg: "#FBF3E1" },
    jsx: { label: "JSX", prismLanguage: "jsx", color: "#7A4F30", bg: "#FBF3E1" },
    ts: { label: "TS", prismLanguage: "typescript", color: "#3178C6", bg: "#E7EFFB" },
    tsx: { label: "TSX", prismLanguage: "tsx", color: "#3178C6", bg: "#E7EFFB" },
    java: { label: "JAVA", prismLanguage: "java", color: "#B07219", bg: "#FBF1E1" },
    go: { label: "GO", prismLanguage: "go", color: "#00ACD7", bg: "#E3F7FC" },
    sql: { label: "SQL", prismLanguage: "sql", color: "#4A6FA5", bg: "#E8EEF9" },
    c: { label: "C", prismLanguage: "c", color: "#555555", bg: "#EFEFEF" },
    cpp: { label: "C++", prismLanguage: "cpp", color: "#004482", bg: "#E3ECF5" },
    cs: { label: "C#", prismLanguage: "csharp", color: "#68217A", bg: "#F1E7F4" },
    rs: { label: "RUST", prismLanguage: "rust", color: "#DE6E4B", bg: "#FBEAE3" },
    html: { label: "HTML", prismLanguage: "markup", color: "#B85C45", bg: "#FBEAE7" },
    css: { label: "CSS", prismLanguage: "css", color: "#2965F1", bg: "#E6ECFD" },
    php: { label: "PHP", prismLanguage: "php", color: "#787CB5", bg: "#EDEEF7" },
    rb: { label: "RUBY", prismLanguage: "ruby", color: "#CC342D", bg: "#FBE7E6" },
    kt: { label: "KOTLIN", prismLanguage: "kotlin", color: "#7F52FF", bg: "#EFEAFF" },
    swift: { label: "SWIFT", prismLanguage: "swift", color: "#F05138", bg: "#FDEBE7" },
    sh: { label: "SHELL", prismLanguage: "bash", color: "#4EAA25", bg: "#EAF6E4" },
    asm: { label: "ASM", prismLanguage: "nasm", color: "#6E6E6E", bg: "#EFEFEF" },
} as const;
type CodeType = keyof typeof CODE_TYPES;

// other supported file types
export type FileType = CodeType | "pdf" | "docx" | "zip" | "pptx" | "one" | "xlsx" | "image";
// "download only" formats — no in-browser rendering attempted, since there's
const DOWNLOAD_ONLY_TYPES: FileType[] = ["zip", "pptx", "one"];
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
const NON_CODE_META: Record<"pdf" | "docx" | "zip" | "pptx" | "one" | "xlsx" | "image", { label: string; color: string; bg: string }> = {
    pdf: { label: "PDF", color: "#B85C45", bg: "#FBEAE7" },
    docx: { label: "DOCX", color: "#4A6FA5", bg: "#E8EEF9" },
    zip: { label: "ZIP", color: "#8A6D3B", bg: "#F5EEDC" },
    pptx: { label: "PPTX", color: "#C1440E", bg: "#FBE9E1" },
    one: { label: "ONE", color: "#7C3F00", bg: "#F5E9DC" },
    xlsx: { label: "XLSX", color: "#1D6F42", bg: "#E5F3EA" },
    image: { label: "IMG", color: "#5B7A99", bg: "#E8F0F7" },
};

const TYPE_META: Record<FileType, { label: string; color: string; bg: string }> = {
    ...(Object.fromEntries(
        Object.entries(CODE_TYPES).map(([k, v]) => [k, { label: v.label, color: v.color, bg: v.bg }])
    ) as Record<CodeType, { label: string; color: string; bg: string }>),
    ...NON_CODE_META,
};

const VALID_FILE_TYPES: FileType[] = [
    ...(Object.keys(CODE_TYPES) as CodeType[]),
    "pdf",
    "docx",
    "zip",
    "pptx",
    "one",
    "xlsx",
    "image",
];

const PAGE_SIZE = 9;

export interface Resource {
    id: string;
    name: string;
    url: string;
    fileType: FileType;
    category: Category;
    uploadedAt: Date;
    lastViewedAt: Date;
    // Set when a generated text resource came from an uploaded image scan.
    ocrScanned?: boolean;
    ocrStatus?: OcrStatus;
    ocrTranscriptUrl?: string;
    ocrError?: string;
    indexStatus?: IndexStatus;
    indexError?: string;
    resourceKind?: "ocr_document" | "typed_note";
    pageCount?: number;
    // The file the transcript came from (a scanned PDF or a photo).
    ocrSourceUrl?: string;
    ocrSourceName?: string;
    ocrSourceFileType?: string;
    indexSkipped?: boolean;
    // Typed notes shown alongside the course's files.
    noteId?: string;
    snippet?: string;
    manualTranscript?: boolean;
    sourceDocKey?: string;
    storageKey?: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
    classDoc: "Class Doc",
    notes: "Notes",
    assignments: "Assignments",
};

function OcrScannedBadge() {
    return (
        <span
            title="Created from an OCR scan"
            className="inline-flex items-center gap-1 rounded-full bg-bg-warm px-2 py-0.5 text-[10px] font-medium text-primary"
        >
            <ScanText size={11} strokeWidth={2.25} />
            OCR
        </span>
    );
}

function TypedNoteBadge() {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-bg-warm px-2 py-0.5 text-[10px] font-medium text-primary">
            <NotebookPen size={11} strokeWidth={2.25} />
            Note
        </span>
    );
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

function getFileType(fileName: string): FileType | null {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!ext) return null;
    if (ext in CODE_TYPES) return ext as CodeType;
    if (ext === "pdf" || ext === "docx" || ext === "zip" || ext === "pptx" || ext === "one") return ext;
    if (ext === "xlsx" || ext === "xls") return "xlsx";
    if (IMAGE_EXTENSIONS.includes(ext)) return "image";
    return null;
}

function toDateSafe(value: any): Date {
    if (value && typeof value.toDate === "function") return value.toDate();
    return new Date();
}

function toResource(raw: any): Resource | null {
    const fileType = raw.resourceKind === "ocr_document"
        ? "txt"
        : getFileType(raw.name ?? "") ?? getFileType(`resource.${raw.fileType ?? ""}`);
    if (!fileType) return null;
    return {
        id: raw.id,
        name: raw.name,
        url: raw.url,
        fileType,
        category: (raw.category as Category) ?? "notes",
        uploadedAt: toDateSafe(raw.uploadedAt),
        lastViewedAt: toDateSafe(raw.lastViewedAt),
        ocrScanned: raw.ocrScanned === true,
        ocrStatus: isOcrStatus(raw.ocrStatus) ? raw.ocrStatus : undefined,
        ocrTranscriptUrl: typeof raw.ocrTranscriptUrl === "string" ? raw.ocrTranscriptUrl : undefined,
        ocrError: typeof raw.ocrError === "string" ? raw.ocrError : undefined,
        indexStatus: isIndexStatus(raw.indexStatus) ? raw.indexStatus : undefined,
        indexError: typeof raw.indexError === "string" ? raw.indexError : undefined,
        resourceKind: raw.resourceKind === "ocr_document" ? "ocr_document" : undefined,
        ocrSourceUrl: typeof raw.ocrSourceUrl === "string" ? raw.ocrSourceUrl : undefined,
        ocrSourceName: typeof raw.ocrSourceName === "string" ? raw.ocrSourceName : undefined,
        ocrSourceFileType: typeof raw.ocrSourceFileType === "string" ? raw.ocrSourceFileType.toLowerCase() : undefined,
        indexSkipped: raw.indexSkipped === true,
        pageCount: typeof raw.pageCount === "number" ? raw.pageCount : undefined,
        manualTranscript: raw.manualTranscript === true,
        sourceDocKey: typeof raw.sourceDocKey === "string" ? raw.sourceDocKey : undefined,
        storageKey: typeof raw.storageKey === "string" ? raw.storageKey : undefined,
    };
}

function millisFrom(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
    if (
        value &&
        typeof value === "object" &&
        "toMillis" in value &&
        typeof (value as { toMillis: unknown }).toMillis === "function"
    ) {
        const millis = (value as { toMillis: () => unknown }).toMillis();
        return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
    }
    return null;
}

function matchingFlashcardSets(sourceDocKey: string, resource: Resource, sets: FlashcardSetRef[]): FlashcardSetRef[] {
    const resourceRef = {
        id: resource.id,
        url: resource.url,
        sourceDocKey: resource.sourceDocKey,
        storageKey: resource.storageKey,
    };
    return sets
        .filter((set) => {
            if (!set.sourceDocKey) return false;
            if (set.sourceDocKey === sourceDocKey) return true;
            return findResourceForSourceDocKey(set.sourceDocKey, [resourceRef]) != null;
        })
        .map((set) => ({ ...set, sourceDocKey }));
}

async function loadFlashcardSetRefs(userId: string, courseId: string): Promise<FlashcardSetRef[]> {
    const snapshot = await getDocs(collection(db, "users", userId, "enrollment", courseId, "flashcardSets"));
    return snapshot.docs.map((setDoc) => {
        const data = setDoc.data();
        return {
            id: setDoc.id,
            sourceDocKey: typeof data.sourceDocKey === "string" ? data.sourceDocKey : null,
            createdAt: millisFrom(data.createdAt),
            updatedAt: millisFrom(data.updatedAt),
        };
    });
}

function thumbnailCacheKey(resource: Resource): string {
    return `${resource.fileType}:${resource.url}`;
}

type ThumbnailData = { kind: "image" | "text"; content: string };

async function generateThumbnail(resource: Resource): Promise<ThumbnailData | null> {
    try {
        if (!resource.url) return null;
        if (resource.fileType === "image") {
            const res = await fetch(resource.url);
            if (!res.ok) return null;
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("Failed to read image"));
                reader.readAsDataURL(blob);
            });
            return { kind: "image", content: dataUrl };
        }

        if (resource.fileType === "pdf") {
            const pdfjsLib = await import("pdfjs-dist");
            // Version query busts a stale cached worker after pdfjs-dist upgrades
            // (mismatched API/Worker versions throw UnknownErrorException).
            pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;

            const res = await fetch(resource.url);
            if (!res.ok) return null;
            const arrayBuffer = await res.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.6 });

            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext("2d");
            if (!context) return null;

            await page.render({ canvasContext: context, viewport, canvas: canvas }).promise;
            return { kind: "image", content: canvas.toDataURL("image/png") };
        }

        if (resource.fileType === "docx") {
            const mammoth = (await import("mammoth")).default;
            const res = await fetch(resource.url);
            if (!res.ok) return null;
            const arrayBuffer = await res.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return { kind: "text", content: result.value.slice(0, 240) };
        }

        if (resource.fileType === "xlsx") {
            const XLSX = await import("xlsx");
            const res = await fetch(resource.url);
            if (!res.ok) return null;
            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: string[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false });
            const snippet = rows
                .slice(0, 8)
                .map((row) => row.slice(0, 5).join("\t"))
                .join("\n");
            return { kind: "text", content: snippet };
        }

        if (DOWNLOAD_ONLY_TYPES.includes(resource.fileType)) return null;

        const res = await fetch(resource.url);
        if (!res.ok) return null;
        const text = await res.text();
        return { kind: "text", content: text.slice(0, 240) };
    } catch (err) {
        console.error(`Thumbnail generation failed for ${resource.name}:`, err);
        return null;
    }
}

type ViewMode = "tile" | "row" | "closeup";

const VIEW_CYCLE: ViewMode[] = ["tile", "row", "closeup"];
const VIEW_META: Record<ViewMode, { icon: JSX.Element; label: string }> = {
    tile: { icon: <LayoutGrid size={15} />, label: "Tile view" },
    row: { icon: <List size={15} />, label: "Row view" },
    closeup: { icon: <GalleryHorizontal size={15} />, label: "Close-up view" },
};

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

function FileThumbnail({
    fileType,
    preview,
    fontSizePx = 6,
}: {
    fileType: FileType;
    preview?: ThumbnailData;
    fontSizePx?: number;
}) {
    if (preview?.kind === "image") {
        return <img src={preview.content} alt="" className="h-full w-full object-cover" />;
    }

    if (preview?.kind === "text") {
        return (
            <div className="h-full w-full overflow-hidden bg-white p-2 text-left">
                {/* Deliberately always-white "paper" swatch, like the docx
                    preview canvas below — the text color is fixed to match,
                    not theme-driven. */}
                <pre
                    className="whitespace-pre-wrap break-words text-left leading-tight text-[#5C5648]"
                    style={{ fontSize: `${fontSizePx}px` }}
                >
                    {preview.content}
                </pre>
            </div>
        );
    }

    const meta = TYPE_META[fileType];
    const icon =
        fileType === "zip" ? (
            <FileArchive size={20} />
        ) : fileType === "pptx" ? (
            <Presentation size={20} />
        ) : fileType === "one" ? (
            <BookOpen size={20} />
        ) : fileType === "xlsx" ? (
            <FileSpreadsheet size={20} />
        ) : fileType === "image" ? (
            <FileImage size={20} />
        ) : fileType === "pdf" || fileType === "docx" ? (
            <FileText size={20} />
        ) : (
            <FileCode size={20} />
        );

    return (
        <div
            className="flex h-full w-full flex-col items-center justify-center gap-1"
            style={{ backgroundColor: meta.bg, color: meta.color }}
        >
            {icon}
            <span className="text-[10px] font-semibold tracking-wide">{meta.label}</span>
        </div>
    );
}

export default function ResourcePreview({ userId, courseId, initialResourceId = null, taskId = null }: { userId: string; courseId: string; initialResourceId?: string | null; taskId?: string | null }) {
    const { finishReading } = useLearningProgress();
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoadingResources, setIsLoadingResources] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>("tile");
    const [tileZoom, setTileZoom] = useState(1);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [activeIndex, setActiveIndex] = useState(0);
    const [previewResource, setPreviewResource] = useState<Resource | null>(null);
    const [retryingOcrIds, setRetryingOcrIds] = useState<Set<string>>(new Set());
    const [ocrPages, setOcrPages] = useState<OcrPage[]>([]);
    const [showOcrPages, setShowOcrPages] = useState(false);

    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const [showNotesFlow, setShowNotesFlow] = useState(false);
    const [typedNotes, setTypedNotes] = useState<Resource[]>([]);
    const [viewOriginal, setViewOriginal] = useState(false);
    // Whether the file being previewed is in the Notes tab ("Add to Notes").
    const [notesState, setNotesState] = useState<"unknown" | "out" | "adding" | "in">("unknown");
    const pageUploadRef = useRef<HTMLInputElement | null>(null);
    const [addingPages, setAddingPages] = useState(false);
    const [editingTranscript, setEditingTranscript] = useState(false);
    const [editedTranscript, setEditedTranscript] = useState("");
    const [savingTranscript, setSavingTranscript] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
    const [fileTypeFilters, setFileTypeFilters] = useState<Set<FileType>>(new Set(VALID_FILE_TYPES));
    const [sortBy, setSortBy] = useState<"name" | "uploadedAt" | "lastViewedAt">("name");
    const [showFilterPopup, setShowFilterPopup] = useState(false);
    const filterPopupRef = useRef<HTMLDivElement | null>(null);

    const [previewText, setPreviewText] = useState<string | null>(null);
    const [excelHtml, setExcelHtml] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [initialResourceUnavailable, setInitialResourceUnavailable] = useState(false);
    const [finishingReading, setFinishingReading] = useState(false);
    const [readingSaved, setReadingSaved] = useState(false);
    const readingSavedRef = useRef(false);
    const finishReadingInFlight = useRef(false);
    const [finishReadingError, setFinishReadingError] = useState<string | null>(null);
    const [guidanceOpen, setGuidanceOpen] = useState(false);
    const [nextStep, setNextStep] = useState<FlashcardNextStep | null>(null);
    const docxContainerRef = useRef<HTMLDivElement | null>(null);

    const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailData>>({});
    const thumbnailInFlight = useRef<Set<string>>(new Set());
    const thumbnailSourceKeys = useRef<Record<string, string>>({});

    // WORD DOC PREVIEW CONSTANTS
    // Track zoom factor as a decimal multiplier (1.0 = 100%)
    const [zoom, setZoom] = useState<number>(1.0);

    // Helper functions to increase or decrease scale bounds securely
    const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.1, 2.0));  // Max 200%
    const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.1, 0.5)); // Min 50%
    const handleZoomReset = () => setZoom(1.0);

    function applyResources(nextResources: Resource[]) {
        setResources(nextResources);
        setThumbnails((previous) => {
            const next = { ...previous };
            const liveIds = new Set(nextResources.map((resource) => resource.id));
            for (const resource of nextResources) {
                if (thumbnailSourceKeys.current[resource.id] !== thumbnailCacheKey(resource)) {
                    delete next[resource.id];
                    delete thumbnailSourceKeys.current[resource.id];
                }
            }
            for (const id of Object.keys(thumbnailSourceKeys.current)) {
                if (!liveIds.has(id)) {
                    delete next[id];
                    delete thumbnailSourceKeys.current[id];
                }
            }
            return next;
        });
    }

    useEffect(() => {
        if (!previewResource || previewResource.resourceKind === "typed_note") {
            setNotesState("unknown");
            return;
        }
        let cancelled = false;
        setNotesState("unknown");
        isResourceInNotes(userId, courseId, previewResource.id)
            .then((inNotes) => !cancelled && setNotesState(inNotes ? "in" : "out"))
            .catch(() => !cancelled && setNotesState("out"));
        return () => {
            cancelled = true;
        };
    }, [previewResource, userId, courseId]);

    async function loadResources() {
        setIsLoadingResources(true);
        setLoadError(null);
        try {
            const raw = await getCourseResources(userId, courseId);
            const mapped: Resource[] = raw
                .map(toResource)
                .filter((r: Resource | null): r is Resource => r !== null);
            applyResources(mapped);

            // Self-healing lazy backfill: any resource that was indexed
            // before the Qdrant collection got recreated at the correct
            // vector dimension (2026-08-14) — or that failed indexing for
            // any other reason — sits with vectorIndexed unset forever
            // otherwise, since nothing re-triggers it. There's no bulk
            // admin backfill available (this app has no firebase-admin/
            // service-account path to iterate every user's documents at
            // once), so this re-embeds one resource at a time, the next
            // time its own owner actually looks at this course's
            // resources — fire-and-forget, same pattern as the upload
            // flow's own indexing call, so it never blocks or slows down
            // just viewing the list.
            raw.filter((r: any) => INDEXABLE_FILE_TYPES.includes((r.name as string).split(".").pop()?.toLowerCase() ?? "") && r.vectorIndexed !== true && r.indexSkipped !== true)
                .forEach((r: any) => {
                    fetch("/api/embed-document", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId, courseId, resourceId: r.id }),
                        keepalive: true,
                    }).catch((error) => console.error(`Background reindex of "${r.name}" failed:`, error));
                });
        } catch (err) {
            console.error("Error loading resources:", err);
            setLoadError("Couldn't load resources for this course.");
        } finally {
            setIsLoadingResources(false);
        }
    }

    useEffect(() => {
        loadResources();
        const unsubscribe = onSnapshot(
            collection(db, "users", userId, "enrollment", courseId, "resources"),
            (snapshot) => {
                const liveResources = snapshot.docs
                    .map((resourceDoc) => toResource({ id: resourceDoc.id, ...resourceDoc.data() }))
                    .filter((resource: Resource | null): resource is Resource => resource !== null);
                applyResources(liveResources);
                setIsLoadingResources(false);
                setLoadError(null);
            },
            (error) => {
                console.error("Error watching course resources:", error);
                setLoadError("Couldn't keep resources up to date.");
                setIsLoadingResources(false);
            }
        );
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, courseId]);

    useEffect(() => {
        return subscribeNotes(
            userId,
            (notes) => setTypedNotes(
                notes
                    .filter((note) => note.kind === "typed" && note.courseId === courseId && !note.hidden)
                    .map((note): Resource => ({
                        id: `note:${note.id}`,
                        name: note.title || "Untitled note",
                        url: "",
                        fileType: "txt",
                        category: "notes",
                        uploadedAt: note.createdAt,
                        lastViewedAt: note.updatedAt,
                        resourceKind: "typed_note",
                        noteId: note.id,
                        snippet: (note.plainText ?? "").trim(),
                    }))
            ),
            (error) => console.error("Couldn't load typed notes for this course:", error)
        );
    }, [userId, courseId]);

    const allResources = [...resources, ...typedNotes];

    useEffect(() => {
        setPreviewResource((current) =>
            current ? [...resources, ...typedNotes].find((resource) => resource.id === current.id) ?? current : null
        );
    }, [resources, typedNotes]);

    useEffect(() => {
        setViewOriginal(false);
    }, [previewResource?.id]);

    const openedResourceId = useRef<string | null>(null);
    useEffect(() => {
        if (!initialResourceId) {
            setInitialResourceUnavailable(false);
            return;
        }
        if (openedResourceId.current === initialResourceId) return;
        if (isLoadingResources) return;
        const match = resources.find((resource) => resource.id === initialResourceId);
        if (!match) {
            setInitialResourceUnavailable(true);
            return;
        }
        openedResourceId.current = initialResourceId;
        setInitialResourceUnavailable(false);
        setPreviewResource(match);
    }, [initialResourceId, resources, isLoadingResources]);

    useEffect(() => {
        readingSavedRef.current = false;
        setReadingSaved(false);
        setGuidanceOpen(false);
        setNextStep(null);
        setFinishReadingError(null);
    }, [initialResourceId, taskId]);

    async function handleFinishReading() {
        if (!taskId || !previewResource || previewResource.id !== initialResourceId) return;
        if (finishReadingInFlight.current) return;
        finishReadingInFlight.current = true;
        const sourceDocKey = documentTargetForResource(previewResource).sourceDocKey;
        setFinishingReading(true);
        setFinishReadingError(null);
        if (!readingSavedRef.current) {
            try {
                await finishReading({
                    courseId,
                    sourceDocKey,
                    resourceId: previewResource.id,
                    taskId,
                });
                readingSavedRef.current = true;
                setReadingSaved(true);
            } catch (error) {
                console.error("Finish reading failed:", error);
                setFinishReadingError("Your reading couldn't be saved. You can try again.");
                finishReadingInFlight.current = false;
                setFinishingReading(false);
                return;
            }
        }

        try {
            const sets = await loadFlashcardSetRefs(userId, courseId);
            setNextStep(resolveFlashcardNextStep(sourceDocKey, matchingFlashcardSets(sourceDocKey, previewResource, sets)));
            setGuidanceOpen(true);
        } catch (error) {
            console.error("Flashcard lookup failed:", error);
            setFinishReadingError("Your reading is saved. Flashcard options couldn't be loaded. You can try again.");
        } finally {
            finishReadingInFlight.current = false;
            setFinishingReading(false);
        }
    }

    useEffect(() => {
        if (!previewResource || previewResource.resourceKind !== "ocr_document") {
            setOcrPages([]);
            setShowOcrPages(false);
            return;
        }
        return onSnapshot(
            query(
                collection(db, "users", userId, "enrollment", courseId, "resources", previewResource.id, "pages"),
                orderBy("order", "asc")
            ),
            (snapshot) => setOcrPages(snapshot.docs.map((page) => ({
                id: page.id,
                name: typeof page.data().name === "string" ? page.data().name : "Untitled image",
                order: typeof page.data().order === "number" ? page.data().order : 0,
                url: typeof page.data().url === "string" ? page.data().url : "",
            }))),
            (error) => {
                console.error("Couldn't load OCR source images:", error);
                setPreviewError("Couldn't load the OCR source-image list.");
            }
        );
    }, [previewResource?.id, previewResource?.resourceKind, userId, courseId]);

    const presentFileTypes = Array.from(new Set(allResources.map((r) => r.fileType)));

    const filteredResources = allResources.filter((r) => {
        const matchesCategory = categoryFilter === "all" || r.category === categoryFilter;
        const matchesFileType = fileTypeFilters.has(r.fileType);
        const matchesSearch = r.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
        return matchesCategory && matchesFileType && matchesSearch;
    });

    const sortedResources = [...filteredResources].sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "uploadedAt") return b.uploadedAt.getTime() - a.uploadedAt.getTime();
        return b.lastViewedAt.getTime() - a.lastViewedAt.getTime();
    });

    const visibleResources = sortedResources.slice(0, visibleCount);

    // generate thumbnails lazily. Only for what's actually visible right now,
    // not the full list, to avoid fetching files nobody's scrolled to
    const closeupWindowResources =
        viewMode === "closeup"
            ? sortedResources.filter((_, idx) => Math.abs(idx - activeIndex) <= 2)
            : [];
    const toGenerateKey =
        viewMode === "tile"
            ? visibleResources.map((r) => r.id).join(",")
            : closeupWindowResources.map((r) => r.id).join(",");

    useEffect(() => {
        if (viewMode === "row") return;

        const toGenerate = viewMode === "tile" ? visibleResources : closeupWindowResources;

        toGenerate.forEach((resource) => {
            if (thumbnails[resource.id] || thumbnailInFlight.current.has(resource.id)) return;
            if (DOWNLOAD_ONLY_TYPES.includes(resource.fileType)) return;
            if (resource.resourceKind === "typed_note") return;

            thumbnailInFlight.current.add(resource.id);
            const sourceKey = thumbnailCacheKey(resource);
            generateThumbnail(resource)
                .then((result) => {
                    if (result) {
                        thumbnailSourceKeys.current[resource.id] = sourceKey;
                        setThumbnails((prev) => ({ ...prev, [resource.id]: result }));
                    }
                })
                .finally(() => {
                    thumbnailInFlight.current.delete(resource.id);
                });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, toGenerateKey]);

    useEffect(() => {
        if (!previewResource) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPreviewResource(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [previewResource]);

    useEffect(() => {
        setActiveIndex(0);
        setVisibleCount(PAGE_SIZE);
    }, [searchQuery, categoryFilter, fileTypeFilters, sortBy, viewMode]);

    useEffect(() => {
        if (activeIndex >= sortedResources.length) {
            setActiveIndex(Math.max(0, sortedResources.length - 1));
        }
    }, [sortedResources.length, activeIndex]);

    useEffect(() => {
        if (!showFilterPopup) return;
        function onClick(e: MouseEvent) {
            if (filterPopupRef.current && !filterPopupRef.current.contains(e.target as Node)) {
                setShowFilterPopup(false);
            }
        }
        window.addEventListener("mousedown", onClick);
        return () => window.removeEventListener("mousedown", onClick);
    }, [showFilterPopup]);

    useEffect(() => {
        if (!previewResource) {
            setPreviewText(null);
            setExcelHtml(null);
            setPreviewError(null);
            return;
        }

        const type = previewResource.fileType;

        if (
            previewResource.resourceKind === "typed_note" ||
            (previewResource.resourceKind === "ocr_document" && !previewResource.url) ||
            type === "pdf" || DOWNLOAD_ONLY_TYPES.includes(type) || type === "image"
        ) {
            setPreviewText(null);
            setExcelHtml(null);
            setPreviewLoading(false);
            setPreviewError(null);
            return;
        }

        let cancelled = false;
        setPreviewLoading(true);
        setPreviewError(null);
        setPreviewText(null);
        setExcelHtml(null);

        async function load() {
            try {
                if (type === "docx") {
                    const res = await fetch(previewResource!.url);
                    if (!res.ok) throw new Error("File not found");
                    const arrayBuffer = await res.arrayBuffer();
                    if (cancelled || !docxContainerRef.current) return;
                    docxContainerRef.current.innerHTML = "";
                    await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
                        className: "docx-render",
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        trimXmlDeclaration: true,
                        useBase64URL: true,
                    });
                } else if (type === "xlsx") {
                    const XLSX = await import("xlsx");
                    const res = await fetch(previewResource!.url);
                    if (!res.ok) throw new Error("File not found");
                    const arrayBuffer = await res.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: "array" });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const html = XLSX.utils.sheet_to_html(firstSheet);
                    if (!cancelled) setExcelHtml(html);
                } else {
                    const res = await fetch(previewResource!.url);
                    if (!res.ok) throw new Error("File not found");
                    const text = await res.text();
                    if (!cancelled) setPreviewText(text);
                }
            } catch (err) {
                console.error("Error loading preview:", err);
                if (!cancelled) setPreviewError("Couldn't load this file's content.");
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [previewResource]);

    function cycleViewMode() {
        const currentPos = VIEW_CYCLE.indexOf(viewMode);
        setViewMode(VIEW_CYCLE[(currentPos + 1) % VIEW_CYCLE.length]);
    }

    function toggleFileTypeFilter(type: FileType) {
        setFileTypeFilters((prev) => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            } else {
                next.add(type);
            }
            return next;
        });
    }

    function toggleSelected(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function selectAll() {
        setSelectedIds(new Set(sortedResources.filter((r) => r.resourceKind !== "typed_note").map((r) => r.id)));
    }

    function handleRetryOcr(resource: Resource) {
        if (retryingOcrIds.has(resource.id)) return;

        setRetryingOcrIds((previous) => new Set(previous).add(resource.id));
        const markProcessing = (current: Resource) =>
            current.id === resource.id
                ? { ...current, ocrStatus: "processing" as const, ocrError: undefined }
                : current;
        setResources((previous) => previous.map(markProcessing));
        setPreviewResource((previous) => (previous ? markProcessing(previous) : previous));

        fetch("/api/embed-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, courseId, resourceId: resource.id }),
            keepalive: true,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(`OCR retry failed (${response.status})`);
                await loadResources();
            })
            .catch((error) => {
                console.error(`OCR retry failed for "${resource.name}":`, error);
                const markFailed = (current: Resource) =>
                    current.id === resource.id
                        ? { ...current, ocrStatus: "failed" as const, ocrError: "Couldn't start OCR. Please try again." }
                        : current;
                setResources((previous) => previous.map(markFailed));
                setPreviewResource((previous) => (previous ? markFailed(previous) : previous));
            })
            .finally(() => {
                setRetryingOcrIds((previous) => {
                    const next = new Set(previous);
                    next.delete(resource.id);
                    return next;
                });
            });
    }

    async function handleDownloadSelected() {
        const toDownload = resources.filter((r) => selectedIds.has(r.id));
        for (const r of toDownload) {
            try {
                const res = await fetch(r.url);
                if (!res.ok) throw new Error("Download failed");
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = r.name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(blobUrl);
            } catch (err) {
                console.error(`Failed to download ${r.name}:`, err);
            }
        }
    }

    async function handleDeleteSelected() {
        const toDelete = resources.filter((r) => selectedIds.has(r.id));
        await Promise.all(
            toDelete.map((r) => {
                const key = decodeURIComponent(r.url.split("key=")[1] ?? "");
                return deleteUserResource(userId, courseId, r.id, key);
            })
        );
        await loadResources();
        setSelectedIds(new Set());
        setConfirmDeleteOpen(false);
    }

    async function handleAddPages(files: File[]) {
        if (!previewResource || files.length === 0) return;
        if (previewResource.manualTranscript && !window.confirm(
            "Adding pages will regenerate this document from its images and replace your manual transcript edits. Continue?"
        )) return;
        setAddingPages(true);
        try {
            await addOcrDocumentPages({ userId, classDocId: courseId, resourceId: previewResource.id, files });
            await loadResources();
        } catch (error) {
            console.error("Adding OCR pages failed:", error);
            setPreviewError(error instanceof Error ? error.message : "Couldn't add image pages.");
        } finally {
            setAddingPages(false);
        }
    }

    async function renameOcrDocument() {
        if (!previewResource?.resourceKind) return;
        const name = window.prompt("Resource name", previewResource.name)?.trim();
        if (!name || name === previewResource.name) return;
        const response = await fetch("/api/ocr-documents", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, courseId, resourceId: previewResource.id, action: "rename", name }),
        });
        if (!response.ok) throw new Error("Couldn't rename OCR document.");
        await loadResources();
    }

    async function renameOcrPage(page: OcrPage) {
        if (!previewResource) return;
        const name = window.prompt(`Name for source image ${page.order + 1}`, page.name)?.trim();
        if (!name || name === page.name) return;
        const response = await fetch("/api/ocr-documents", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId,
                courseId,
                resourceId: previewResource.id,
                action: "renamePage",
                pageId: page.id,
                name,
            }),
        });
        if (!response.ok) throw new Error("Couldn't rename source image.");
        const queued = await fetch("/api/embed-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, courseId, resourceId: previewResource.id }),
            keepalive: true,
        });
        if (!queued.ok) throw new Error("Source image renamed, but the transcript could not be refreshed.");
        await loadResources();
    }

    async function saveTranscriptEdit() {
        if (!previewResource?.resourceKind) return;
        setSavingTranscript(true);
        try {
            const response = await fetch("/api/ocr-documents", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    courseId,
                    resourceId: previewResource.id,
                    action: "editTranscript",
                    transcript: editedTranscript,
                }),
            });
            if (!response.ok) throw new Error("Couldn't save transcript changes.");
            setEditingTranscript(false);
            await fetch("/api/embed-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, courseId, resourceId: previewResource.id }),
                keepalive: true,
            });
            await loadResources();
        } catch (error) {
            setPreviewError(error instanceof Error ? error.message : "Couldn't save transcript changes.");
        } finally {
            setSavingTranscript(false);
        }
    }

    function openOrSelect(resource: Resource) {
        if (!selectMode) setPreviewResource(resource);
        else if (resource.resourceKind !== "typed_note") toggleSelected(resource.id);
    }

    function thumbnailFor(resource: Resource): ThumbnailData | undefined {
        if (resource.resourceKind === "typed_note") return { kind: "text", content: (resource.snippet || "Empty note").slice(0, 240) };
        return thumbnails[resource.id];
    }

    const activeResource = sortedResources[activeIndex];
    const isFilterActive = fileTypeFilters.size < VALID_FILE_TYPES.length || sortBy !== "name";
    const ITEM_SPACING = 190;
    const tileMinWidth = Math.round(150 * tileZoom);
    const tileImgHeight = Math.round(160 * tileZoom);
    const tileSnippetFontSize = Math.max(4, Math.round(6 * tileZoom));
    const closeupSnippetFontSize = 10;

    if (isLoadingResources) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin" />
                Loading resources...
            </div>
        );
    }

    if (loadError) {
        return <p className="py-8 text-center text-sm text-alert-error">{loadError}</p>;
    }

    const showFinishReading = Boolean(taskId && previewResource && previewResource.id === initialResourceId && !readingSaved);

    return (
        <div>
            {initialResourceUnavailable && (
                <p className="mb-4 rounded-lg border border-border-light bg-bg-warm px-3 py-2 text-sm text-text-main" role="status">
                    This document isn&apos;t available. You can browse the other resources in this course.
                </p>
            )}
            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search
                            size={14}
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search files..."
                            className="w-40 rounded-md border border-border-light bg-bg-container py-1.5 pl-8 pr-3 text-sm text-text-main outline-none focus:border-primary sm:w-48"
                        />
                    </div>

                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
                        className="rounded-md border border-border-light bg-bg-container py-1.5 px-2 text-sm text-text-main outline-none focus:border-primary"
                    >
                        <option value="all">All tags</option>
                        <option value="classDoc">Class Docs</option>
                        <option value="notes">Notes</option>
                        <option value="assignments">Assignments</option>
                    </select>

                    <div className="relative" ref={filterPopupRef}>
                        <CircleIconButton
                            icon={<Filter size={15} />}
                            ariaLabel="Filter and sort"
                            size="sm"
                            variant={isFilterActive ? "accent" : "default"}
                            onClick={() => setShowFilterPopup((s) => !s)}
                        />
                        {showFilterPopup && (
                            <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-lg bg-bg-container p-3 shadow-lg ring-1 ring-border-light">
                                <p className="mb-2 text-xs font-semibold text-text-muted">File type</p>
                                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                                    {presentFileTypes.map((type) => (
                                        <label key={type} className="flex items-center gap-2 text-sm text-text-main">
                                            <input
                                                type="checkbox"
                                                checked={fileTypeFilters.has(type)}
                                                onChange={() => toggleFileTypeFilter(type)}
                                                className="accent-primary"
                                            />
                                            {TYPE_META[type].label}
                                        </label>
                                    ))}
                                </div>

                                <div className="mt-3 border-t border-border-light pt-3">
                                    <p className="mb-2 text-xs font-semibold text-text-muted">Sort by</p>
                                    <select
                                        value={sortBy}
                                        onChange={(e) =>
                                            setSortBy(e.target.value as "name" | "uploadedAt" | "lastViewedAt")
                                        }
                                        className="w-full rounded-md border border-border-light bg-bg-container py-1.5 px-2 text-sm text-text-main outline-none focus:border-primary"
                                    >
                                        <option value="name">Name (A–Z)</option>
                                        <option value="uploadedAt">Upload date (newest)</option>
                                        <option value="lastViewedAt">Last viewed (most recent)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <CircleIconButton
                        icon={VIEW_META[viewMode].icon}
                        ariaLabel={`Switch view (currently ${VIEW_META[viewMode].label})`}
                        size="sm"
                        onClick={cycleViewMode}
                    />
                    <CircleIconButton
                        icon={<Plus size={15} />}
                        ariaLabel="Add files or notes"
                        size="sm"
                        variant="accent"
                        onClick={() => setShowNotesFlow(true)}
                    />
                    <CircleIconButton
                        icon={<CheckSquare size={15} />}
                        ariaLabel="Select files"
                        size="sm"
                        variant={selectMode ? "accent" : "default"}
                        onClick={() => {
                            setSelectMode((s) => !s);
                            setSelectedIds(new Set());
                        }}
                        disabled={allResources.length === 0}
                    />
                </div>
            </div>

            {selectMode && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-bg-warm px-3 py-2">
                    <span className="text-xs font-medium text-text-main">{selectedIds.size} selected</span>
                    <button
                        onClick={selectAll}
                        className="rounded-md border border-border-light bg-bg-container px-3 py-1 text-xs font-medium text-text-main hover:border-border-hover"
                    >
                        Select all
                    </button>
                    <button
                        onClick={handleDownloadSelected}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-1 rounded-md border border-border-light bg-bg-container px-3 py-1 text-xs font-medium text-text-main hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Download size={12} /> Download selected
                    </button>
                    <button
                        onClick={() => setConfirmDeleteOpen(true)}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-1 rounded-md border border-border-light bg-bg-container px-3 py-1 text-xs font-medium text-alert-error hover:bg-alert-error-bg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Trash2 size={12} /> Delete selected
                    </button>
                </div>
            )}

            {viewMode === "tile" && sortedResources.length > 0 && (
                <div className="mb-3 flex items-center justify-end gap-2">
                    <button
                        onClick={() => setTileZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
                        aria-label="Zoom out thumbnails"
                        className="text-text-muted hover:text-text-main"
                    >
                        <Minus size={14} />
                    </button>
                    <input
                        type="range"
                        min={0.7}
                        max={1.8}
                        step={0.05}
                        value={tileZoom}
                        onChange={(e) => setTileZoom(parseFloat(e.target.value))}
                        aria-label="Thumbnail zoom"
                        className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-border-light accent-primary"
                    />
                    <button
                        onClick={() => setTileZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
                        aria-label="Zoom in thumbnails"
                        className="text-text-muted hover:text-text-main"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            )}

            {sortedResources.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">
                    {allResources.length === 0
                        ? "No resources yet. Use the + button to add files or take notes."
                        : "No files match your search or filters."}
                </p>
            ) : viewMode === "tile" ? ( // Tile View
                <>
                    <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileMinWidth}px, 1fr))` }}
                    >
                        {visibleResources.map((resource) => (
                            <div key={resource.id} className="group relative">
                                <button
                                    onClick={() => openOrSelect(resource)}
                                    className="w-full overflow-hidden rounded-lg text-left ring-1 ring-border-light transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    <div className="w-full" style={{ height: `${tileImgHeight}px` }}>
                                        <FileThumbnail
                                            fileType={resource.fileType}
                                            preview={thumbnailFor(resource)}
                                            fontSizePx={tileSnippetFontSize}
                                        />
                                    </div>
                                    <div className="px-3 py-2">
                                        <p className="truncate text-xs font-medium text-text-main group-hover:text-primary">
                                            {resource.name}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                            <span className="inline-block rounded-full bg-bg-warm px-2 py-0.5 text-[10px] font-medium text-primary">
                                                {CATEGORY_LABELS[resource.category]}
                                            </span>
                                            {resource.ocrStatus ? <OcrStatusBadge status={resource.ocrStatus} /> : resource.ocrScanned && <OcrScannedBadge />}
                                            {resource.resourceKind === "typed_note" && <TypedNoteBadge />}
                                            {resource.indexStatus && <IndexStatusBadge status={resource.indexStatus} />}
                                        </div>
                                        <p className="mt-1 text-[10px] text-text-muted">
                                            {resource.resourceKind === "typed_note"
                                                ? `Edited ${formatRelativeDate(resource.lastViewedAt)}`
                                                : <>Uploaded {formatRelativeDate(resource.uploadedAt)} &middot; Viewed{" "}{formatRelativeDate(resource.lastViewedAt)}</>}
                                        </p>
                                    </div>
                                </button>
                                {selectMode && (
                                    <div
                                        className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm ${
                                            selectedIds.has(resource.id)
                                                ? "border-primary bg-primary"
                                                : "border-border-hover bg-bg-container"
                                        }`}
                                    >
                                        {selectedIds.has(resource.id) && <CheckSquare size={12} className="text-text-inverse" />}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {visibleCount < sortedResources.length && (
                        <div className="mt-4 flex justify-center">
                            <button
                                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                                className="rounded-md border border-border-light bg-bg-container px-4 py-2 text-sm font-medium text-text-main hover:border-border-hover"
                            >
                                Show more ({sortedResources.length - visibleCount} remaining)
                            </button>
                        </div>
                    )}
                </>
            ) : viewMode === "row" ? ( // List View
                <>
                    <div className="divide-y divide-border-light rounded-lg ring-1 ring-border-light">
                        {visibleResources.map((resource) => (
                            <div
                                key={resource.id}
                                className="group flex items-center gap-4 px-3 py-2.5 transition-colors hover:bg-bg-main"
                            >
                                <button
                                    onClick={() => openOrSelect(resource)}
                                    className="flex flex-1 items-center gap-4 text-left focus:outline-none"
                                >
                                    {selectMode && (
                                        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                                            {selectedIds.has(resource.id) ? (
                                                <CheckSquare size={16} className="text-primary" />
                                            ) : (
                                                <Square size={16} className="text-border-hover" />
                                            )}
                                        </div>
                                    )}
                                    <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-border-light">
                                        <FileThumbnail fileType={resource.fileType} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-text-main group-hover:text-primary">
                                            {resource.name}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                            {resource.resourceKind === "typed_note" ? (
                                                <p className="text-xs text-text-muted">Edited {formatRelativeDate(resource.lastViewedAt)}</p>
                                            ) : (
                                                <>
                                                    <p className="text-xs text-text-muted">
                                                        Uploaded {formatRelativeDate(resource.uploadedAt)}
                                                    </p>
                                                    <p className="text-xs text-text-muted">
                                                        Last viewed {formatRelativeDate(resource.lastViewedAt)}
                                                    </p>
                                                </>
                                            )}
                                            <span className="rounded-full bg-bg-warm px-2 py-0.5 text-[10px] font-medium text-primary">
                                                {CATEGORY_LABELS[resource.category]}
                                            </span>
                                            {resource.ocrStatus ? <OcrStatusBadge status={resource.ocrStatus} /> : resource.ocrScanned && <OcrScannedBadge />}
                                            {resource.resourceKind === "typed_note" && <TypedNoteBadge />}
                                            {resource.indexStatus && <IndexStatusBadge status={resource.indexStatus} />}
                                        </div>
                                    </div>
                                </button>
                            </div>
                        ))}
                    </div>
                    {visibleCount < sortedResources.length && (
                        <div className="mt-4 flex justify-center">
                            <button
                                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                                className="rounded-md border border-border-light bg-bg-container px-4 py-2 text-sm font-medium text-text-main hover:border-border-hover"
                            >
                                Show more ({sortedResources.length - visibleCount} remaining)
                            </button>
                        </div>
                    )}
                </>
            ) : ( // Carousel View
                // parent
                <div className="relative w-full"> 
                    
                    {/* LEFT ARROW */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20">
                        <CircleIconButton
                            icon={<ChevronLeft size={16} />}
                            ariaLabel="Previous file"
                            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                            disabled={activeIndex === 0}
                        />
                    </div>

                    {/* RIGHT ARROW */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20">
                        <CircleIconButton
                            icon={<ChevronRight size={16} />}
                            ariaLabel="Next file"
                            onClick={() => setActiveIndex((i) => Math.min(sortedResources.length - 1, i + 1))}
                            disabled={activeIndex === sortedResources.length - 1}
                        />
                    </div>

                    {/* Central Display Viewport */}
                    <div className="relative h-72 min-w-0 w-full overflow-visible sm:h-96">
                        {sortedResources.map((resource, index) => {
                            const offset = index - activeIndex;
                            const distance = Math.abs(offset);
                            if (distance > 2) return null;

                            const scale = distance === 0 ? 1 : distance === 1 ? 0.7 : 0.5;
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.5 : 0.25;

                            return (
                                <button
                                    key={resource.id}
                                    onClick={() => {
                                        if (distance !== 0) {
                                            setActiveIndex(index);
                                        } else {
                                            openOrSelect(resource);
                                        }
                                    }}
                                    style={{
                                        position: "absolute",
                                        left: "50%",
                                        top: "50%",
                                        transform: `translate(-50%, -50%) translateX(${offset * ITEM_SPACING}px) scale(${scale})`,
                                        zIndex: 10 - distance, 
                                        opacity,
                                    }}
                                    // Carousel view document preview height
                                    className={`h-72 w-56 sm:h-96 sm:w-80 overflow-hidden rounded-lg ring-1 ring-border-light transition-all duration-300 ${
                                        distance === 0 ? "shadow-lg" : "shadow-sm"
                                    }`}
                                >
                                    <FileThumbnail
                                        fileType={resource.fileType}
                                        preview={thumbnailFor(resource)}
                                        fontSizePx={closeupSnippetFontSize}
                                    />
                                    {selectMode && distance === 0 && (
                                        <div className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm ${
                                            selectedIds.has(resource.id) ? "border-primary bg-primary" : "border-border-hover bg-bg-container"
                                        }`}>
                                            {selectedIds.has(resource.id) ? (
                                                <CheckSquare size={12} className="text-text-inverse" />
                                            ) : (
                                                <Square size={12} className="text-text-muted" />
                                            )}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        </div>

                    <div className="mt-3 flex items-center justify-center gap-2">
                        <p className="truncate text-sm font-medium text-text-main">{activeResource?.name}</p>
                        {activeResource && (
                            <span className="rounded-full bg-bg-warm px-2 py-0.5 text-[10px] font-medium text-primary">
                                {CATEGORY_LABELS[activeResource.category]}
                            </span>
                        )}
                        {activeResource?.ocrStatus ? <OcrStatusBadge status={activeResource.ocrStatus} /> : activeResource?.ocrScanned && <OcrScannedBadge />}
                        {activeResource?.resourceKind === "typed_note" && <TypedNoteBadge />}
                        {activeResource?.indexStatus && <IndexStatusBadge status={activeResource.indexStatus} />}
                    </div>
                    {activeResource && (
                        <p className="mt-1 text-center text-xs text-text-muted">
                            {activeResource.resourceKind === "typed_note"
                                ? `Edited ${formatRelativeDate(activeResource.lastViewedAt)}`
                                : <>Uploaded {formatRelativeDate(activeResource.uploadedAt)} &middot; Last viewed{" "}{formatRelativeDate(activeResource.lastViewedAt)}</>}
                        </p>
                    )}
                    <p className="mt-1 text-center text-xs text-text-muted">
                        {activeIndex + 1} of {sortedResources.length}
                    </p>
                </div>
            )}

            {/* Preview modal */}
            {previewResource && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-10" onClick={() => setPreviewResource(null)}>
                    <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-bg-container shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
                            <p className="truncate text-sm font-semibold text-text-main">
                                {previewResource.name}{previewResource.resourceKind === "ocr_document" && typeof previewResource.pageCount === "number" ? ` · ${previewResource.pageCount} page${previewResource.pageCount === 1 ? "" : "s"}` : ""}
                            </p>
                            <div className="flex items-center gap-2">
                                {previewResource.resourceKind === "ocr_document" && (
                                    <>
                                        <input
                                            ref={pageUploadRef}
                                            type="file"
                                            accept={IMAGE_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
                                            multiple
                                            className="hidden"
                                            onChange={(event) => {
                                                const files = event.target.files ? Array.from(event.target.files) : [];
                                                event.currentTarget.value = "";
                                                void handleAddPages(files);
                                            }}
                                        />
                                        <button
                                            onClick={() => pageUploadRef.current?.click()}
                                            disabled={addingPages}
                                            className="rounded-md border border-border-light px-2 py-1 text-xs font-medium text-primary hover:bg-bg-main disabled:opacity-50"
                                        >
                                            {addingPages ? "Adding…" : "Add pages"}
                                        </button>
                                        <button
                                            onClick={() => setShowOcrPages((visible) => !visible)}
                                            className="rounded-md border border-border-light px-2 py-1 text-xs font-medium text-primary hover:bg-bg-main"
                                        >
                                            {showOcrPages ? "Hide pages" : "Source images"}
                                        </button>
                                        <button
                                            onClick={() => void renameOcrDocument().catch((error) => setPreviewError(error.message))}
                                            className="rounded-md border border-border-light p-1 text-text-muted hover:bg-bg-main"
                                            aria-label="Rename OCR document"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        {previewText !== null && !editingTranscript && (
                                            <button
                                                onClick={() => { setEditedTranscript(previewText); setEditingTranscript(true); }}
                                                className="rounded-md border border-border-light px-2 py-1 text-xs font-medium text-primary hover:bg-bg-main"
                                            >
                                                Edit text
                                            </button>
                                        )}
                                    </>
                                )}
                                {previewResource.resourceKind === "typed_note" ? (
                                    <Link
                                        href={`/notes/${previewResource.noteId}?from=${courseId}`}
                                        className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-text-inverse hover:opacity-90"
                                    >
                                        <NotebookPen size={13} /> Open in Notes
                                    </Link>
                                ) : notesState === "in" ? (
                                    <Link
                                        href={`/notes/${documentNoteId(courseId, previewResource.id)}?from=${courseId}`}
                                        className="flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs font-medium text-primary hover:bg-bg-main"
                                    >
                                        <NotebookPen size={13} /> Open in Notes
                                    </Link>
                                ) : notesState !== "unknown" && (
                                    <button
                                        onClick={async () => {
                                            setNotesState("adding");
                                            try {
                                                await addResourceToNotes(userId, courseId, {
                                                    id: previewResource.id,
                                                    name: previewResource.name,
                                                    fileType: previewResource.fileType,
                                                    url: previewResource.url,
                                                    resourceKind: previewResource.resourceKind === "ocr_document" ? "ocr_document" : undefined,
                                                });
                                                setNotesState("in");
                                            } catch (error) {
                                                console.error("Add to Notes failed:", error);
                                                setNotesState("out");
                                            }
                                        }}
                                        disabled={notesState === "adding"}
                                        className="flex items-center gap-1 rounded-md border border-border-light px-2 py-1 text-xs font-medium text-text-main hover:bg-bg-main disabled:opacity-50"
                                        title="Add this file to the Notes tab to annotate it and use it in notebooks"
                                    >
                                        <NotebookPen size={13} /> {notesState === "adding" ? "Adding..." : "Add to Notes"}
                                    </button>
                                )}
                                {showFinishReading && (
                                    <button
                                        type="button"
                                        onClick={() => void handleFinishReading()}
                                        disabled={finishingReading}
                                        aria-busy={finishingReading}
                                        className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-text-inverse hover:opacity-90 disabled:opacity-50"
                                    >
                                        {finishingReading && <Loader2 size={13} className="animate-spin" />}
                                        Finish reading
                                    </button>
                                )}
                                <CircleIconButton icon={<X size={16} />} ariaLabel="Close preview" size="sm" onClick={() => setPreviewResource(null)} />
                            </div>
                        </div>
                        {finishReadingError && (
                            <div className="flex flex-wrap items-center gap-2 border-b border-border-light bg-bg-warm px-4 py-2" role="status">
                                <p className="text-xs text-text-main">{finishReadingError}</p>
                                {readingSaved && (
                                    <button
                                        type="button"
                                        onClick={() => void handleFinishReading()}
                                        disabled={finishingReading}
                                        className="rounded-md border border-border-light bg-bg-container px-2 py-1 text-xs font-medium text-text-main hover:bg-bg-main disabled:opacity-50"
                                    >
                                        Try again
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="relative flex-1 overflow-auto bg-bg-container">
                            {previewResource.resourceKind === "ocr_document" && (previewResource.ocrStatus === "queued" || previewResource.ocrStatus === "processing") && (
                                <div className="flex items-center gap-2 border-b border-border-light bg-bg-warm px-4 py-3 text-sm text-text-muted" role="status">
                                    <Loader2 size={16} className="animate-spin" />
                                    {previewResource.ocrStatus === "queued" ? "Transcription queued…" : "Transcribing your pages…"} This will update automatically when it is ready.
                                </div>
                            )}
                            {previewResource.resourceKind === "ocr_document" && previewResource.ocrStatus === "failed" && (
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-alert-error bg-alert-error-bg px-4 py-3 text-sm text-alert-error">
                                    <p>{previewResource.ocrError || "Transcription failed. You can try again."}</p>
                                    <button
                                        onClick={() => handleRetryOcr(previewResource)}
                                        disabled={retryingOcrIds.has(previewResource.id)}
                                        className="flex items-center gap-1.5 rounded-md border border-alert-error px-3 py-1.5 text-xs font-medium transition hover:bg-bg-container disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {retryingOcrIds.has(previewResource.id) ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                                        Retry OCR
                                    </button>
                                </div>
                            )}
                            {previewResource.ocrSourceUrl && (
                                <div className="flex items-center gap-2 border-b border-border-light bg-bg-main px-4 py-2">
                                    <div className="inline-flex rounded-md border border-border-light bg-bg-container p-0.5 text-xs font-medium" role="tablist" aria-label="Transcription or original file">
                                        <button
                                            role="tab"
                                            aria-selected={!viewOriginal}
                                            onClick={() => setViewOriginal(false)}
                                            className={`rounded px-3 py-1 ${!viewOriginal ? "bg-primary text-text-inverse" : "text-text-muted hover:text-text-main"}`}
                                        >
                                            Transcription
                                        </button>
                                        <button
                                            role="tab"
                                            aria-selected={viewOriginal}
                                            onClick={() => setViewOriginal(true)}
                                            className={`rounded px-3 py-1 ${viewOriginal ? "bg-primary text-text-inverse" : "text-text-muted hover:text-text-main"}`}
                                        >
                                            Original
                                        </button>
                                    </div>
                                    {previewResource.ocrSourceName && (
                                        <span className="min-w-0 truncate text-xs text-text-muted">{previewResource.ocrSourceName.replace(/^\d+_/, "")}</span>
                                    )}
                                </div>
                            )}
                            {previewResource.resourceKind === "ocr_document" && showOcrPages && !viewOriginal && (
                                <div className="border-b border-border-light bg-bg-main p-4">
                                    <p className="text-xs text-text-muted">Your original photos, in order. The labels become the page headings in the transcript.</p>
                                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        {ocrPages.map((page) => (
                                            <div key={page.id} className="overflow-hidden rounded-md border border-border-light bg-bg-container">
                                                <a href={page.url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-bg-main" title="Open full size">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={page.url} alt={page.name} loading="lazy" className="h-full w-full bg-white object-contain" />
                                                </a>
                                                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                                                    <span className="min-w-0 truncate text-xs text-text-main">{page.order + 1}. {page.name}</span>
                                                    <button
                                                        onClick={() => void renameOcrPage(page).catch((error) => setPreviewError(error.message))}
                                                        className="shrink-0 text-xs font-medium text-primary hover:underline"
                                                    >
                                                        Rename
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {previewResource.resourceKind === "typed_note" ? (
                                <div className="mx-auto max-w-2xl p-6">
                                    {previewResource.snippet ? (
                                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-main">{previewResource.snippet}</p>
                                    ) : (
                                        <p className="text-sm text-text-muted">This note is empty. Open it in Notes to start writing.</p>
                                    )}
                                </div>
                            ) : previewResource.ocrSourceUrl && viewOriginal ? (
                                previewResource.ocrSourceFileType === "pdf" ? (
                                    <iframe src={previewResource.ocrSourceUrl} title={previewResource.ocrSourceName ?? "Original file"} className="h-full w-full" />
                                ) : (
                                    <div className="flex h-full items-center justify-center bg-bg-main p-6">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={previewResource.ocrSourceUrl} alt={previewResource.ocrSourceName ?? "Original file"} className="max-h-full max-w-full rounded-lg object-contain shadow-sm" />
                                    </div>
                                )
                            ) :                             previewResource.fileType === "pdf" ? (
                                <iframe src={previewResource.url} title={previewResource.name} className="h-full w-full" />
                            ) : previewResource.fileType === "image" ? (
                                <div className="flex h-full flex-col gap-4 bg-bg-main p-6">
                                    <div className="flex min-h-0 flex-1 items-center justify-center">
                                        <img
                                            src={previewResource.url}
                                            alt={previewResource.name}
                                            className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
                                        />
                                    </div>
                                    {previewResource.ocrStatus === "queued" || previewResource.ocrStatus === "processing" ? (
                                        <div className="flex items-center justify-center gap-2 rounded-lg border border-border-light bg-bg-container p-4 text-sm text-text-muted">
                                            <Loader2 size={16} className="animate-spin" />
                                            {previewResource.ocrStatus === "queued" ? "Transcription queued…" : "Transcription processing…"} This preview will update automatically when it is ready.
                                        </div>
                                    ) : previewResource.ocrStatus === "failed" ? (
                                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-alert-error bg-alert-error-bg p-4 text-sm text-alert-error">
                                            <p>{previewResource.ocrError || "Transcription failed. You can try again."}</p>
                                            <button
                                                onClick={() => handleRetryOcr(previewResource)}
                                                disabled={retryingOcrIds.has(previewResource.id)}
                                                className="flex items-center gap-1.5 rounded-md border border-alert-error px-3 py-1.5 text-xs font-medium transition hover:bg-bg-container disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {retryingOcrIds.has(previewResource.id) ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                                                Retry OCR
                                            </button>
                                        </div>
                                    ) : previewResource.ocrStatus === "complete" ? (
                                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-light bg-bg-container p-4 text-sm text-text-muted">
                                            <span className="flex items-center gap-2"><ScanText size={16} /> Transcription ready.</span>
                                            {previewResource.ocrTranscriptUrl && (
                                                <a href={previewResource.ocrTranscriptUrl} download className="text-xs font-medium text-primary hover:underline">
                                                    Download transcription
                                                </a>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : DOWNLOAD_ONLY_TYPES.includes(previewResource.fileType) ? (
                                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                                    {previewResource.fileType === "pptx" ? (
                                        <Presentation size={40} className="text-[#C1440E]" />
                                    ) : previewResource.fileType === "one" ? (
                                        <BookOpen size={40} className="text-[#7C3F00]" />
                                    ) : (
                                        <FileArchive size={40} className="text-[#8A6D3B]" />
                                    )}
                                    <p className="text-sm text-text-main">
                                        {TYPE_META[previewResource.fileType].label} files can&apos;t be previewed here —
                                        download it to view contents.
                                    </p>
                                    <a
                                        href={previewResource.url}
                                        download
                                        className="mt-2 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover"
                                    >
                                        <Download size={15} />
                                        Download
                                    </a>
                                </div>
							) : previewResource.fileType === "xlsx" ? (
                                <>
                                    <style>{`
                                        /* Fixed-white "paper" sheet, like the docx/text previews — the
                                           source spreadsheet's own styling assumes a light page. */
                                        .xlsx-render { background: #ffffff; color: #1f1712; }
                                        .xlsx-render table { border-collapse: collapse; font-size: 0.8rem; }
                                        .xlsx-render td, .xlsx-render th { border: 1px solid #ddd; padding: 4px 10px; white-space: nowrap; }
                                        .xlsx-render tr:first-child td { background: #E8D2AF; font-weight: 600; }
                                    `}</style>
                                    {previewLoading ? (
                                        <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
                                            <Loader2 size={16} className="animate-spin" />
                                            Loading preview...
                                        </div>
                                    ) : previewError ? (
                                        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-alert-error">
                                            {previewError}
                                        </div>
                                    ) : excelHtml ? (
                                        <div
                                            className="xlsx-render overflow-auto p-4"
                                            dangerouslySetInnerHTML={{ __html: excelHtml }}
                                        />
                                    ) : null}
                                </>                            
                               ) : previewResource.fileType === "docx" ? (
							    <>
							        <style>{`
							            .docx-render p { margin: 0 0 8px 0; }
							            .docx-render table { border-collapse: collapse; }
							            .docx-render table td, .docx-render table th { border: 1px solid #ddd; padding: 4px 8px; }
							            .docx-render ul, .docx-render ol { list-style: revert; padding-left: 1.5rem; margin: revert; }
							            .docx-render h1, .docx-render h2, .docx-render h3 { font-weight: revert; font-size: revert; margin: revert; }
							        `}</style>
							        
							        {/* 📦 Master Bounding Container (Acts like an iframe window) */}
							        <div className="flex flex-col w-full h-[75vh] bg-bg-container rounded-xl overflow-hidden border border-border-light relative">
							            
							            {/* 🛠️ Floating Zoom Controller Bar Toolbar */}
							            <div className="flex items-center justify-end gap-3 bg-bg-container border-b border-border-light px-4 py-2 z-10 shadow-sm">
							                <span className="text-xs font-medium text-text-muted">{Math.round(zoom * 100)}%</span>
							                <button 
							                    onClick={handleZoomOut} 
							                    className="p-1 px-2 rounded bg-bg-container hover:bg-border-light text-xs font-bold text-text-main transition-colors"
							                >
							                    Zoom -
							                </button>
							                <button 
							                    onClick={handleZoomReset} 
							                    className="p-1 px-2 rounded bg-bg-container hover:bg-border-light text-xs font-medium text-text-main transition-colors"
							                >
							                    Reset
							                </button>
							                <button 
							                    onClick={handleZoomIn} 
							                    className="p-1 px-2 rounded bg-bg-container hover:bg-border-light text-xs font-bold text-text-main transition-colors"
							                >
							                    Zoom +
							                </button>
							            </div>
							
							            {/* 📦 Layer 1: Outer Viewport Window Container (Enables scrolling when zoomed in) */}
							            <div className="flex-1 overflow-auto p-6 flex justify-center items-start">
							                
							                {/* 🚀 Layer 2: Inner Scale Container Wrapper */}
							                <div 
							                    style={{ 
							                        transform: `scale(${zoom})`, 
							                        transformOrigin: 'top center', 
							                        transition: 'transform 0.15s ease-out' 
							                    }}
							                    className="w-full h-auto flex justify-center"
							                >
							                    {/* Your native hook point div containing its original formatting parameters */}
							                    <div ref={docxContainerRef} className="docx-render-container mx-auto max-w-[850px] bg-bg-container p-6 shadow-sm" />
							                </div>
							
							            </div>
							            
							            {/* Kept your loading state overlay cleanly bounded right inside the viewport window */}
							            {previewLoading && (
							                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-bg-container/80 text-sm text-text-muted z-20">
							                    <Loader2 size={16} className="animate-spin" />
							                    Loading preview...
							                </div>
							            )}
							        </div>
							        
							        {previewError && (
							            <div className="p-4 text-center text-xs text-alert-error">
							                {previewError}
							            </div>
                                    )}
                                </>
                            ) : previewLoading ? (
                                <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
                                    <Loader2 size={16} className="animate-spin" />
                                    Loading preview...
                                </div>
                            ) : previewError ? (
                                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-alert-error">
                                    {previewError}
                                </div>
                            ) : editingTranscript && previewResource.resourceKind === "ocr_document" ? (
                                <div className="flex h-full flex-col gap-3 p-4">
                                    <textarea
                                        value={editedTranscript}
                                        onChange={(event) => setEditedTranscript(event.target.value)}
                                        className="min-h-0 flex-1 resize-none rounded-md border border-border-light bg-bg-container p-3 font-mono text-sm text-text-main outline-none focus:border-primary"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingTranscript(false)} disabled={savingTranscript} className="rounded-md border border-border-light px-3 py-1.5 text-xs font-medium">Cancel</button>
                                        <button onClick={() => void saveTranscriptEdit()} disabled={savingTranscript} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse disabled:opacity-50">
                                            {savingTranscript ? "Saving…" : "Save and re-index"}
                                        </button>
                                    </div>
                                </div>
                            ) : previewText !== null ? (
                                <SyntaxHighlighter
                                    language={CODE_TYPES[previewResource.fileType as CodeType].prismLanguage}
                                    style={oneLight}
                                    showLineNumbers
                                    customStyle={{ margin: 0, minHeight: "100%", fontSize: "0.75rem", padding: "1rem" }}
                                >
                                    {previewText}
                                </SyntaxHighlighter>
                            ) : null}
                        </div>
                        {guidanceOpen && nextStep && previewResource.id === initialResourceId && (
                            <NextStepGuidance
                                courseId={courseId}
                                resourceId={previewResource.id}
                                resourceName={previewResource.name}
                                step={nextStep}
                                onLater={() => setGuidanceOpen(false)}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {confirmDeleteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteOpen(false)}>
                    <div className="w-full max-w-sm rounded-xl bg-bg-container p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-2 text-sm font-semibold text-text-main">
                            Delete {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""}?
                        </h3>
                        <p className="mb-6 text-sm text-text-muted">This can&apos;t be undone.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmDeleteOpen(false)}
                                className="flex-1 rounded-md border border-border-light py-2 text-sm font-medium text-text-main hover:bg-bg-main"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteSelected}
                                className="flex-1 rounded-md bg-alert-error py-2 text-sm font-medium text-text-inverse hover:bg-alert-error-hover"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showNotesFlow && (
                <AddNotesFlow
                    uid={userId}
                    courseId={courseId}
                    onClose={() => setShowNotesFlow(false)}
                    onUploaded={() => void loadResources()}
                />
            )}

        </div>
    );
}
