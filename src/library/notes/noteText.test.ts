import { describe, expect, it } from "vitest";
import {
  matchesSearch,
  notebookClassLabel,
  noteHeadings,
  notebookInCourse,
  notePreview,
  notebookRoom,
  noteToMarkdown,
  noteToPlainText,
  sortNotes,
} from "./noteText";
import type { Note, Notebook } from "./types";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Trees" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "An " },
        { type: "text", text: "AVL", marks: [{ type: "bold" }] },
        { type: "text", text: " tree is " },
        { type: "text", text: "balanced", marks: [{ type: "italic" }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "rotate left" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "rotate right" }] }] },
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heaps" }] },
  ],
};

function note(partial: Partial<Note>): Note {
  return {
    id: "n", kind: "typed", title: "", courseId: null, notebookId: null,
    createdAt: new Date(0), updatedAt: new Date(0), ...partial,
  };
}
const book = (id: string, homeCourseId: string | null = null): Notebook => ({
  id, name: id, homeCourseId, createdAt: new Date(0), updatedAt: new Date(0),
});

describe("noteToMarkdown / noteToPlainText", () => {
  it("serializes headings, bold, italic and lists", () => {
    expect(noteToMarkdown(doc)).toBe("# Trees\n\nAn **AVL** tree is *balanced*\n\n- rotate left\n- rotate right\n\n## Heaps");
  });
  it("strips formatting for search", () => {
    expect(noteToPlainText(doc)).toBe("Trees\n\nAn AVL tree is balanced\n\nrotate left\nrotate right\n\nHeaps");
  });
  it("handles an empty or missing document", () => {
    expect(noteToMarkdown(null)).toBe("");
    expect(noteToMarkdown({ type: "doc" })).toBe("");
  });
});

describe("noteHeadings", () => {
  it("lists chapters in order with their level", () => {
    expect(noteHeadings(doc)).toEqual([{ level: 1, text: "Trees" }, { level: 2, text: "Heaps" }]);
  });
});

describe("matchesSearch", () => {
  it("matches title or contents, case-insensitively", () => {
    const n = note({ title: "Data Structures", plainText: "rotations keep AVL trees balanced" });
    expect(matchesSearch(n, "structures")).toBe(true);
    expect(matchesSearch(n, "AVL")).toBe(true);
    expect(matchesSearch(n, "heap")).toBe(false);
    expect(matchesSearch(n, "  ")).toBe(true);
  });
});

describe("notebookInCourse", () => {
  const notes = [
    note({ id: "a", courseId: "csc", notebookId: "single" }),
    note({ id: "b", courseId: "csc", notebookId: "mixed" }),
    note({ id: "c", courseId: "math", notebookId: "mixed" }),
  ];
  it("shows single-class notebooks in that class", () => {
    expect(notebookInCourse(book("single"), "csc", notes)).toBe(true);
    expect(notebookInCourse(book("single"), "math", notes)).toBe(false);
  });
  it("keeps multi-class notebooks out of course tabs", () => {
    expect(notebookInCourse(book("mixed"), "csc", notes)).toBe(false);
  });
  it("shows an empty notebook where it was created", () => {
    expect(notebookInCourse(book("empty", "math"), "math", notes)).toBe(true);
    expect(notebookInCourse(book("empty", null), "math", notes)).toBe(false);
  });
});

describe("notebookRoom", () => {
  const notes = [note({ id: "a", notebookId: "nb" }), note({ id: "b", notebookId: "nb" })];
  it("doesn't double-count notes already in the notebook", () => {
    expect(notebookRoom("nb", ["a", "c"], notes, 3)).toEqual({ fits: true, after: 3 });
  });
  it("refuses a move past the limit", () => {
    expect(notebookRoom("nb", ["c", "d"], notes, 3)).toEqual({ fits: false, after: 4 });
  });
});

describe("sortNotes", () => {
  const classes = [{ id: "m", className: "Calculus", classCode: "MATH 1" }, { id: "c", className: "Data", classCode: "CSC 1" }];
  const notebooks = [book("x"), book("a")];
  const notes = [
    note({ id: "1", title: "beta", courseId: "m", notebookId: "x", updatedAt: new Date(1) }),
    note({ id: "2", title: "Alpha", courseId: null, notebookId: null, updatedAt: new Date(3) }),
    note({ id: "3", title: "gamma", courseId: "c", notebookId: "a", updatedAt: new Date(2) }),
  ];
  const ids = (list: Note[]) => list.map((n) => n.id).join("");
  it("sorts by recent, title, class and notebook", () => {
    expect(ids(sortNotes(notes, "recent", classes, notebooks))).toBe("231");
    expect(ids(sortNotes(notes, "title", classes, notebooks))).toBe("213");
    expect(ids(sortNotes(notes, "class", classes, notebooks))).toBe("312");
    expect(ids(sortNotes(notes, "notebook", classes, notebooks))).toBe("312");
  });
});

describe("notePreview", () => {
  it("pulls the opening heading out and keeps one line per block", () => {
    expect(notePreview({ content: doc })).toEqual({ heading: "Trees", body: expect.stringMatching(/^An AVL tree is balanced\nrotate left\nrotate right/) });
  });

  it("skips empty leading paragraphs and has no heading when the note starts with text", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "Just text" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Later" }] },
      ],
    };
    expect(notePreview({ content })).toEqual({ heading: null, body: "Just text\nLater" });
  });

  it("falls back to the stored plain text", () => {
    expect(notePreview({ content: undefined, plainText: "saved text" })).toEqual({ heading: null, body: "saved text" });
  });
});

describe("notebookClassLabel", () => {
  const classes = [
    { id: "c1", className: "Artificial Intelligence", classCode: "CSC 450" },
    { id: "c2", className: "Algorithms", classCode: "CSC 325", passed: true },
  ];
  const book = (id: string, homeCourseId: string | null = null) => ({ id, name: "Exam 1 Material", homeCourseId }) as never;
  const note = (id: string, notebookId: string | null, courseId: string | null) => ({ id, notebookId, courseId }) as never;

  it("names the class its notes belong to", () => {
    expect(notebookClassLabel(book("b1"), [note("n1", "b1", "c1"), note("n2", "b1", "c1")], classes)).toBe("CSC 450");
  });

  it("marks a passed class", () => {
    expect(notebookClassLabel(book("b2"), [note("n1", "b2", "c2")], classes)).toBe("CSC 325 · Passed");
  });

  it("says so when a notebook mixes classes", () => {
    expect(notebookClassLabel(book("b3"), [note("n1", "b3", "c1"), note("n2", "b3", "c2")], classes)).toBe("Multiple classes");
  });

  it("falls back to the class an empty notebook was made in", () => {
    expect(notebookClassLabel(book("b4", "c1"), [], classes)).toBe("CSC 450");
  });

  it("is General with no class anywhere, and ignores other notebooks' notes", () => {
    expect(notebookClassLabel(book("b5"), [note("n1", "other", "c1")], classes)).toBe("General");
    expect(notebookClassLabel(book("b6"), [note("n1", "b6", null)], classes)).toBe("General");
  });

  it("is General when the class is gone from the student's list", () => {
    expect(notebookClassLabel(book("b7", "deleted-class"), [], classes)).toBe("General");
  });
});
