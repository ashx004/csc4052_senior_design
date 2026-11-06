import { describe, expect, it } from "vitest";
import { StreamingGuard, stripPlanningOpening, type OutputGuard } from "./outputGuard";

// Planning text the model wrote as the start of its answer, seen in live chat tests.
describe("stripPlanningOpening", () => {
  it("drops the model's planning sentences before the answer", () => {
    const text = "The student wants to be quizzed on the Laws of Robotics. I searched for them in their class files. The first law is that a robot may not injure a human being.";
    expect(stripPlanningOpening(text)).toBe("The first law is that a robot may not injure a human being.");
  });

  it("drops several planning sentences in a row", () => {
    const text = "The user is asking about the perceptron rule. I attempted to search their notes. Let me check. The update step adds the learning rate times the error times the input.";
    expect(stripPlanningOpening(text)).toBe("The update step adds the learning rate times the error times the input.");
  });

  it("leaves a normal answer untouched", () => {
    const text = "Based on your notes in 02 LLMs.txt, AGI is roughly equal to a human.";
    expect(stripPlanningOpening(text)).toBe(text);
  });

  it("leaves a planning-like sentence that appears after the answer starts", () => {
    const text = "Artificial General Intelligence is roughly equal to a human. I searched a lot of sources before writing this, but the point stands.";
    expect(stripPlanningOpening(text)).toBe(text);
  });
});

describe("StreamingGuard opening", () => {
  const passThrough = { clean: (text: string) => text } as unknown as OutputGuard;

  it("removes planning text that arrives in small chunks", () => {
    let out = "";
    const guard = new StreamingGuard(passThrough, (text) => (out += text), { planningOpening: true });
    for (const chunk of ["The student wan", "ts to be quizzed. I sea", "rched their notes. ", "The first law is that a robot may not injure a human being."]) {
      guard.push(chunk);
    }
    guard.flush();
    expect(out.trim()).toBe("The first law is that a robot may not injure a human being.");
  });

  it("passes a normal reply through unchanged", () => {
    let out = "";
    const guard = new StreamingGuard(passThrough, (text) => (out += text), { planningOpening: true });
    guard.push("Your notes say AGI is roughly equal to a human. ");
    guard.push("Artificial Super Intelligence surpasses it.");
    guard.flush();
    expect(out).toBe("Your notes say AGI is roughly equal to a human. Artificial Super Intelligence surpasses it.");
  });
});
