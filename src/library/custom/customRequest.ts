// One-off study material from the student's own prompt and files, with no class
// attached. Saved at users/{uid}/customSets/{setId}. This is the validation and
// source-building half, pure so it is unit-tested; the route does the I/O.

import { SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentTypes";
import { QUIZ_DIFFICULTIES, type QuizDifficulty } from "@/src/library/quizDifficulty";
import { MAX_SOURCES } from "@/src/library/sources/resolveSources";
import type { SourceInput } from "@/src/library/sources/sourceTypes";
import { PRACTICE_KINDS, type PracticeKind } from "@/src/library/practice/types";

export const CUSTOM_TYPES = ["quiz", "flashcards", "practice"] as const;
export type CustomType = (typeof CUSTOM_TYPES)[number];

/** The prompt can be long: pasted notes, a syllabus, a detailed brief. */
export const MAX_PROMPT_CHARS = 12_000;
/**
 * Every item has to quote the material it came from, so a prompt with no files
 * must itself be long enough to be that material. A one-line "quiz me on
 * photosynthesis" has nothing for the questions to be checked against.
 */
export const MIN_MATERIAL_CHARS = 400;
/** A prompt this long is treated as material in its own right, not just instructions. */
export const PROMPT_AS_SOURCE_CHARS = MIN_MATERIAL_CHARS;

export const MAX_CUSTOM_FILES = MAX_SOURCES;
export const MAX_CUSTOM_ITEMS = { quiz: 20, flashcards: 50, practice: 12 } as const;

export interface CustomFile {
  name: string;
  url: string;
  fileType: string;
}

export interface CustomRequest {
  type: CustomType;
  prompt: string;
  files: CustomFile[];
  count: number;
  difficulty: QuizDifficulty;
  questionTypes: { multipleChoice: boolean; trueFalse: boolean; matching: boolean };
  practiceKind: PracticeKind;
  modelKey?: string;
}

export type ParsedCustomRequest = { ok: true; request: CustomRequest } | { ok: false; error: string };

const DEFAULT_COUNT = { quiz: 10, flashcards: 20, practice: 8 } as const;

/** Files are only ever the student's own uploads, under their personal prefix. */
export function customFilePrefix(uid: string): string {
  return `users/${uid}/custom/`;
}

function keyOf(url: string): string | null {
  const match = /[?&]key=([^&]+)/.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function extensionOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : "";
}

export function parseCustomRequest(body: unknown, uid: string): ParsedCustomRequest {
  const record = (body ?? {}) as Record<string, unknown>;

  const type = record.type;
  if (!CUSTOM_TYPES.includes(type as CustomType)) return { ok: false, error: "Choose a quiz, flashcards or practice." };

  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, error: `Keep the prompt under ${MAX_PROMPT_CHARS.toLocaleString()} characters.` };
  }

  const rawFiles = Array.isArray(record.files) ? record.files : [];
  if (rawFiles.length > MAX_CUSTOM_FILES) {
    return { ok: false, error: `Add at most ${MAX_CUSTOM_FILES} files to one set.` };
  }
  const files: CustomFile[] = [];
  for (const raw of rawFiles) {
    const file = (raw ?? {}) as Record<string, unknown>;
    const name = typeof file.name === "string" ? file.name.trim().slice(0, 200) : "";
    const url = typeof file.url === "string" ? file.url : "";
    const key = keyOf(url);
    if (!name || !key) return { ok: false, error: "One of the files didn't upload properly. Please add it again." };
    // Only the student's own custom uploads; a path into anyone else's space (or
    // their class files) is refused rather than silently read.
    if (!key.startsWith(customFilePrefix(uid)) || key.includes("..")) {
      return { ok: false, error: "You can only use files you uploaded here." };
    }
    const fileType = (typeof file.fileType === "string" && file.fileType ? file.fileType : extensionOf(name)).toLowerCase();
    if (!SUPPORTED_DOCUMENT_TYPES.includes(fileType)) {
      return { ok: false, error: `"${name}" isn't a type that can be read yet (PDF, Word, Excel, plain text, code and images work).` };
    }
    files.push({ name, url, fileType });
  }

  if (files.length === 0 && prompt.length < MIN_MATERIAL_CHARS) {
    return {
      ok: false,
      error: `Add a file, or write at least ${MIN_MATERIAL_CHARS} characters of notes or detail - the questions are checked against what you give, so a short request has nothing to check them against.`,
    };
  }

  const max = MAX_CUSTOM_ITEMS[type as CustomType];
  const rawCount = record.count === undefined ? DEFAULT_COUNT[type as CustomType] : record.count;
  if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 1 || rawCount > max) {
    return { ok: false, error: `Choose between 1 and ${max}.` };
  }

  const difficulty = QUIZ_DIFFICULTIES.includes(record.difficulty as QuizDifficulty) ? (record.difficulty as QuizDifficulty) : "exam";

  const qt = (record.questionTypes ?? {}) as Record<string, unknown>;
  const questionTypes = {
    multipleChoice: qt.multipleChoice === true,
    trueFalse: qt.trueFalse === true,
    matching: qt.matching === true,
  };
  if (type === "quiz" && !questionTypes.multipleChoice && !questionTypes.trueFalse && !questionTypes.matching) {
    return { ok: false, error: "Choose at least one question type." };
  }

  const practiceKind = PRACTICE_KINDS.includes(record.practiceKind as PracticeKind) ? (record.practiceKind as PracticeKind) : "fill_blank";

  return {
    ok: true,
    request: {
      type: type as CustomType,
      prompt,
      files,
      count: rawCount,
      difficulty,
      questionTypes,
      practiceKind,
      modelKey: typeof record.modelKey === "string" ? record.modelKey : undefined,
    },
  };
}

/** The files, plus the prompt as material of its own when it is long enough to be. */
export function customSources(request: CustomRequest): SourceInput[] {
  const sources: SourceInput[] = request.files.map((file) => ({ title: file.name, url: file.url, fileType: file.fileType }));
  if (request.prompt.length >= PROMPT_AS_SOURCE_CHARS) sources.push({ title: "Your prompt", text: request.prompt });
  return sources;
}

/**
 * Puts the student's instructions in front of a source's text, the way
 * withFocus does for the chat: what to cover and how comes from the prompt,
 * facts come only from the material.
 */
export function withInstructions(text: string, prompt: string): string {
  const instructions = prompt.trim();
  if (!instructions) return text;
  return `The student's instructions for this set (what to cover and how): ${instructions.slice(0, 2000)}\nFollow them, but take every fact only from the material below.\n\n${text}`;
}
