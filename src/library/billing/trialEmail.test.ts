import { describe, expect, it } from "vitest";
import { normalizeEmail, trialKey } from "./trialEmail";

describe("trial email key", () => {
  it("treats Gmail dots, + tags, case and googlemail as one inbox", () => {
    expect(normalizeEmail(" J.Doe+catalyst@GMail.com ")).toBe("jdoe@gmail.com");
    expect(trialKey("j.d.o.e@googlemail.com")).toBe(trialKey("jdoe@gmail.com"));
  });
  it("strips + tags elsewhere but keeps dots, which other providers treat as distinct", () => {
    expect(normalizeEmail("a.b+x@latech.edu")).toBe("a.b@latech.edu");
    expect(trialKey("a.b@latech.edu")).not.toBe(trialKey("ab@latech.edu"));
  });
  it("stores a hash, not the address", () => {
    expect(trialKey("jdoe@gmail.com")).toMatch(/^[0-9a-f]{64}$/);
  });
});
