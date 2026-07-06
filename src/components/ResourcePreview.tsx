"use client";

import { useEffect, useRef, useState } from "react";
import {
    X,
    ChevronLeft,
    ChevronRight,
    List,
    LayoutGrid,
    GalleryHorizontal,
    Upload,
    CheckSquare,
    Square,
    Download,
    Trash2,
    Search,
    Filter,
    FileText,
    FileCode,
    FileArchive,
    Loader2,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
// @ts-ignore — docx-preview does not ship official TypeScript types
import { renderAsync } from "docx-preview";
import CircleIconButton from "./CircleIconButton";
import { uploadUserResource, getCourseResources, deleteUserResource } from "./fileUploadService";

export type Category = "classDoc" | "notes" | "assignments";

// code/text file types — each maps to a Prism language for syntax highlighting
const CODE_TYPES = {
    txt: { label: "TXT", prismLanguage: "text", color: "#8A8477", bg: "#F0EFEA" },
    py: { label: "PY", prismLanguage: "python", color: "#4C9A6A", bg: "#EAF4EC" },
    js: { label: "JS", prismLanguage: "javascript", color: "#B08957", bg: "#FBF3E1" },
    jsx: { label: "JSX", prismLanguage: "jsx", color: "#B08957", bg: "#FBF3E1" },
    ts: { label: "TS", prismLanguage: "typescript", color: "#3178C6", bg: "#E7EFFB" },
    tsx: { label: "TSX", prismLanguage: "tsx", color: "#3178C6", bg: "#E7EFFB" },
    java: { label: "JAVA", prismLanguage: "java", color: "#B07219", bg: "#FBF1E1" },
    go: { label: "GO", prismLanguage: "go", color: "#00ACD7", bg: "#E3F7FC" },
    sql: { label: "SQL", prismLanguage: "sql", color: "#4A6FA5", bg: "#E8EEF9" },
    c: { label: "C", prismLanguage: "c", color: "#555555", bg: "#EFEFEF" },
    cpp: { label: "C++", prismLanguage: "cpp", color: "#004482", bg: "#E3ECF5" },
    cs: { label: "C#", prismLanguage: "csharp", color: "#68217A", bg: "#F1E7F4" },
    rs: { label: "RUST", prismLanguage: "rust", color: "#DE6E4B", bg: "#FBEAE3" },
    html: { label: "HTML", prismLanguage: "markup", color: "#C2685A", bg: "#FBEAE7" },
    css: { label: "CSS", prismLanguage: "css", color: "#2965F1", bg: "#E6ECFD" },
    php: { label: "PHP", prismLanguage: "php", color: "#787CB5", bg: "#EDEEF7" },
    rb: { label: "RUBY", prismLanguage: "ruby", color: "#CC342D", bg: "#FBE7E6" },
    kt: { label: "KOTLIN", prismLanguage: "kotlin", color: "#7F52FF", bg: "#EFEAFF" },
    swift: { label: "SWIFT", prismLanguage: "swift", color: "#F05138", bg: "#FDEBE7" },
    sh: { label: "SHELL", prismLanguage: "bash", color: "#4EAA25", bg: "#EAF6E4" },
    asm: { label: "ASM", prismLanguage: "nasm", color: "#6E6E6E", bg: "#EFEFEF" },
} as const;

type CodeType = keyof typeof CODE_TYPES;
export type FileType = CodeType | "pdf" | "docx" | "zip";

const NON_CODE_META: Record<"pdf" | "docx" | "zip", { label: string; color: string; bg: string }> = {
    pdf: { label: "PDF", color: "#C2685A", bg: "#FBEAE7" },
    docx: { label: "DOCX", color: "#4A6FA5", bg: "#E8EEF9" },
    zip: { label: "ZIP", color: "#8A6D3B", bg: "#F5EEDC" },
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
];

const ACCEPT_ATTR = VALID_FILE_TYPES.map((t) => `.${t}`).join(",");

export interface Resource {
    id: string;
    name: string;
    url: string;
    fileType: FileType;
    category: Category;
    uploadedAt: Date;
    lastViewedAt: Date;
}

const CATEGORY_LABELS: Record<Category, string> = {
    classDoc: "Class Doc",
    notes: "Notes",
    assignments: "Assignments",
};

function getFileType(fileName: string): FileType | null {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!ext) return null;
    if (ext in CODE_TYPES) return ext as CodeType;
    if (ext === "pdf" || ext === "docx" || ext === "zip") return ext;
    return null;
}

