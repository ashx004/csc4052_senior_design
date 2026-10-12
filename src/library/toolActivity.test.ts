import { describe, expect, it } from "vitest";
import { toolDetail, toolDoneLabel, toolRunningLabel, TOOL_LABELS } from "./toolActivity";

describe("tool labels", () => {
  it("labels known tools and falls back for unknown ones", () => {
    expect(toolRunningLabel("search_documents")).toBe("Searching your documents...");
    expect(toolDoneLabel("search_documents")).toBe("Searched your documents");
    expect(toolRunningLabel("brand_new_tool")).toBe("Working on it...");
    expect(toolDoneLabel("brand_new_tool")).toBe("Finished a step");
  });
  it("covers every tool the chat can call", () => {
    for (const name of ["create_note", "edit_note", "list_notes", "read_note", "organize_notes", "get_course_details", "update_course_details", "list_study_sets", "set_self_confidence", "load_tools"]) {
      expect(TOOL_LABELS[name], name).toBeDefined();
    }
  });
});

describe("toolDetail", () => {
  it("quotes search queries", () => {
    expect(toolDetail("search_documents", { query: "mitosis phases", courseId: "abc" })).toBe("“mitosis phases”");
    expect(toolDetail("web_search", { query: "python 3.14" })).toBe("“python 3.14”");
  });
  it("shows file and event names plainly", () => {
    expect(toolDetail("read_document", { documentName: "Syllabus.pdf" })).toBe("Syllabus.pdf");
    expect(toolDetail("create_calendar_event", { title: "Midterm", date: "2026-10-22" })).toBe("Midterm");
  });
  it("never shows IDs or tokens", () => {
    expect(toolDetail("read_document", { documentName: "aB3dE5fG7hJ9kL1mN3pQ5rS7t" })).toBeUndefined();
    expect(toolDetail("read_document", { documentName: "Notes aB3dE5fG7hJ9kL1mN3pQ5rS7t" })).toBe("Notes");
    expect(toolDetail("read_document", { courseId: "aB3dE5fG7hJ9kL1mN3pQ5rS7t" })).toBeUndefined();
  });
  it("shortens long text and ignores bad input", () => {
    expect(toolDetail("web_search", { query: "word ".repeat(40) })!.length).toBeLessThanOrEqual(62);
    expect(toolDetail("web_search", null)).toBeUndefined();
    expect(toolDetail("web_search", { query: 5 })).toBeUndefined();
  });
});
