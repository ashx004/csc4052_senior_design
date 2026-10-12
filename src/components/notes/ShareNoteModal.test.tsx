// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareNoteModal from "./ShareNoteModal";
import { ExportSlotProvider, useExportRegistration, type ExportGetter, type ExportSlot } from "./noteExportSlot";
import type { ExportSource } from "./ExportMenu";

// The notes store starts Firebase, which needs real keys; exports here never read it.
vi.mock("@/src/library/notes/notesStore", () => ({ getNote: async () => null }));

const downloads: { name: string; blob: Blob }[] = [];
vi.mock("@/src/library/notes/notebookArchive", async (importActual) => ({
  ...(await importActual<typeof import("@/src/library/notes/notebookArchive")>()),
  downloadBlob: (name: string, blob: Blob) => downloads.push({ name, blob }),
}));

afterEach(() => {
  cleanup();
  downloads.length = 0;
});

const typedSource = (): ExportSource => ({
  uid: "u1",
  note: { id: "n1", title: "Exam 1 Material", fileType: undefined, url: undefined },
  getPages: async () => [],
  typed: { markdown: () => "# Heading\n\nSome text", plain: () => "Heading\n\nSome text" },
});

describe("Share dialog on the note page", () => {
  it("offers sharing and, underneath, the export formats for a typed note", () => {
    render(<ShareNoteModal type="note" id="n1" onClose={() => {}} exportSource={typedSource} typedNote />);
    expect(screen.getByRole("button", { name: "Create link" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Export a copy/ })).toBeTruthy();
    for (const name of ["PDF", "Markdown", "Plain text", "Markup data (JSON)"]) {
      expect(screen.getByRole("menuitem", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) })).toBeTruthy();
    }
  });

  it("shows a file note's own formats", () => {
    render(<ShareNoteModal type="note" id="n1" onClose={() => {}} exportSource={typedSource} typedNote={false} />);
    expect(screen.getByRole("menuitem", { name: /^Marked-up copy \(PDF\)/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^Everything \(ZIP\)/ })).toBeTruthy();
  });

  it("downloads from the dialog and keeps it open", async () => {
    render(<ShareNoteModal type="note" id="n1" onClose={() => {}} exportSource={typedSource} typedNote />);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Markdown/ }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe("Exam 1 Material.md");
    expect(await screen.findByText("Downloaded.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says so when the editor isn't ready to export yet", async () => {
    render(<ShareNoteModal type="note" id="n1" onClose={() => {}} exportSource={() => null} typedNote />);
    fireEvent.click(screen.getByRole("menuitem", { name: /^PDF/ }));
    expect(await screen.findByText(/Export isn't ready yet/)).toBeTruthy();
    expect(downloads).toHaveLength(0);
  });

  it("has no export section when sharing a notebook from the library", () => {
    render(<ShareNoteModal type="notebook" id="b1" onClose={() => {}} />);
    expect(screen.queryByRole("heading", { name: /Export a copy/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("closes from the Close button", () => {
    let closed = 0;
    render(<ShareNoteModal type="note" id="n1" onClose={() => void (closed += 1)} exportSource={typedSource} typedNote />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(closed).toBe(1);
  });
});

describe("useExportRegistration", () => {
  function Editor({ getter }: { getter: ExportGetter }) {
    const inWorkspace = useExportRegistration(getter);
    return <p>{inWorkspace ? "in workspace" : "standalone"}</p>;
  }

  it("hands the editor's export to the page, and withdraws it when the editor goes away", () => {
    let registered: ExportGetter | null = null;
    const slot: ExportSlot = { set: (getter) => void (registered = getter) };
    const getter: ExportGetter = () => typedSource();
    const { unmount } = render(
      <ExportSlotProvider value={slot}>
        <Editor getter={getter} />
      </ExportSlotProvider>
    );
    expect(screen.getByText("in workspace")).toBeTruthy();
    expect(registered).toBe(getter);
    unmount();
    expect(registered).toBeNull();
  });

  it("tells an editor with no page around it to show its own Export button", () => {
    render(<Editor getter={() => null} />);
    expect(screen.getByText("standalone")).toBeTruthy();
  });
});