// Firestore Timestamp -> Date, tolerating missing/pending values
function toDateSafe(value: any): Date {
    if (value && typeof value.toDate === "function") return value.toDate();
    return new Date();
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

function FileThumbnail({ fileType }: { fileType: FileType }) {
    const meta = TYPE_META[fileType];
    const icon =
        fileType === "zip" ? (
            <FileArchive size={20} />
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

export default function ResourcePreview({ userId, courseId }: { userId: string; courseId: string }) {
    const [resources, setResources] = useState<Resource[]>([]);
    const [isLoadingResources, setIsLoadingResources] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>("tile");
    const [activeIndex, setActiveIndex] = useState(0);
    const [previewResource, setPreviewResource] = useState<Resource | null>(null);

    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [newCategory, setNewCategory] = useState<Category>("classDoc");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
    const [fileTypeFilters, setFileTypeFilters] = useState<Set<FileType>>(new Set(VALID_FILE_TYPES));
    const [sortBy, setSortBy] = useState<"name" | "uploadedAt" | "lastViewedAt">("name");
    const [showFilterPopup, setShowFilterPopup] = useState(false);
    const filterPopupRef = useRef<HTMLDivElement | null>(null);

    const [previewText, setPreviewText] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const docxContainerRef = useRef<HTMLDivElement | null>(null);

    async function loadResources() {
        setIsLoadingResources(true);
        setLoadError(null);
        try {
            const raw = await getCourseResources(userId, courseId);
            const mapped: Resource[] = raw
                .map((r: any) => {
                    const fileType = getFileType(r.name);
                    if (!fileType) return null;
                    return {
                        id: r.id,
                        name: r.name,
                        url: r.url,
                        fileType,
                        category: (r.category as Category) ?? "notes",
                        uploadedAt: toDateSafe(r.uploadedAt),
                        lastViewedAt: toDateSafe(r.lastViewedAt),
                    } as Resource;
                })
                .filter((r: Resource | null): r is Resource => r !== null);
            setResources(mapped);
        } catch (err) {
            console.error("Error loading resources:", err);
            setLoadError("Couldn't load resources for this course.");
        } finally {
            setIsLoadingResources(false);
        }
    }

    useEffect(() => {
        loadResources();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, courseId]);

    const presentFileTypes = Array.from(new Set(resources.map((r) => r.fileType)));

    const filteredResources = resources.filter((r) => {
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

    useEffect(() => {
        if (!previewResource && !showAddModal) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setPreviewResource(null);
                setShowAddModal(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [previewResource, showAddModal]);

    useEffect(() => {
        setActiveIndex(0);
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

    // load real preview content whenever a file is opened
    useEffect(() => {
        if (!previewResource) {
            setPreviewText(null);
            setPreviewError(null);
            return;
        }

        const type = previewResource.fileType;

        if (type === "pdf" || type === "zip") {
            setPreviewLoading(false);
            setPreviewError(null);
            return;
        }

        let cancelled = false;
        setPreviewLoading(true);
        setPreviewError(null);
        setPreviewText(null);

        async function load() {
            try {
                if (type === "docx") {
                    const res = await fetch(previewResource!.url);
                    if (!res.ok) throw new Error("File not found");
                    const arrayBuffer = await res.arrayBuffer();
                    if (cancelled || !docxContainerRef.current) return;
                    docxContainerRef.current.innerHTML = "";
                    await renderAsync(arrayBuffer, docxContainerRef.current);
                } else {
                    const res = await fetch(previewResource!.url);
                    if (!res.ok) throw new Error("File not found");
                    const text = await res.text();
                    if (!cancelled) setPreviewText(text);
                }
            } catch (err) {
                console.error("Error loading preview:", err);
                if (!cancelled) {
                    setPreviewError("Couldn't load this file's content.");
                }
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
        setSelectedIds(new Set(sortedResources.map((r) => r.id)));
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

    async function handleUpload() {
        if (!selectedFile) return;
        const fileType = getFileType(selectedFile.name);
        if (!fileType) {
            setUploadError("That file type isn't supported yet.");
            return;
        }

        setIsUploading(true);
        setUploadError(null);
        try {
            await uploadUserResource({
                userId,
                classDocId: courseId,
                file: selectedFile,
                category: newCategory,
            });
            await loadResources();
            setSelectedFile(null);
            setShowAddModal(false);
        } catch (err: any) {
            console.error("Upload failed:", err);
            setUploadError(err.message || "Upload failed. Please try again.");
        } finally {
            setIsUploading(false);
        }
    }

    const activeResource = sortedResources[activeIndex];
    const isFilterActive = fileTypeFilters.size < VALID_FILE_TYPES.length || sortBy !== "name";
    const ITEM_SPACING = 155;

    if (isLoadingResources) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#8A8477]">
                <Loader2 size={16} className="animate-spin" />
                Loading resources...
            </div>
        );
    }

    if (loadError) {
        return <p className="py-8 text-center text-sm text-[#C2685A]">{loadError}</p>;
    }

    return (
        <div>
            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search
                            size={14}
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8A8477]"
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search files..."
                            className="w-40 rounded-md border border-[#EDE6D8] py-1.5 pl-8 pr-3 text-sm text-[#3D3A34] outline-none focus:border-[#B08957] sm:w-48"
                        />
                    </div>

                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as Category | "all")}
                        className="rounded-md border border-[#EDE6D8] bg-white py-1.5 px-2 text-sm text-[#3D3A34] outline-none focus:border-[#B08957]"
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
                            <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-lg bg-white p-3 shadow-lg ring-1 ring-[#EDE6D8]">
                                <p className="mb-2 text-xs font-semibold text-[#8A8477]">File type</p>
                                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                                    {presentFileTypes.map((type) => (
                                        <label
                                            key={type}
                                            className="flex items-center gap-2 text-sm text-[#3D3A34]"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={fileTypeFilters.has(type)}
                                                onChange={() => toggleFileTypeFilter(type)}
                                                className="accent-[#B08957]"
                                            />
                                            {TYPE_META[type].label}
                                        </label>
                                    ))}
                                </div>

                                <div className="mt-3 border-t border-[#EDE6D8] pt-3">
                                    <p className="mb-2 text-xs font-semibold text-[#8A8477]">Sort by</p>
                                    <select
                                        value={sortBy}
                                        onChange={(e) =>
                                            setSortBy(e.target.value as "name" | "uploadedAt" | "lastViewedAt")
                                        }
                                        className="w-full rounded-md border border-[#EDE6D8] bg-white py-1.5 px-2 text-sm text-[#3D3A34] outline-none focus:border-[#B08957]"
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
                        icon={<Upload size={15} />}
                        ariaLabel="Upload document"
                        size="sm"
                        onClick={() => setShowAddModal(true)}
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
                        disabled={resources.length === 0}
                    />
                </div>
            </div>

            {selectMode && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-[#FAF3E8] px-3 py-2">
                    <span className="text-xs font-medium text-[#3D3A34]">{selectedIds.size} selected</span>
                    <button
                        onClick={selectAll}
                        className="rounded-md border border-[#EDE6D8] bg-white px-3 py-1 text-xs font-medium text-[#3D3A34] hover:border-[#D8CBB0]"
                    >
                        Select all
                    </button>
                    <button
                        onClick={handleDownloadSelected}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-1 rounded-md border border-[#EDE6D8] bg-white px-3 py-1 text-xs font-medium text-[#3D3A34] hover:border-[#D8CBB0] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Download size={12} /> Download selected
                    </button>
                    <button
                        onClick={() => setConfirmDeleteOpen(true)}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-1 rounded-md border border-[#EDE6D8] bg-white px-3 py-1 text-xs font-medium text-[#C2685A] hover:bg-[#FBEFED] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Trash2 size={12} /> Delete selected
                    </button>
                </div>
            )}

            {sortedResources.length === 0 ? (
                <p className="py-8 text-center text-sm text-[#8A8477]">
                    {resources.length === 0
                        ? "No resources yet. Use the upload button to add one."
                        : "No files match your search or filters."}
                </p>
            ) : viewMode === "tile" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {sortedResources.map((resource) => (
                        <div key={resource.id} className="group relative">
                            <button
                                onClick={() =>
                                    selectMode ? toggleSelected(resource.id) : setPreviewResource(resource)
                                }
                                className="w-full overflow-hidden rounded-lg text-left ring-1 ring-[#EDE6D8] transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B08957]"
                            >
                                <div className="h-44 w-full">
                                    <FileThumbnail fileType={resource.fileType} />
                                </div>
                                <div className="px-3 py-2">
                                    <p className="truncate text-xs font-medium text-[#3D3A34] group-hover:text-[#B08957]">
                                        {resource.name}
                                    </p>
                                    <div className="mt-1">
                                        <span className="inline-block rounded-full bg-[#FAF3E8] px-2 py-0.5 text-[10px] font-medium text-[#B08957]">
                                            {CATEGORY_LABELS[resource.category]}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[10px] text-[#8A8477]">
                                        Uploaded {formatRelativeDate(resource.uploadedAt)} &middot; Viewed{" "}
                                        {formatRelativeDate(resource.lastViewedAt)}
                                    </p>
                                </div>
                            </button>
                            {selectMode && (
                                <div
                                    className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                                        selectedIds.has(resource.id)
                                            ? "border-[#B08957] bg-[#B08957]"
                                            : "border-white bg-white/70"
                                    }`}
                                >
                                    {selectedIds.has(resource.id) && <CheckSquare size={12} className="text-white" />}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : viewMode === "row" ? (
                <div className="divide-y divide-[#EDE6D8] rounded-lg ring-1 ring-[#EDE6D8]">
                    {sortedResources.map((resource) => (
                        <div
                            key={resource.id}
                            className="group flex items-center gap-4 px-3 py-2.5 transition-colors hover:bg-[#FAF7F0]"
                        >
                            <button
                                onClick={() =>
                                    selectMode ? toggleSelected(resource.id) : setPreviewResource(resource)
                                }
                                className="flex flex-1 items-center gap-4 text-left focus:outline-none"
                            >
                                {selectMode && (
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                                        {selectedIds.has(resource.id) ? (
                                            <CheckSquare size={16} className="text-[#B08957]" />
                                        ) : (
                                            <Square size={16} className="text-[#C7BBA0]" />
                                        )}
                                    </div>
                                )}
                                <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-[#EDE6D8]">
                                    <FileThumbnail fileType={resource.fileType} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-[#3D3A34] group-hover:text-[#B08957]">
                                        {resource.name}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                        <p className="text-xs text-[#8A8477]">
                                            Uploaded {formatRelativeDate(resource.uploadedAt)}
                                        </p>
                                        <p className="text-xs text-[#8A8477]">
                                            Last viewed {formatRelativeDate(resource.lastViewedAt)}
                                        </p>
                                        <span className="rounded-full bg-[#FAF3E8] px-2 py-0.5 text-[10px] font-medium text-[#B08957]">
                                            {CATEGORY_LABELS[resource.category]}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div>
                    <div className="flex items-center gap-2">
                        <CircleIconButton
                            icon={<ChevronLeft size={16} />}
                            ariaLabel="Previous file"
                            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                            disabled={activeIndex === 0}
                        />

                        <div className="relative h-64 min-w-0 flex-1 overflow-visible sm:h-80">
                            {sortedResources.map((resource, index) => {
                                const offset = index - activeIndex;
                                const distance = Math.abs(offset);
                                if (distance > 2) return null;

                                const scale = distance === 0 ? 1 : distance === 1 ? 0.75 : 0.55;
                                const opacity = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.28;

                                return (
                                    <button
                                        key={resource.id}
                                        onClick={() => {
                                            if (distance !== 0) {
                                                setActiveIndex(index);
                                            } else if (selectMode) {
                                                toggleSelected(resource.id);
                                            } else {
                                                setPreviewResource(resource);
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
                                        className={`h-52 w-40 overflow-hidden rounded-lg ring-1 ring-[#EDE6D8] transition-all duration-300 sm:h-64 sm:w-48 ${
                                            distance === 0 ? "shadow-lg" : "shadow-sm"
                                        }`}
                                    >
                                        <FileThumbnail fileType={resource.fileType} />
                                        {selectMode && distance === 0 && (
                                            <div
                                                className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full ${
                                                    selectedIds.has(resource.id) ? "bg-[#B08957]" : "bg-white/80"
                                                }`}
                                            >
                                                {selectedIds.has(resource.id) ? (
                                                    <CheckSquare size={12} className="text-white" />
                                                ) : (
                                                    <Square size={12} className="text-[#8A8477]" />
                                                )}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <CircleIconButton
                            icon={<ChevronRight size={16} />}
                            ariaLabel="Next file"
                            onClick={() =>
                                setActiveIndex((i) => Math.min(sortedResources.length - 1, i + 1))
                            }
                            disabled={activeIndex === sortedResources.length - 1}
                        />
                    </div>

                    <div className="mt-3 flex items-center justify-center gap-2">
                        <p className="truncate text-sm font-medium text-[#3D3A34]">{activeResource?.name}</p>
                        {activeResource && (
                            <span className="rounded-full bg-[#FAF3E8] px-2 py-0.5 text-[10px] font-medium text-[#B08957]">
                                {CATEGORY_LABELS[activeResource.category]}
                            </span>
                        )}
                    </div>
                    {activeResource && (
                        <p className="mt-1 text-center text-xs text-[#8A8477]">
                            Uploaded {formatRelativeDate(activeResource.uploadedAt)} &middot; Last viewed{" "}
                            {formatRelativeDate(activeResource.lastViewedAt)}
                        </p>
                    )}
                    <p className="mt-1 text-center text-xs text-[#8A8477]">
                        {activeIndex + 1} of {sortedResources.length}
                    </p>
                </div>
            )}

            {/* Preview modal — real content per file type */}
            {previewResource && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-10" onClick={() => setPreviewResource(null)}>
                    <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-[#EDE6D8] px-4 py-3">
                            <p className="truncate text-sm font-semibold text-[#3D3A34]">{previewResource.name}</p>
                            <CircleIconButton icon={<X size={16} />} ariaLabel="Close preview" size="sm" onClick={() => setPreviewResource(null)} />
                        </div>

                        <div className="relative flex-1 overflow-auto bg-[#F5F3EE]">
                            {previewResource.fileType === "pdf" ? (
                                <iframe src={previewResource.url} title={previewResource.name} className="h-full w-full" />
                            ) : previewResource.fileType === "zip" ? (
                                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                                    <FileArchive size={40} className="text-[#8A6D3B]" />
                                    <p className="text-sm text-[#3D3A34]">
                                        Zip archives can&apos;t be previewed here — download it to view contents.
                                    </p>
                                    <a
                                        href={previewResource.url}
                                        download
                                        className="mt-2 flex items-center gap-2 rounded-md bg-[#B08957] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#9C7849]"
                                    >
                                        <Download size={15} />
                                        Download
                                    </a>
                                </div>
                            ) : previewResource.fileType === "docx" ? (
                                <>
                                    <div
                                        ref={docxContainerRef}
                                        className="docx-render-container mx-auto max-w-3xl bg-white p-6 shadow-sm"
                                    />
                                    {previewLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#F5F3EE]/80 text-sm text-[#8A8477]">
                                            <Loader2 size={16} className="animate-spin" />
                                            Loading preview...
                                        </div>
                                    )}
                                    {previewError && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[#F5F3EE] p-6 text-center text-sm text-[#C2685A]">
                                            {previewError}
                                        </div>
                                    )}
                                </>
                            ) : previewLoading ? (
                                <div className="flex h-full items-center justify-center gap-2 text-sm text-[#8A8477]">
                                    <Loader2 size={16} className="animate-spin" />
                                    Loading preview...
                                </div>
                            ) : previewError ? (
                                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[#C2685A]">
                                    {previewError}
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
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {confirmDeleteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteOpen(false)}>
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="mb-2 text-sm font-semibold text-[#3D3A34]">
                            Delete {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""}?
                        </h3>
                        <p className="mb-6 text-sm text-[#8A8477]">This can&apos;t be undone.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmDeleteOpen(false)}
                                className="flex-1 rounded-md border border-[#EDE6D8] py-2 text-sm font-medium text-[#3D3A34] hover:bg-[#FAF7F0]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteSelected}
                                className="flex-1 rounded-md bg-[#C2685A] py-2 text-sm font-medium text-white hover:bg-[#A9564A]"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload document modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !isUploading && setShowAddModal(false)}>
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-[#3D3A34]">Upload document</h3>
                            <CircleIconButton
                                icon={<X size={16} />}
                                ariaLabel="Close"
                                size="sm"
                                onClick={() => setShowAddModal(false)}
                                disabled={isUploading}
                            />
                        </div>

                        <label className="mb-2 block text-xs font-medium text-[#8A8477]">Select file</label>
                        <input
                            type="file"
                            accept={ACCEPT_ATTR}
                            onChange={(e) => {
                                setSelectedFile(e.target.files?.[0] ?? null);
                                setUploadError(null);
                            }}
                            disabled={isUploading}
                            className="mb-1 block w-full text-sm text-[#3D3A34] file:mr-3 file:rounded-md file:border-0 file:bg-[#FAF3E8] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#B08957] hover:file:bg-[#F5EAD8]"
                        />
                        {selectedFile && !getFileType(selectedFile.name) && (
                            <p className="mb-2 text-xs text-[#C2685A]">
                                That file type isn&apos;t supported yet.
                            </p>
                        )}

                        <label className="mb-2 mt-4 block text-xs font-medium text-[#8A8477]">Tag</label>
                        <div className="mb-6 flex gap-2">
                            {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setNewCategory(cat)}
                                    disabled={isUploading}
                                    className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                        newCategory === cat
                                            ? "border-[#B08957] bg-[#FAF3E8] text-[#B08957]"
                                            : "border-[#EDE6D8] text-[#8A8477] hover:border-[#D8CBB0]"
                                    }`}
                                >
                                    {CATEGORY_LABELS[cat]}
                                </button>
                            ))}
                        </div>

                        {uploadError && (
                            <p className="mb-4 text-xs text-[#C2685A]">{uploadError}</p>
                        )}

                        <button
                            onClick={handleUpload}
                            disabled={!selectedFile || !getFileType(selectedFile?.name ?? "") || isUploading}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#B08957] py-2 text-sm font-medium text-white transition-colors hover:bg-[#9C7849] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" /> Uploading...
                                </>
                            ) : (
                                "Upload"
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
