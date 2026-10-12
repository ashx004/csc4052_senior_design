import { describe, expect, it } from "vitest";
import { MIN_MATERIAL_CHARS, customSources, parseCustomRequest, withInstructions } from "./customRequest";

const UID = "u1";
const file = (name = "notes.pdf", key = `users/${UID}/custom/1-notes.pdf`) => ({ name, url: `/api/download?key=${encodeURIComponent(key)}`, fileType: "pdf" });
const long = "x".repeat(MIN_MATERIAL_CHARS);

describe("parseCustomRequest", () => {
  it("accepts a file with no prompt, with sensible defaults", () => {
    const parsed = parseCustomRequest({ type: "quiz", files: [file()], questionTypes: { multipleChoice: true } }, UID);
    expect(parsed).toMatchObject({ ok: true, request: { type: "quiz", count: 10, difficulty: "exam", prompt: "" } });
  });

  it("accepts a long prompt with no files", () => {
    expect(parseCustomRequest({ type: "flashcards", prompt: long }, UID)).toMatchObject({ ok: true, request: { count: 20 } });
  });

  it("refuses a short prompt with nothing to check questions against", () => {
    const parsed = parseCustomRequest({ type: "flashcards", prompt: "quiz me on photosynthesis" }, UID);
    expect(parsed).toMatchObject({ ok: false });
    expect((parsed as { error: string }).error).toContain(String(MIN_MATERIAL_CHARS));
  });

  it("refuses another student's files and path tricks", () => {
    const other = { name: "a.pdf", url: `/api/download?key=${encodeURIComponent("users/someone-else/custom/a.pdf")}`, fileType: "pdf" };
    expect(parseCustomRequest({ type: "quiz", files: [other], questionTypes: { trueFalse: true } }, UID)).toMatchObject({ ok: false });
    const classFile = file("a.pdf", `users/${UID}/classes/c1/a.pdf`);
    expect(parseCustomRequest({ type: "quiz", files: [classFile], questionTypes: { trueFalse: true } }, UID)).toMatchObject({ ok: false });
    const traversal = file("a.pdf", `users/${UID}/custom/../classes/a.pdf`);
    expect(parseCustomRequest({ type: "quiz", files: [traversal], questionTypes: { trueFalse: true } }, UID)).toMatchObject({ ok: false });
  });

  it("refuses unreadable file types, too many files, and an over-long prompt", () => {
    expect(parseCustomRequest({ type: "quiz", files: [{ ...file("a.exe"), fileType: "exe" }], questionTypes: { trueFalse: true } }, UID)).toMatchObject({ ok: false });
    expect(parseCustomRequest({ type: "quiz", files: Array.from({ length: 11 }, () => file()), questionTypes: { trueFalse: true } }, UID)).toMatchObject({ ok: false });
    expect(parseCustomRequest({ type: "quiz", prompt: "y".repeat(12_001), files: [file()] }, UID)).toMatchObject({ ok: false });
  });

  it("checks counts per type and requires a quiz question type", () => {
    expect(parseCustomRequest({ type: "practice", files: [file()], count: 13 }, UID)).toMatchObject({ ok: false });
    expect(parseCustomRequest({ type: "practice", files: [file()], count: 12 }, UID)).toMatchObject({ ok: true });
    expect(parseCustomRequest({ type: "quiz", files: [file()], questionTypes: {} }, UID)).toMatchObject({ ok: false });
  });

  it("rejects unknown types", () => {
    expect(parseCustomRequest({ type: "essay", prompt: long }, UID)).toMatchObject({ ok: false });
  });
});

describe("customSources", () => {
  it("adds a long prompt as its own source beside the files", () => {
    const parsed = parseCustomRequest({ type: "quiz", prompt: long, files: [file()], questionTypes: { trueFalse: true } }, UID);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(customSources(parsed.request).map((s) => s.title)).toEqual(["notes.pdf", "Your prompt"]);
  });

  it("keeps a short prompt as instructions only", () => {
    const parsed = parseCustomRequest({ type: "quiz", prompt: "focus on chapter 2", files: [file()], questionTypes: { trueFalse: true } }, UID);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(customSources(parsed.request)).toHaveLength(1);
  });
});

describe("withInstructions", () => {
  it("leaves the text alone without instructions", () => {
    expect(withInstructions("material", "  ")).toBe("material");
  });
  it("puts the instructions in front and tells the model facts come from the material", () => {
    const out = withInstructions("material", "make it hard");
    expect(out.startsWith("The student's instructions")).toBe(true);
    expect(out).toContain("make it hard");
    expect(out.endsWith("material")).toBe(true);
  });
});
