// Pure helpers for typed-note content (TipTap JSON) and for filtering the
// notes library. No Firebase or DOM here, so all of it is unit-tested.
import type { ClassOption, Note, Notebook } from "./types";

type Mark = { type: string };
type Node = { type?: string; text?: string; marks?: Mark[]; attrs?: Record<string, unknown>; content?: Node[] };

function inlineMarkdown(nodes: Node[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      let text = n.text ?? "";
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      if (marks.has("code")) text = `\`${text}\``;
      if (marks.has("bold")) text = `**${text}**`;
      if (marks.has("italic")) text = `*${text}*`;
      if (marks.has("strike")) text = `~~${text}~~`;
      return text;
    })
    .join("");
}

function blockMarkdown(node: Node, listPrefix = ""): string {
  switch (node.type) {
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level) || 1)} ${inlineMarkdown(node.content)}`;
    case "paragraph":
      return `${listPrefix}${inlineMarkdown(node.content)}`;
    case "bulletList":
      return (node.content ?? []).map((item) => listItem(item, "- ")).join("\n");
    case "orderedList":
      return (node.content ?? []).map((item, i) => listItem(item, `${i + 1}. `)).join("\n");
    case "blockquote":
      return (node.content ?? []).map((c) => `> ${blockMarkdown(c)}`).join("\n");
    case "codeBlock":
      return `\`\`\`\n${(node.content ?? []).map((c) => c.text ?? "").join("")}\n\`\`\``;
    case "horizontalRule":
      return "---";
    default:
      return inlineMarkdown(node.content);
  }
}

function listItem(item: Node, prefix: string): string {
  const [first, ...rest] = item.content ?? [];
  const head = first ? blockMarkdown(first, prefix) : prefix.trimEnd();
  const tail = rest.map((c) => blockMarkdown(c).replace(/^/gm, "  "));
  return [head, ...tail].join("\n");
}

/** TipTap document JSON -> Markdown (what the AI generators read). */
export function noteToMarkdown(doc: unknown): string {
  const root = doc as Node | null;
  if (!root || !Array.isArray(root.content)) return "";
  return root.content.map((n) => blockMarkdown(n)).join("\n\n").trim();
}

/** TipTap document JSON -> plain text (what search reads). */
export function noteToPlainText(doc: unknown): string {
  return noteToMarkdown(doc)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[ \t]*(-|\d+\.)[ \t]+/gm, "") // [ \t] not \s: \s would also eat the blank line before a list
    .trim();
}

/** Headings in document order - the chapter list. */
export function noteHeadings(doc: unknown): { level: number; text: string }[] {
  const root = doc as Node | null;
  return (root?.content ?? [])
    .filter((n) => n.type === "heading")
    .map((n) => ({ level: Number(n.attrs?.level) || 1, text: inlineMarkdown(n.content).replace(/[*_~`]/g, "").trim() }))
    .filter((h) => h.text);
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
