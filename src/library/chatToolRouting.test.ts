import { describe, expect, it } from "vitest";
import { selectToolGroups } from "./chatToolRouting";

const u = (content: string) => ({ role: "user", content });
const a = (content: string) => ({ role: "assistant", content });
const groups = (...m: { role: string; content: string }[]) => [...selectToolGroups(m)].sort();

describe("selectToolGroups", () => {
  it("routes typical student requests to the right groups", () => {
    expect(groups(u("Add a study session tomorrow at 3pm"))).toContain("calendar");
    expect(groups(u("What do my notes say about heaps?"))).toContain("notes");
    expect(groups(u("Make flashcards from Sorting Algorithms.pdf"))).toEqual(expect.arrayContaining(["study", "documents"]));
    expect(groups(u("How am I doing in CSC 325?"))).toEqual(expect.arrayContaining(["progress", "courses"]));
    expect(groups(u("What's Dr. Min's office number?"))).toContain("courses");
    expect(groups(u("Find a YouTube video on Dijkstra"))).toContain("web");
    expect(groups(u("I feel shaky on CSC 325 honestly, maybe a 2 out of 5."))).toContain("progress");
    expect(groups(u("Honestly I'm lost in CSC 4753"))).toContain("progress");
    expect(groups(u("I feel pretty good about CSC 130 now, 4/5."))).toContain("progress");
  });

  it("keeps a plain concept question small", () => {
    expect(groups(u("Explain recursion with an example"))).toEqual(["documents", "web"]);
  });

  it("carries tools into short follow-ups", () => {
    expect(groups(u("Can you help me study for 330?"), a("Want me to make a quiz from L4 - Type Systems.pdf?"), u("yes please"))).toContain("study");
    expect(groups(u("my trees note is outdated"), a("Should I delete your note \"Trees\"?"), u("yep"))).toContain("notes");
  });

  it("doesn't route unrelated groups", () => {
    const g = groups(u("Add a study session tomorrow at 3pm"));
    expect(g).not.toContain("notes");
    expect(g).not.toContain("web");
  });
});
