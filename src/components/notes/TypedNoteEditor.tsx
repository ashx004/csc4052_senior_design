"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { ChevronLeft, ChevronRight, FilePlus2, Loader2 } from "lucide-react";
import { saveTypedNote } from "@/src/library/notes/notesStore";
import { noteToMarkdown, noteToPlainText } from "@/src/library/notes/noteText";
import type { ExportPage } from "@/src/library/notes/exportMarkup";
import { isImageFile, uploadNoteImage } from "@/src/library/notes/noteImages";
import { MAX_PAGES_PER_NOTE, PAGE_HEIGHT, PAGE_WIDTH, type Note } from "@/src/library/notes/types";
import AnnotationItems from "./AnnotationItems";
import ExportMenu from "./ExportMenu";
import { captureElement, sliceCapture } from "./markupCanvas";
import InkLayer from "./InkLayer";
import { useMarkShortcuts } from "./useMarkShortcuts";
import NotesToolbar, { EMPTY_FORMAT, type FormatAction, type ListKind, type TextFormatState } from "./NotesToolbar";
import PageDecorations from "./PageDecorations";
import { useAnnotationTools } from "./useAnnotationTools";
import { usePageInk } from "./usePageInk";
import { usePaperScale } from "./usePaperScale";
import { usePaperZoom, ZoomButtons } from "./PaperZoom";
import { defaultToolState, type ToolState } from "./tools";
import { NoteBulletList, TabIndent, TextHighlight, ToolbarItalic, indentLess, indentMore } from "./editor/basicExtensions";
import { MathBlock, MathInline } from "./editor/MathExtension";
import { NoteImage } from "./editor/ImageExtension";

const MARGIN_X = 80;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;
const SAVE_DELAY_MS = 900;
/** Tallest the text may grow before hitting the 50-page limit. */
const MAX_TEXT_BOTTOM = MAX_PAGES_PER_NOTE * PAGE_HEIGHT - MARGIN_BOTTOM;

type Chapter = { level: number; text: string; page: number; el: HTMLElement };

