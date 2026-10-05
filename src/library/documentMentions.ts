// Catches a student naming a file they don't have before the model can
// "helpfully" swap in a different one. Confirmed live: asked to summarize
// "Heap Sort Lecture.pdf" (which doesn't exist), the model silently read and
// summarized Sorting Algorithms.pdf instead, presented as the requested
// file - it never called a tool that could have told it the file was
// missing. Checking the message against the real document list up front and
// telling the model the answer is deterministic; the model can't skip it.

export interface KnownDocument {
  name: string;
  classLabel: string;
}

const FILE_EXTENSIONS = "pdf|docx?|pptx?|xlsx?|csv|txt|md|py|java|js|ts|c|cpp|h|cs|go|rs|rb|php|sql|sh|html|css|json|ipynb|zip";
// Unquoted, only document-style extensions count: "Node.js" or "Vue.js" in a
// question is a technology, not a file (confirmed live - "What's the latest
// LTS version of Node.js?" was answered with "that file isn't in your classes").
const DOCUMENT_EXTENSIONS = "pdf|docx?|pptx?|xlsx?|csv|txt|ipynb|zip";
// "Quoted names" (any quotes) and bare filename-looking tokens with an extension.
const QUOTED = /["“”'‘’`]([^"“”'‘’`\n]{3,120})["“”'‘’`]/g;
const BARE_FILE = new RegExp(`(?:^|[\\s(])([\\w][\\w\\-.,:&()' ]{0,80}?\\.(?:${DOCUMENT_EXTENSIONS}))\\b`, "gi");

const norm = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, "").replace(/[^a-z0-9]+/g, " ").trim();

export function mentionedFileNames(message: string): string[] {
  const found = new Set<string>();
  for (const m of message.matchAll(QUOTED)) {
    // Only quoted text that looks like a file (has an extension) - a quoted
    // phrase like "big O" is a topic, not a document.
    if (new RegExp(`\\.(?:${FILE_EXTENSIONS})$`, "i").test(m[1].trim())) found.add(m[1].trim());
  }
  if (found.size === 0) for (const m of message.matchAll(BARE_FILE)) found.add(m[1].trim());
  return [...found];
}

function matches(mention: string, doc: string): boolean {
  const a = norm(mention);
  const b = norm(doc);
  return !!a && !!b && (a === b || b.includes(a) || a.includes(b));
}

function closest(mention: string, docs: KnownDocument[]): KnownDocument[] {
  // Shared word stems ("sort" ~ "sorting"), so near-misses still suggest the real file.
  const stems = norm(mention).split(" ").filter((w) => w.length > 2).map((w) => w.slice(0, 4));
  return docs
    .map((d) => ({ d, score: norm(d.name).split(" ").filter((w) => w.length > 2 && stems.includes(w.slice(0, 4))).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map((x) => x.d);
}

/** A note for the model when the student names files that aren't theirs, or null. */
export function missingDocumentNote(message: string, docs: KnownDocument[]): string | null {
  const missing = mentionedFileNames(message).filter((m) => !docs.some((d) => matches(m, d.name)));
  if (missing.length === 0) return null;
  const lines = missing.map((m) => {
    const near = closest(m, docs);
    return `- "${m}" does NOT exist in any of the student's classes.${near.length ? ` Closest real files: ${near.map((d) => `"${d.name}" (${d.classLabel})`).join(", ")}.` : ""}`;
  });
  return `Checked against the student's actual documents before this turn:\n${lines.join("\n")}\nStart your reply by telling the student plainly that the file isn't in their classes. Do not read, summarize, or describe a different file in its place unless they ask you to - you may offer the closest matches as options.`;
}

// Course codes the way students write them: "CSC 325", "csc325", "MATH 2410".
const COURSE_CODE = /\b([A-Za-z]{2,4})\s?(\d{3,4})\b/g;
const normalizeCode = (code: string) => code.replace(/\s+/g, "").toUpperCase();

/**
 * A class the student names that isn't one of theirs. Confirmed live: asked
 * for "a quiz from my CSC 999 lecture notes", the model called create_quiz
 * three times against other classes' files. Like missing files, this is
 * checked before the model runs.
 */
export function unknownCourseNote(message: string, classCodes: string[]): string | null {
  const known = new Set(classCodes.map(normalizeCode));
  if (known.size === 0) return null;
  // Only a class if it's in one of their departments ("CSC 999") or used like
  // one ("my PHYS 201 lecture") - "NETH 240" or "Room 240" are rooms.
  const departments = new Set(classCodes.map((c) => c.match(/^[A-Za-z]+/)?.[0].toUpperCase()).filter(Boolean));
  const unknown = [
    ...new Set(
      [...message.matchAll(COURSE_CODE)]
        .filter((m) => {
          const dept = m[1].toUpperCase();
          if (dept.length < 3) return false;
          const after = message.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
          return departments.has(dept) || /^\W*(\w+\W+){0,2}(class|course|lecture|notes|quiz|exam|syllabus|homework|files?)\b/i.test(after);
        })
        .map((m) => `${m[1].toUpperCase()} ${m[2]}`)
    ),
  ].filter((code) => !known.has(normalizeCode(code)));
  if (unknown.length === 0) return null;
  return (
    `The student mentioned ${unknown.join(", ")}, which ${unknown.length === 1 ? "isn't one of their classes" : "aren't among their classes"} ` +
    `(their classes: ${classCodes.join(", ")}), so Catalyst has no files for it. Don't make a quiz, flashcards, notes or a PDF for it from another class's files - ` +
    `say it isn't one of their classes in Catalyst and ask which class they meant. Calendar events and general questions about it are fine.`
  );
}
