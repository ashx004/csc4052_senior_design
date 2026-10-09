"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Bold, CheckSquare, Code, Heading2, Highlighter, Italic, List, ListOrdered, Quote, Redo2, Sigma, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { saveTypedNote } from "@/src/library/notes/notesStore";
import { markdownToDoc } from "@/src/library/notes/markdownToDoc";
import { noteToMarkdown, noteToPlainText } from "@/src/library/notes/noteText";
import { PAGE_WIDTH, type Note } from "@/src/library/notes/types";
import { NoteBulletList, TextHighlight, ToolbarItalic } from "./editor/basicExtensions";
import { MathBlock, MathInline } from "./editor/MathExtension";
import { NoteImage } from "./editor/ImageExtension";

const SAVE_DELAY_MS = 800;
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };
const LOOKS_LIKE_MARKDOWN = /^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s|```|\$\$)|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/m;

function initialContent(note: Note): object {
  if (note.content) return note.content as object;
  // File notes written before rich text existed only have plain text.
  return note.plainText?.trim() ? markdownToDoc(note.plainText) : EMPTY_DOC;
}

/**
 * Written notes that sit with any file (PDF, photo, Word, sheet, code, slides,
 * audio, video, anything else): the same rich-text/markdown editor as a typed
 * note, saved on the file's own note so it is searchable and the file is never
 * modified. "Markdown" swaps the formatted view for the raw markdown source.
 */
export default function FileNotesEditor({
  uid,
  note,
  onSaveStateChange,
}: {
  uid: string;
  note: Note;
  onSaveStateChange: (state: "saved" | "saving" | "error") => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => Promise<void>) | null>(null);
  const saveStateRef = useRef(onSaveStateChange);
  saveStateRef.current = onSaveStateChange;

  function queue(content: object) {
    saveStateRef.current("saving");
    if (timer.current) clearTimeout(timer.current);
    const run = async () => {
      pending.current = null;
      timer.current = null;
      try {
        await saveTypedNote(uid, note.id, { content, plainText: noteToPlainText(content) });
        saveStateRef.current("saved");
      } catch {
        saveStateRef.current("error");
      }
    };
    pending.current = run;
    timer.current = setTimeout(() => void run(), SAVE_DELAY_MS);
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, italic: false, bulletList: false, link: { openOnClick: false, autolink: true } }),
      ToolbarItalic,
      NoteBulletList,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextHighlight,
      MathInline,
      MathBlock,
      NoteImage,
      Placeholder.configure({ placeholder: "Write notes about this file... # for a heading, - for a list, **bold**, $x^2$ for math." }),
    ],
    content: initialContent(note),
    editorProps: {
      attributes: { class: "note-editor-content", "aria-label": "Written notes about this file", spellcheck: "true" },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (event.clipboardData?.getData("text/html") || !LOOKS_LIKE_MARKDOWN.test(text)) return false;
        event.preventDefault();
        const doc = markdownToDoc(text);
        const node = view.state.schema.nodeFromJSON({ type: "doc", content: doc.content });
        view.dispatch(view.state.tr.replaceSelection(node.slice(0, node.content.size)).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (transaction.docChanged) queue(ed.getJSON());
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive("bold"),
      italic: !!ed?.isActive("italic"),
      underline: !!ed?.isActive("underline"),
      highlight: !!ed?.isActive("highlight"),
      code: !!ed?.isActive("code"),
      quote: !!ed?.isActive("blockquote"),
      heading: !!ed?.isActive("heading"),
      bullet: !!ed?.isActive("bulletList"),
      ordered: !!ed?.isActive("orderedList"),
      task: !!ed?.isActive("taskList"),
      canUndo: !!ed?.can().undo(),
      canRedo: !!ed?.can().redo(),
    }),
  });

  // Leaving the file mid-edit must not drop the last keystrokes.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    void pending.current?.();
  }, []);

  function openSource() {
    if (!editor) return;
    setSource(noteToMarkdown(editor.getJSON()));
  }

  function closeSource() {
    if (!editor || source === null) return;
    const doc = markdownToDoc(source);
    editor.commands.setContent(doc.content.length ? doc : EMPTY_DOC, { emitUpdate: false });
    queue(editor.getJSON());
    setSource(null);
  }

  function editSource(value: string) {
    setSource(value);
    const doc = markdownToDoc(value);
    queue(doc.content.length ? doc : EMPTY_DOC);
  }

  const tools: { label: string; icon: typeof Bold; on: boolean; run: () => void }[] = editor
    ? [
        { label: "Bold", icon: Bold, on: active?.bold ?? false, run: () => editor.chain().focus().toggleBold().run() },
        { label: "Italic", icon: Italic, on: active?.italic ?? false, run: () => editor.chain().focus().toggleItalic().run() },
        { label: "Underline", icon: UnderlineIcon, on: active?.underline ?? false, run: () => editor.chain().focus().toggleUnderline().run() },
        { label: "Highlight", icon: Highlighter, on: active?.highlight ?? false, run: () => (editor.isActive("highlight") ? editor.chain().focus().unsetMark("highlight").run() : editor.chain().focus().setMark("highlight", { color: "yellow" }).run()) },
        { label: "Heading", icon: Heading2, on: active?.heading ?? false, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
        { label: "Bulleted list", icon: List, on: active?.bullet ?? false, run: () => editor.chain().focus().toggleBulletList().run() },
        { label: "Numbered list", icon: ListOrdered, on: active?.ordered ?? false, run: () => editor.chain().focus().toggleOrderedList().run() },
        { label: "Checklist", icon: CheckSquare, on: active?.task ?? false, run: () => editor.chain().focus().toggleTaskList().run() },
        { label: "Quote", icon: Quote, on: active?.quote ?? false, run: () => editor.chain().focus().toggleBlockquote().run() },
        { label: "Code", icon: Code, on: active?.code ?? false, run: () => editor.chain().focus().toggleCode().run() },
        { label: "Math", icon: Sigma, on: false, run: () => editor.chain().focus().insertContent({ type: "mathInline", attrs: { latex: "" } }).run() },
      ]
    : [];

  return (
    <section className="mx-auto mb-6 mt-4 w-full" style={{ maxWidth: PAGE_WIDTH }} aria-label="Written notes">
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-border-light bg-bg-warm px-2 py-1.5">
        <span className="mr-2 text-xs font-semibold text-text-main">Your notes</span>
        {source === null && editor && (
          <>
            {[
              { label: "Undo (Ctrl+Z)", icon: Undo2, enabled: active?.canUndo ?? false, run: () => editor.chain().focus().undo().run() },
              { label: "Redo (Ctrl+Shift+Z)", icon: Redo2, enabled: active?.canRedo ?? false, run: () => editor.chain().focus().redo().run() },
            ].map(({ label, icon: Icon, enabled, run }) => (
              <button
                key={label}
                type="button"
                title={label}
                aria-label={label}
                disabled={!enabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={run}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-main hover:bg-bg-container disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Icon size={15} />
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border-light" aria-hidden />
          </>
        )}
        {source === null &&
          tools.map(({ label, icon: Icon, on, run }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={on}
              onMouseDown={(event) => event.preventDefault()}
              onClick={run}
              className={`flex h-7 w-7 items-center justify-center rounded-md ${on ? "bg-primary text-text-inverse" : "text-text-main hover:bg-bg-container"}`}
            >
              <Icon size={15} />
            </button>
          ))}
        <button
          type="button"
          aria-pressed={source !== null}
          onClick={() => (source === null ? openSource() : closeSource())}
          className={`ml-auto rounded-md px-2 py-1 text-xs font-medium ${source !== null ? "bg-primary text-text-inverse" : "border border-border-light bg-bg-container text-text-main hover:bg-bg-main"}`}
        >
          {source === null ? "Markdown" : "Formatted"}
        </button>
      </div>
      <div className="note-sheet rounded-b-lg border border-border-light bg-bg-container p-4 focus-within:border-primary">
        {source === null ? (
          <div className="min-h-24">
            <EditorContent editor={editor} />
          </div>
        ) : (
          <textarea
            value={source}
            onChange={(event) => editSource(event.target.value)}
            aria-label="Markdown source of your notes"
            spellCheck={false}
            className="min-h-40 w-full resize-y bg-transparent font-mono text-[13px] leading-6 text-text-main outline-none"
          />
        )}
      </div>
    </section>
  );
}
