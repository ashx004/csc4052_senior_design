import { describe, expect, it } from "vitest";
import { correctionFor, mentionsConfirmCard, toolSucceeded, unbackedClaims, unfulfilledRequests } from "./actionClaims";
import { studentRequested } from "./chatConsent";

const ask = 'Make a note called "Radix recap" for CSC 325 summarizing radix sort, and put a 1 hour review on my calendar Sunday at 4pm.';
const reply = 'I\'ve created your note **"Radix recap"** for CSC 325 with this summary: - digits least to most significant. Your calendar now includes a 1-hour review session this Sunday at 4:00 PM.';
const labels = (r: ReturnType<typeof unbackedClaims>) => r.map((k) => k.label);

describe("unbackedClaims", () => {
  it("catches the live case: note claimed, only the event was created", () => {
    expect(labels(unbackedClaims(reply, ask, new Set(["create_calendar_event"])))).toEqual(["the note"]);
  });

  it("is quiet when every claim is backed", () => {
    expect(unbackedClaims(reply, ask, new Set(["create_calendar_event", "create_note"]))).toEqual([]);
  });

  it("ignores offers, questions and failures", () => {
    const offers = "I couldn't create the note right now. Want me to add it to your calendar instead? I can make a quiz if you like.";
    expect(unbackedClaims(offers, ask + " quiz", new Set())).toEqual([]);
  });

  it("only checks kinds of action the student asked for", () => {
    // Describing an existing calendar isn't a claim when nothing was requested.
    expect(unbackedClaims("Your calendar now shows two events this week.", "What's on my calendar?", new Set())).toEqual([]);
  });

  it("catches claims in either word order", () => {
    const flipped = 'Note "Eval radix recap" created for CSC 325. Your calendar event is scheduled for Sunday.';
    expect(labels(unbackedClaims(flipped, ask, new Set(["create_calendar_event"])))).toEqual(["the note"]);
    expect(labels(unbackedClaims("Dr. Cherry's office location for CSC 330 has been updated to NETH 240.", "his office moved to NETH 240\nyes", new Set()))).toEqual(["the class details"]);
  });

  it("doesn't read a Confirm card's description as a claim", () => {
    expect(unbackedClaims('The "Eval lab" event is ready to be deleted - press Confirm to proceed.', "delete my eval lab event", new Set())).toEqual([]);
    expect(unbackedClaims("Once you confirm, the event will be removed.", "delete my eval lab event", new Set())).toEqual([]);
  });

  it("catches claimed deletions and ratings", () => {
    expect(labels(unbackedClaims("I've deleted the Office hours event.", "delete my office hours event", new Set()))).toEqual(["the deletion"]);
    expect(labels(unbackedClaims("I've updated your confidence rating for CSC 325 to 2/5.", "I'm shaky on 325, 2/5", new Set()))).toEqual(["your confidence rating"]);
  });
});

describe("mentionsConfirmCard", () => {
  it("spots replies that point at a Confirm card", () => {
    expect(mentionsConfirmCard('To delete it, please confirm by clicking "Confirm" below.')).toBe(true);
    expect(mentionsConfirmCard("Press **Confirm** to remove it from your calendar.")).toBe(true);
    expect(mentionsConfirmCard("✅ Confirm | ❌ Cancel")).toBe(true);
    expect(mentionsConfirmCard("Tap Confirm on the card to go ahead.")).toBe(true);
    expect(mentionsConfirmCard('Confirm to delete the "Grid demo" event scheduled for Friday.')).toBe(true);
  });
  it("ignores other uses of the word", () => {
    expect(mentionsConfirmCard("Can you confirm the exam date with Dr. Min?")).toBe(false);
    expect(mentionsConfirmCard("I added the event. Let me know if you want changes.")).toBe(false);
  });
});

describe("toolSucceeded", () => {
  it("tells results from refusals", () => {
    expect(toolSucceeded('Created the typed note "X" (CSC 325)')).toBe(true);
    expect(toolSucceeded("Error: failed to create the calendar event.")).toBe(false);
    expect(toolSucceeded("Not done: the student hasn't asked to change that.")).toBe(false);
  });
});

describe("correctionFor", () => {
  it("ends in a question a plain yes can confirm", () => {
    const [details] = unbackedClaims("I've updated Dr. Cherry's office to NETH 240.", "His office moved to NETH 240", new Set());
    const text = correctionFor([details]);
    expect(text).toBe("Correction: the class details wasn't actually done yet. Want me to update the class details now?");
    expect(studentRequested("edit", [{ role: "user", content: "His office moved" }, { role: "assistant", content: text }, { role: "user", content: "yes" }])).toBe(true);
  });
});

describe("unfulfilledRequests", () => {
  it("spots a PDF that was asked for and never made", () => {
    expect(unfulfilledRequests("Make a short PDF study guide on type systems from my CSC 330 L4 lecture.", new Set(["read_document"])).map((r) => r.offer)).toEqual(["create the PDF"]);
    expect(unfulfilledRequests("Make a short PDF study guide on type systems.", new Set(["create_pdf"]))).toEqual([]);
  });

  it("covers quizzes, flashcards and named notes, and ignores questions about them", () => {
    expect(unfulfilledRequests("Make a 5-question quiz from L4.pdf", new Set()).map((r) => r.offer)).toEqual(["create the quiz"]);
    expect(unfulfilledRequests("Write me some notes on heaps called Heap basics", new Set()).map((r) => r.offer)).toEqual(["save the note"]);
    expect(unfulfilledRequests("What quizzes do I have for CSC 325?", new Set())).toEqual([]);
    expect(unfulfilledRequests("How do flashcards help with memory?", new Set())).toEqual([]);
    expect(unfulfilledRequests("Rewrite my Eval heap basics note from scratch as one sentence.", new Set(["list_notes"])).map((r) => r.offer)).toEqual(["rewrite the note"]);
    expect(unfulfilledRequests("Rewrite my heap note as one sentence.", new Set(["edit_note"]))).toEqual([]);
  });
});