export default function TypedNoteEditor({
  uid,
  note,
  onSaveStateChange,
}: {
  uid: string;
  note: Note;
  onSaveStateChange: (state: "saved" | "saving" | "error") => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const paperZoom = usePaperZoom();
  const scale = usePaperScale(scrollRef, 32, paperZoom.zoom);
  const [tool, setTool] = useState<ToolState>(defaultToolState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageBusy, setImageBusy] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const insertImagesRef = useRef<(files: File[], at?: number) => void>(() => {});
  const [textBottom, setTextBottom] = useState(0);
  const [addedPages, setAddedPages] = useState(Math.max(1, note.pageCount ?? 1));
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [showContents, setShowContents] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const ink = usePageInk(uid, note.id);
  const tools = useAnnotationTools(ink, tool, setTool);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef(false);
  // TipTap keeps the onUpdate callback from the editor's first render, when
  // the editor itself was still null - so everything onUpdate needs goes
  // through refs that always point at the current values.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const flushSaveRef = useRef<() => Promise<void>>(async () => {});
  // Last document that fit within 50 pages; an edit that overflows is
  // replaced by exactly this (not undo(), which reverts a whole burst of
  // fast typing at once and could throw away far more than the overflow).
  const lastFitRef = useRef<ProseMirrorNode | null>(null);

  const inkPages = useMemo(
    () =>
      Object.entries(ink.pages).reduce(
        (max, [i, p]) => (p.strokes.length || p.texts.length || p.stickers.length ? Math.max(max, Number(i) + 1) : max),
        0
      ),
    [ink.pages]
  );
  const textPages = Math.ceil((textBottom + MARGIN_BOTTOM) / PAGE_HEIGHT);
  const pages = Math.min(MAX_PAGES_PER_NOTE, Math.max(1, textPages, addedPages, inkPages));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, italic: false, bulletList: false, link: { openOnClick: false, autolink: true } }),
      ToolbarItalic,
      NoteBulletList,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextHighlight,
      TabIndent,
      MathInline,
      MathBlock,
      NoteImage,
      Placeholder.configure({
        placeholder: "Start typing... # for a heading, - for a dash list, [ ] for a checklist, $x^2$ for math. Tab indents.",
      }),
    ],
    content: (note.content as object) ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: { class: "note-editor-content", "aria-label": "Note text", spellcheck: "true" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(isImageFile);
        if (!files.length) return false;
        event.preventDefault();
        insertImagesRef.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertImagesRef.current(files, at);
        return true;
      },
    },
    onCreate: ({ editor: ed }) => {
      lastFitRef.current = ed.state.doc;
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (!transaction.docChanged) return;
      // Enforce the 50-page limit: measure after the DOM updates, and if the
      // edit pushed text past the last page, put back the last document that
      // fit. Kept out of undo history so the student's own undo still works.
      requestAnimationFrame(() => {
        const bottom = measureTextBottom();
        if (bottom > MAX_TEXT_BOTTOM) {
          const fit = lastFitRef.current;
          if (fit && fit !== ed.state.doc) {
            const { state, view } = ed;
            const tr = state.tr.replaceWith(0, state.doc.content.size, fit.content).setMeta("addToHistory", false);
            const pos = Math.max(0, Math.min(state.selection.from, tr.doc.content.size));
            view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos), -1)));
          }
          setLimitMessage(`Notes can be up to ${MAX_PAGES_PER_NOTE} pages. Start a new note to keep going.`);
          return;
        }
        lastFitRef.current = ed.state.doc;
        queueSave();
      });
    },
  });

  const format = useEditorState({
    editor,
    selector: ({ editor: ed }): TextFormatState => ({
      bold: !!ed?.isActive("bold"),
      italic: !!ed?.isActive("italic"),
      underline: !!ed?.isActive("underline"),
      strike: !!ed?.isActive("strike"),
      code: !!ed?.isActive("code"),
      quote: !!ed?.isActive("blockquote"),
      highlight: !!ed?.isActive("highlight"),
      heading: ([1, 2, 3] as const).find((l) => ed?.isActive("heading", { level: l })) ?? 0,
      list: !ed
        ? null
        : ed.isActive("taskList")
          ? "task"
          : ed.isActive("orderedList")
            ? "ordered"
            : ed.isActive("bulletList")
              ? ed.getAttributes("bulletList").marker === "dot"
                ? "dot"
                : "dash"
              : null,
      canUndo: !!ed?.can().undo(),
      canRedo: !!ed?.can().redo(),
    }),
  }) ?? EMPTY_FORMAT;

  // Content loaded at creation produces no transaction, so the state hooks
  // below would keep their empty first reading until the first keystroke.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr);
  }, [editor]);

  const wordCount =
    useEditorState({
      editor,
      selector: ({ editor: ed }) => (ed ? ed.getText().trim().split(/\s+/).filter(Boolean).length : 0),
    }) ?? 0;

  function measureTextBottom(): number {
    const content = sheetRef.current?.querySelector<HTMLElement>(".ProseMirror");
    const sheet = sheetRef.current;
    if (!content || !sheet) return 0;
    const last = content.lastElementChild as HTMLElement | null;
    const sheetTop = sheet.getBoundingClientRect().top;
    const bottom = last ? last.getBoundingClientRect().bottom : content.getBoundingClientRect().top;
    return (bottom - sheetTop) / scaleRef.current;
  }

  const refreshLayout = useCallback(() => {
    setTextBottom(measureTextBottom());
    const sheet = sheetRef.current;
    if (!sheet) return;
    const sheetTop = sheet.getBoundingClientRect().top;
    const list = Array.from(sheet.querySelectorAll<HTMLElement>(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3"))
      .map((el) => ({
        level: Number(el.tagName[1]),
        text: el.textContent?.trim() ?? "",
        page: Math.floor((el.getBoundingClientRect().top - sheetTop) / scale / PAGE_HEIGHT) + 1,
        el,
      }))
      .filter((c) => c.text);
    setChapters(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  useEffect(() => {
    const content = sheetRef.current?.querySelector<HTMLElement>(".ProseMirror");
    if (!content) return;
    refreshLayout();
    const observer = new ResizeObserver(refreshLayout);
    observer.observe(content);
    return () => observer.disconnect();
  }, [editor, refreshLayout]);

  const flushSave = useCallback(async () => {
    if (!editor || !pendingSave.current) return;
    pendingSave.current = false;
    // JSON round-trip drops undefined attrs, which Firestore rejects.
    const content = JSON.parse(JSON.stringify(editor.getJSON()));
    try {
      await saveTypedNote(uid, note.id, { content, plainText: noteToPlainText(content).slice(0, 100_000) });
      onSaveStateChange("saved");
    } catch (e) {
      console.error("Failed to save note:", e);
      pendingSave.current = true;
      onSaveStateChange("error");
    }
  }, [editor, uid, note.id, onSaveStateChange]);
  flushSaveRef.current = flushSave;

  function queueSave() {
    pendingSave.current = true;
    onSaveStateChange("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSaveRef.current(), SAVE_DELAY_MS);
  }

  // Save anything pending when leaving the page or the note.
  useEffect(() => {
    const onHide = () => {
      if (pendingSave.current) void flushSave();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      onHide();
    };
  }, [flushSave]);

  useEffect(() => {
    onSaveStateChange(ink.saving ? "saving" : "saved");
  }, [ink.saving, onSaveStateChange]);

  // Marks undo/redo with the keyboard while a mark tool is active; in typing
  // mode the editor handles it for text.
  useMarkShortcuts(ink.undo, ink.redo, tool.mode !== "type");

  function addPage() {
    if (pages >= MAX_PAGES_PER_NOTE) return;
    const next = pages + 1;
    setAddedPages(next);
    saveTypedNote(uid, note.id, { pageCount: next }).catch((e) => console.error("Failed to add page:", e));
    // The page scrolls inside the layout's <main>, so scroll the new page
    // itself into view rather than any particular container.
    requestAnimationFrame(() =>
      sheetRef.current?.querySelector(`[data-page="${next - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  function toggleList(kind: ListKind) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (kind === "ordered") chain.toggleOrderedList().run();
    else if (kind === "task") chain.toggleList("taskList", "taskItem").run();
    else {
      const marker = kind === "dot" ? "dot" : "dash";
      if (editor.isActive("bulletList") && editor.getAttributes("bulletList").marker !== marker) {
        chain.updateAttributes("bulletList", { marker }).run();
      } else if (editor.isActive("bulletList")) {
        chain.toggleBulletList().run();
      } else {
        chain.toggleList("bulletList", "listItem", false, { marker }).run();
      }
    }
  }

  function onFormat(action: FormatAction) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (typeof action === "number") chain.toggleHeading({ level: action }).run();
    else if (typeof action === "object" && "list" in action) toggleList(action.list);
    else if (typeof action === "object") {
      if (action.highlight) chain.setMark("highlight", { color: action.highlight }).run();
      else chain.unsetMark("highlight").run();
    } else {
      switch (action) {
        case "bold":
          chain.toggleBold().run();
          break;
        case "italic":
          chain.toggleItalic().run();
          break;
        case "underline":
          chain.toggleUnderline().run();
          break;
        case "strike":
          chain.toggleStrike().run();
          break;
        case "code":
          chain.toggleCode().run();
          break;
        case "quote":
          chain.toggleBlockquote().run();
          break;
        case "divider":
          chain.setHorizontalRule().run();
          break;
        case "math":
          chain.insertContent({ type: "mathInline", attrs: { latex: "" } }).run();
          break;
        case "image":
          fileInputRef.current?.click();
          break;
        case "indent":
          indentMore(editor);
          break;
        case "outdent":
          indentLess(editor);
          break;
      }
    }
  }

  async function insertImages(files: File[], at?: number) {
    if (!editor) return;
    setImageBusy((n) => n + files.length);
    if (typeof at === "number") editor.commands.setTextSelection(Math.min(at, editor.state.doc.content.size));
    for (const file of files) {
      try {
        const up = await uploadNoteImage(uid, note.id, file);
        const alt = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
        editor.chain().focus().insertContent({ type: "noteImage", attrs: { src: up.src, alt } }).run();
      } catch (e) {
        setLimitMessage(e instanceof Error ? e.message : "Couldn't add that picture.");
      } finally {
        setImageBusy((n) => n - 1);
      }
    }
  }
  insertImagesRef.current = (files, at) => void insertImages(files, at);

  // The page scrolls inside the layout, so the current page is whichever
  // one sits under the upper part of the window.
  useEffect(() => {
    const update = () => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const top = sheet.getBoundingClientRect().top;
      const probe = window.innerHeight * 0.35;
      setCurrentPage(Math.max(0, Math.floor((probe - top) / (PAGE_HEIGHT * scaleRef.current))));
    };
    update();
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, []);

  function goToPage(index: number) {
    const target = Math.max(0, Math.min(pages - 1, index));
    setCurrentPage(target);
    sheetRef.current?.querySelector(`[data-page="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function skipLine() {
    // A pair of hard breaks creates an intentional empty writing line while
    // keeping the cursor in the current paragraph. It is much faster than
    // repeatedly pressing Enter and remains part of the saved document.
    editor?.chain().focus().insertContent([{ type: "hardBreak" }, { type: "hardBreak" }]).run();
  }

  function placeCursorOnPaper(event: React.MouseEvent<HTMLDivElement>) {
    if (!editor || tool.mode !== "type") return;
    // Let TipTap handle ordinary clicks inside existing text. A click on the
    // rest of the paper creates enough empty lines to reach that position,
    // so students can start writing anywhere below their last line.
    if ((event.target as HTMLElement).closest(".ProseMirror")) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const top = sheet.getBoundingClientRect().top;
    const clickedY = (event.clientY - top) / scaleRef.current;
    const currentBottom = measureTextBottom();
    if (clickedY <= currentBottom + 8) {
      editor.chain().focus("end").run();
      return;
    }
    const lineHeight = 28;
    const breaks = Math.min(
      Math.max(1, Math.ceil((Math.min(clickedY, MAX_TEXT_BOTTOM) - currentBottom) / lineHeight)),
      500
    );
    editor.chain().focus("end").insertContent(Array.from({ length: breaks }, () => ({ type: "hardBreak" }))).run();
  }

  const sheetHeight = pages * PAGE_HEIGHT;

  async function exportPages(): Promise<ExportPage[]> {
    const el = textLayerRef.current;
    let shot: HTMLCanvasElement | null = null;
    const base = async (i: number) => {
      if (!el) return null;
      shot ??= await captureElement(el);
      return sliceCapture(shot, i, PAGE_WIDTH, PAGE_HEIGHT);
    };
    return Array.from({ length: pages }, (_, i) => ({
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      annotations: tools.page(i),
      base: () => base(i),
    }));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-[53px] z-10 flex flex-wrap items-center justify-center gap-2 px-3 py-2">
        <NotesToolbar
          variant="typed"
          tool={tool}
          onToolChange={setTool}
          format={format}
          onFormat={onFormat}
          canUndo={ink.canUndo}
          canRedo={ink.canRedo}
          onUndo={ink.undo}
          onRedo={ink.redo}
          showContents={showContents}
          onToggleContents={() => setShowContents((s) => !s)}
          onSkipLine={skipLine}
          onTextUndo={() => editor?.chain().focus().undo().run()}
          onTextRedo={() => editor?.chain().focus().redo().run()}
        />
        <ExportMenu
          uid={uid}
          note={note}
          getPages={exportPages}
          typed={{
            markdown: () => (editor ? noteToMarkdown(editor.getJSON()) : ""),
            plain: () => (editor ? noteToPlainText(editor.getJSON()) : ""),
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Choose pictures to add"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) insertImagesRef.current(files);
          }}
        />
      </div>

      {limitMessage && (
        <div role="alert" className="mx-auto mb-2 flex max-w-xl items-center gap-3 rounded-lg bg-alert-error-bg px-3 py-2 text-sm text-alert-error">
          <span className="flex-1">{limitMessage}</span>
          <button type="button" className="font-medium underline" onClick={() => setLimitMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto px-4 pb-24 pt-2">
          <div className="mx-auto" style={{ width: PAGE_WIDTH * scale, height: sheetHeight * scale }}>
            <div
              ref={sheetRef}
              className="note-sheet relative origin-top-left rounded-sm bg-bg-container shadow-[0_2px_18px_rgba(0,0,0,0.08)] ring-1 ring-border-light"
              style={{ width: PAGE_WIDTH, height: sheetHeight, transform: `scale(${scale})` }}
              onClick={placeCursorOnPaper}
            >
              <div
                ref={textLayerRef}
                className="relative z-10"
                style={{
                  padding: `${MARGIN_TOP}px ${MARGIN_X}px 0`,
                  // The drawing canvas remains behind the text. While a
                  // drawing tool is active it receives the pointer instead.
                  pointerEvents: tool.mode === "type" ? "auto" : "none",
                }}
              >
                <EditorContent editor={editor} />
              </div>
              <PageDecorations pages={pages} />
              {Array.from({ length: pages }, (_, i) => (
                // pointer-events-none: the page wrapper must never block clicks into
                // the text; the canvas inside opts back in only for drawing tools.
                <div key={i} data-page={i} className="pointer-events-none absolute left-0 right-0 z-0 scroll-mt-28" style={{ top: i * PAGE_HEIGHT, height: PAGE_HEIGHT }}>
                  <InkLayer
                    width={PAGE_WIDTH}
                    height={PAGE_HEIGHT}
                    strokes={tools.page(i).strokes}
                    tool={tool}
                    onStrokesChange={(strokes) => tools.setStrokes(i, strokes)}
                    onEraseAt={(x, y, r) => tools.eraseAt(i, x, y, r)}
                    onPointerDownOther={(x, y) => tools.placeAt(i, x, y)}
                  />
                </div>
              ))}
              {Array.from({ length: pages }, (_, i) => (
                <div key={`items-${i}`} className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: i * PAGE_HEIGHT, height: PAGE_HEIGHT }}>
                  <AnnotationItems
                    height={PAGE_HEIGHT}
                    annotations={tools.page(i)}
                    tool={tool}
                    editingId={tools.editingId}
                    onEditingChange={tools.setEditingId}
                    onChange={(next) => tools.setPage(i, next)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-4 flex items-center justify-center gap-3 text-xs text-text-muted">
            <button
              type="button"
              onClick={addPage}
              disabled={pages >= MAX_PAGES_PER_NOTE}
              className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-container px-3 py-1.5 text-sm font-medium text-text-main hover:bg-bg-warm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FilePlus2 size={15} /> Add page
            </button>
            <span className="tabular-nums">
              {pages} of {MAX_PAGES_PER_NOTE} pages · {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
          </div>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-10 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border-light bg-bg-container px-1.5 py-1 text-xs text-text-main shadow-md" role="group" aria-label="Page navigation">
            <button type="button" aria-label="Previous page" disabled={currentPage <= 0} onClick={() => goToPage(currentPage - 1)} className="rounded-full p-1.5 hover:bg-bg-warm disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <label className="flex items-center gap-1 tabular-nums">
              <span className="sr-only">Go to page</span>
              <select
                value={Math.min(currentPage, pages - 1)}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="cursor-pointer rounded-md bg-transparent px-1 py-0.5 font-medium outline-none hover:bg-bg-warm"
              >
                {Array.from({ length: pages }, (_, i) => (
                  <option key={i} value={i}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
              <span className="text-text-muted">of {pages}</span>
            </label>
            <button type="button" aria-label="Next page" disabled={currentPage >= pages - 1} onClick={() => goToPage(currentPage + 1)} className="rounded-full p-1.5 hover:bg-bg-warm disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
            <span className="mx-0.5 h-4 w-px bg-border-light" aria-hidden />
            <ZoomButtons zoom={paperZoom} />
            {imageBusy > 0 && (
              <span className="ml-1 flex items-center gap-1 pr-2 text-text-muted">
                <Loader2 size={13} className="animate-spin" /> Adding picture...
              </span>
            )}
          </div>
        </div>

        {showContents && (
          <aside
            className="absolute inset-y-0 right-0 z-10 w-64 max-w-[80vw] overflow-y-auto border-l border-border-light bg-bg-container p-3 shadow-lg lg:static lg:shadow-none"
            aria-label="Contents"
          >
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Contents</h2>
            {chapters.length === 0 ? (
              <p className="text-sm leading-relaxed text-text-muted">
                Add headings with H1, H2 or H3 and they&apos;ll show up here so you can jump between sections.
              </p>
            ) : (
              <ol className="space-y-0.5">
                {chapters.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => c.el.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-main hover:bg-bg-warm"
                      style={{ paddingLeft: 8 + (c.level - 1) * 12 }}
                    >
                      <span className={`min-w-0 flex-1 truncate ${c.level === 1 ? "font-semibold" : ""}`}>{c.text}</span>
                      <span className="shrink-0 text-xs tabular-nums text-text-muted">p. {c.page}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
