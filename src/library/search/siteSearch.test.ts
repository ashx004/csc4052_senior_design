import { describe, expect, it } from "vitest";
import { searchSite } from "./siteSearch";
import { SITE_SEARCH_ENTRIES, courseSearchEntries } from "./siteSearchIndex";

const top = (query: string, entries = SITE_SEARCH_ENTRIES) => searchSite(query, entries)[0]?.id;
const ids = (query: string, entries = SITE_SEARCH_ENTRIES) => searchSite(query, entries).map((e) => e.id);

describe("searchSite", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(searchSite("", SITE_SEARCH_ENTRIES)).toEqual([]);
    expect(searchSite("   ", SITE_SEARCH_ENTRIES)).toEqual([]);
  });

  it("puts an exact page title first", () => {
    expect(top("calendar")).toBe("page-calendar");
    expect(top("Advising")).toBe("page-advising");
    expect(top("notes")).toBe("page-notes");
  });

  it("matches the start of a title while typing", () => {
    expect(top("cal")).toBe("page-calendar");
    expect(top("adv")).toBe("page-advising");
    expect(top("sett")).toBe("page-settings");
  });

  it("finds pages by related words", () => {
    expect(ids("schedule")).toEqual(expect.arrayContaining(["page-advising", "page-calendar"]));
    expect(ids("dashboard")).toContain("page-dashboard");
    expect(ids("transcript")).toContain("page-advising");
  });

  it("finds features, pointing at the page that has them", () => {
    const darkMode = searchSite("dark mode", SITE_SEARCH_ENTRIES)[0];
    expect(darkMode.id).toBe("feature-dark-mode");
    expect(darkMode.href).toBe("/settings");
    expect(top("generate schedule")).toBe("feature-generate-schedule");
  });

  it("requires every typed word to match", () => {
    expect(ids("dark mode")).not.toContain("page-calendar");
    expect(searchSite("calendar zzzz", SITE_SEARCH_ENTRIES)).toEqual([]);
  });

  it("tolerates a one-letter typo in longer words", () => {
    expect(ids("calender")).toContain("page-calendar");
    expect(ids("advisng")).toContain("page-advising");
  });

  it("does not treat very short words as typos", () => {
    expect(searchSite("xq", SITE_SEARCH_ENTRIES)).toEqual([]);
  });

  it("ignores case and punctuation", () => {
    expect(top("HELP & FAQ")).toBe("page-help");
    expect(top("ai-assistant")).toBe("page-ai-assistant");
  });

  it("links help topics to their section of the Help page", () => {
    const result = searchSite("troubleshooting", SITE_SEARCH_ENTRIES)[0];
    expect(result.href).toBe("/help#troubleshooting");
  });

  it("limits the number of results", () => {
    expect(searchSite("a", SITE_SEARCH_ENTRIES, 3).length).toBeLessThanOrEqual(3);
  });

  it("returns no unknown results", () => {
    expect(searchSite("qwertyuiop", SITE_SEARCH_ENTRIES)).toEqual([]);
  });
});

describe("courseSearchEntries", () => {
  const entries = [...SITE_SEARCH_ENTRIES, ...courseSearchEntries("abc123", "CSC 4052")];

  it("links a class's sections to that class", () => {
    const blocks = searchSite("blocks game", entries)[0];
    expect(blocks.id).toBe("course-blocks");
    expect(blocks.href).toBe("/courses/abc123/discover/blocks");
  });

  it("still shows the general page alongside the class's own section", () => {
    expect(ids("learning", entries)).toEqual(expect.arrayContaining(["course-learning", "page-learning"]));
  });

  it("finds a class's sections by the class name", () => {
    expect(ids("csc 4052 blocks", entries)).toContain("course-blocks");
  });

  it("falls back to a generic name when the class name isn't known yet", () => {
    expect(courseSearchEntries("abc123")[0].title).toBe("this class overview");
  });
});
