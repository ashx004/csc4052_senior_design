import { describe, expect, it } from "vitest";
import { studentRequested } from "./chatConsent";

const u = (content: string) => ({ role: "user", content });
const a = (content: string) => ({ role: "assistant", content });

describe("studentRequested", () => {
  it("accepts a direct request", () => {
    expect(studentRequested("delete", [u("Please delete my Graph algorithms note")])).toBe(true);
    expect(studentRequested("delete", [u("cancel my study session tomorrow")])).toBe(true);
    expect(studentRequested("edit", [u("Change Dr. Min's email to mmin@latech.edu")])).toBe(true);
    expect(studentRequested("edit", [u("move my session to 6pm")])).toBe(true);
    expect(studentRequested("edit", [u("Take my Heap basics note out of its notebook.")])).toBe(true);
  });

  it("rejects when the student only asked a question", () => {
    expect(studentRequested("delete", [u("What notes do I have for CSC 325?")])).toBe(false);
    expect(studentRequested("edit", [u("Who teaches CSC 330?")])).toBe(false);
  });

  it("accepts a yes to the assistant's matching question", () => {
    expect(studentRequested("delete", [u("I'm done with my old trees note"), a("Do you want me to delete \"Trees\"?"), u("yes")])).toBe(true);
    expect(studentRequested("edit", [u("his office moved"), a("Should I update the office to NETH 240?"), u("yep go ahead")])).toBe(true);
  });

  it("doesn't let a yes to something else authorize a delete", () => {
    expect(studentRequested("delete", [u("quiz me"), a("Want me to make a quiz from L4?"), u("yes")])).toBe(false);
  });
});
