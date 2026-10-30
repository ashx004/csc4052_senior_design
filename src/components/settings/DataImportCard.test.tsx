// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  previewDataImport: vi.fn(),
  runDataImport: vi.fn(),
}));

vi.mock("@/src/context/AuthContext", () => ({
  useAuth: () => ({ user: { getIdToken: async () => "token" } }),
}));
vi.mock("@/src/library/dataImportRequest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/dataImportRequest")>()),
  previewDataImport: mocks.previewDataImport,
  runDataImport: mocks.runDataImport,
}));

import DataImportCard from "./DataImportCard";
import { ImportStillRunningError } from "@/src/library/dataImportRequest";

const counts = { documents: 3, indexedDocuments: 2, quizSets: 1, flashcardSets: 2, practiceSets: 0 };
const preview = {
  generatedAt: null,
  fromAnotherAccount: true,
  classes: [
    { sourceId: "new-class", classCode: "MATH 2057", className: "Calculus III", term: "Fall 2026", counts, files: 3, conflict: null },
    { sourceId: "dupe", classCode: "CSC 4052", className: "Senior Design", term: "Fall 2026", counts, files: 3, conflict: { id: "mine", className: "Senior Design" } },
  ],
};

function chooseFile() {
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["zip"], "catalyst-data-export.zip", { type: "application/zip" })] } });
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.previewDataImport.mockResolvedValue(preview);
});

describe("DataImportCard", () => {
  it("previews the file, defaults existing classes to skip, and imports the student's choices", async () => {
    mocks.runDataImport.mockResolvedValue({
      queuedJobs: 1,
      classes: [
        { sourceId: "new-class", className: "Calculus III", action: "imported", ...counts, files: 3, searchRestored: 2, queuedForIndexing: 1 },
        { sourceId: "dupe", className: "Senior Design", action: "merged", ...counts, files: 3, searchRestored: 2, queuedForIndexing: 0 },
      ],
    });
    render(<DataImportCard />);
    chooseFile();

    expect(await screen.findByText(/came from a different Catalyst account/)).toBeTruthy();
    expect(screen.getByText(/You already have this class/)).toBeTruthy();
    const dupeChoice = screen.getByLabelText("What to do with Senior Design") as HTMLSelectElement;
    expect(dupeChoice.value).toBe("skip");
    expect(screen.getByRole("button", { name: "Import 1 class" })).toBeTruthy();

    fireEvent.change(dupeChoice, { target: { value: "merge" } });
    fireEvent.click(screen.getByRole("button", { name: "Import 2 classes" }));

    await waitFor(() => expect(mocks.runDataImport).toHaveBeenCalled());
    expect(mocks.runDataImport.mock.calls[0][2]).toEqual({ "new-class": "import", dupe: "merge" });
    expect(await screen.findByText("Import finished")).toBeTruthy();
    expect(screen.getByText("Calculus III: Imported")).toBeTruthy();
    expect(screen.getByText(/search ready for 2 documents, 1 still being indexed/)).toBeTruthy();
    expect(screen.getByText("Senior Design: Merged")).toBeTruthy();
  });

  it("shows why a file was rejected and lets the student pick another", async () => {
    mocks.previewDataImport.mockRejectedValue(new Error("A file in this export is damaged or was changed after it was downloaded."));
    render(<DataImportCard />);
    chooseFile();
    expect((await screen.findByRole("alert")).textContent).toContain("damaged or was changed");
    expect(screen.getByText("Choose export file")).toBeTruthy();
  });

  it("tells the student a long import is still finishing instead of reporting a failure", async () => {
    mocks.runDataImport.mockRejectedValue(new ImportStillRunningError("timeout"));
    render(<DataImportCard />);
    chooseFile();
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 class" }));
    expect(await screen.findByText(/still finishing/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
