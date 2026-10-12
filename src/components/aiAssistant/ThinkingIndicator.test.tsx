// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThinkingIndicator from "./ThinkingIndicator";
import type { LiveActivity } from "@/src/library/chatLive";

afterEach(cleanup);

const activity = (overrides: Partial<LiveActivity> = {}): LiveActivity => ({ thoughts: "", summary: "", tools: [], ...overrides });

describe("ThinkingIndicator", () => {
  it("shows the pipeline status when nothing more specific is known", () => {
    render(<ThinkingIndicator status="Reviewing what it found..." activity={activity()} />);
    expect(screen.getByRole("status").textContent).toContain("Reviewing what it found...");
  });

  it("prefers the small model's summary, then the tool being used right now", () => {
    const { rerender } = render(<ThinkingIndicator status="Thinking..." activity={activity({ summary: "Comparing the two exam dates" })} />);
    expect(screen.getByRole("status").textContent).toContain("Comparing the two exam dates");

    rerender(
      <ThinkingIndicator
        status="Thinking..."
        activity={activity({
          summary: "Comparing the two exam dates",
          tools: [{ id: 1, name: "read_document", label: "Reading a document...", doneLabel: "Read a document", detail: "Cell Biology Notes.txt", state: "running" }],
        })}
      />
    );
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("Reading a document: Cell Biology Notes.txt");
  });

  it("lists finished and failed tools", () => {
    render(
      <ThinkingIndicator
        status={null}
        activity={activity({
          tools: [
            { id: 1, name: "search_documents", label: "Searching your documents...", doneLabel: "Searched your documents", detail: "“mitosis”", state: "done" },
            { id: 2, name: "web_search", label: "Searching the web...", doneLabel: "Searched the web", state: "failed" },
          ],
        })}
      />
    );
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("Searched your documents:");
    expect(text).toContain("“mitosis”");
    expect(text).toContain("Searched the web (didn't work)");
  });

  it("keeps the raw reasoning behind a Show thoughts toggle", () => {
    // The headline shows only the latest sentence, so the first one appears only in the full reasoning.
    render(<ThinkingIndicator status={null} activity={activity({ thoughts: "Midterm 1 comes first. Midterm 2 comes later." })} />);
    expect(screen.queryByText(/Midterm 1 comes first/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show thoughts/ }));
    expect(screen.getByText(/Midterm 1 comes first/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hide thoughts/ }));
    expect(screen.queryByText(/Midterm 1 comes first/)).toBeNull();
  });

  it("falls back to the last full sentence of the reasoning when there is no summary", () => {
    render(<ThinkingIndicator status={null} activity={activity({ thoughts: "First I check the syllabus. Then I compare the dates." })} />);
    expect(screen.getByRole("status").textContent).toContain("Then I compare the dates.");
  });
});
