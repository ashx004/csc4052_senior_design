// Pure helpers for typed-note content (TipTap JSON) and for filtering the
// notes library. No Firebase or DOM here, so all of it is unit-tested.
import type { ClassOption, Note, Notebook } from "./types";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type?: string; text?: string; marks?: Mark[]; attrs?: Record<string, unknown>; content?: Node[] };

// `bare` renders what search and previews read: no markup characters at all.
function inlineMarkdown(nodes: Node[] = [], bare = false): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      if (n.type === "mathInline") {
        const latex = String(n.attrs?.latex ?? "").trim();
        return bare ? latex : `$${latex}$`;
      }
      let text = n.text ?? "";
      if (bare) return text;
      const marks = new Map((n.marks ?? []).map((m) => [m.type, m]));
      if (marks.has("code")) text = `\`${text}\``;
      if (marks.has("bold")) text = `**${text}**`;
      if (marks.has("italic")) text = `*${text}*`;
      if (marks.has("underline")) text = `<u>${text}</u>`;
      if (marks.has("highlight")) text = `==${text}==`;
      if (marks.has("strike")) text = `~~${text}~~`;
      const href = marks.get("link")?.attrs?.href;
      if (typeof href === "string" && href) text = `[${text}](${href})`;
      return text;
    })
    .join("");
}

function blockMarkdown(node: Node, listPrefix = "", bare = false): string {
  switch (node.type) {
    case "heading":
      return `${bare ? "" : `${"#".repeat(Number(node.attrs?.level) || 1)} `}${inlineMarkdown(node.content, bare)}`;
    case "paragraph":
      return `${listPrefix}${inlineMarkdown(node.content, bare)}`;
    case "bulletList": {
      const prefix = bare ? "" : node.attrs?.marker === "dot" ? "* " : "- ";
      return (node.content ?? []).map((item) => listItem(item, prefix, bare)).join("\n");
    }
    case "orderedList":
      return (node.content ?? []).map((item, i) => listItem(item, bare ? "" : `${i + 1}. `, bare)).join("\n");
    case "taskList":
      return (node.content ?? [])
        .map((item) => listItem(item, bare ? "" : item.attrs?.checked ? "- [x] " : "- [ ] ", bare))
        .join("\n");
    case "blockquote":
      return (node.content ?? []).map((c) => `${bare ? "" : "> "}${blockMarkdown(c, "", bare)}`).join("\n");
    case "codeBlock": {
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      return bare ? code : `\`\`\`\n${code}\n\`\`\``;
    }
    case "mathBlock": {
      const latex = String(node.attrs?.latex ?? "").trim();
      return bare ? latex : `$$\n${latex}\n$$`;
    }
    case "noteImage": {
      const alt = String(node.attrs?.alt ?? "");
      return bare ? alt : `![${alt}](${String(node.attrs?.src ?? "")})`;
    }
    case "horizontalRule":
      return bare ? "" : "---";
    default:
      return inlineMarkdown(node.content, bare);
  }
}

function listItem(item: Node, prefix: string, bare: boolean): string {
  const [first, ...rest] = item.content ?? [];
  const head = first ? blockMarkdown(first, prefix, bare) : prefix.trimEnd();
  const tail = rest.map((c) => blockMarkdown(c, "", bare).replace(/^/gm, "  "));
  return [head, ...tail].join("\n");
}

function render(doc: unknown, bare: boolean): string {
  const root = doc as Node | null;
  if (!root || !Array.isArray(root.content)) return "";
  const blocks = root.content.map((n) => blockMarkdown(n, "", bare));
  return (bare ? blocks.filter((b) => b.trim()) : blocks).join("\n\n").trim();
}

/** TipTap document JSON -> Markdown (what the AI generators read). */
export function noteToMarkdown(doc: unknown): string {
  return render(doc, false);
}

/** TipTap document JSON -> plain text (what search reads). */
export function noteToPlainText(doc: unknown): string {
  return render(doc, true);
}

/** Headings in document order - the chapter list. */
export function noteHeadings(doc: unknown): { level: number; text: string }[] {
  const root = doc as Node | null;
  return (root?.content ?? [])
    .filter((n) => n.type === "heading")
    .map((n) => ({ level: Number(n.attrs?.level) || 1, text: inlineMarkdown(n.content, true).trim() }))
    .filter((h) => h.text);
}

/** What a note card shows: the opening heading (if the note starts with
 *  one) on its own, then the text after it, one line per block. */
export function notePreview(note: Pick<Note, "content" | "plainText">): { heading: string | null; body: string } {
  const root = note.content as Node | null;
  const blocks = (root?.content ?? []).filter((n) => noteToPlainText({ content: [n] }));
  const lines = (text: string) => text.replace(/\n\s*\n+/g, "\n").trim();
  if (blocks[0]?.type === "heading") {
    return { heading: noteToPlainText({ content: [blocks[0]] }), body: lines(noteToPlainText({ content: blocks.slice(1) })) };
  }
  return { heading: null, body: lines(blocks.length ? noteToPlainText({ content: blocks }) : note.plainText ?? "") };
}

export function matchesSearch(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return note.title.toLowerCase().includes(q) || (note.plainText ?? "").toLowerCase().includes(q);
}

/** Classes a notebook's notes come from. */
export function notebookCourseIds(notebookId: string, notes: Note[]): Set<string | null> {
  return new Set(notes.filter((n) => n.notebookId === notebookId).map((n) => n.courseId));
}

/** A notebook belongs to a course's Notes tab when every note in it is from
 *  that course (or, while empty, when it was created there). Notebooks that
 *  mix classes only appear in the general Notes tab. */
export function notebookInCourse(notebook: Notebook, courseId: string, notes: Note[]): boolean {
  const courses = notebookCourseIds(notebook.id, notes);
  if (courses.size === 0) return notebook.homeCourseId === courseId;
  return courses.size === 1 && courses.has(courseId);
}

export type NoteSort = "recent" | "title" | "class" | "notebook";

export function sortNotes(
  notes: Note[],
  sort: NoteSort,
  classes: ClassOption[],
  notebooks: Notebook[]
): Note[] {
  const classLabel = (id: string | null) => {
    const c = classes.find((x) => x.id === id);
    return c ? `${c.classCode} ${c.className}`.trim().toLowerCase() : "￿"; // unassigned last
  };
  const notebookLabel = (id: string | null) =>
    notebooks.find((b) => b.id === id)?.name.toLowerCase() ?? "￿"; // unfiled last
  const byRecent = (a: Note, b: Note) => b.updatedAt.getTime() - a.updatedAt.getTime();
  const sorted = [...notes];
  switch (sort) {
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "class":
      return sorted.sort((a, b) => classLabel(a.courseId).localeCompare(classLabel(b.courseId)) || byRecent(a, b));
    case "notebook":
      return sorted.sort((a, b) => notebookLabel(a.notebookId).localeCompare(notebookLabel(b.notebookId)) || byRecent(a, b));
    default:
      return sorted.sort(byRecent);
  }
}

/** How many of `noteIds` can move into a notebook without passing the
 *  150-note limit (notes already in it don't count twice). */
export function notebookRoom(notebookId: string, noteIds: string[], notes: Note[], limit: number): { fits: boolean; after: number } {
  const current = new Set(notes.filter((n) => n.notebookId === notebookId).map((n) => n.id));
  noteIds.forEach((id) => current.add(id));
  return { fits: current.size <= limit, after: current.size };
}
