// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { updateDoc, syncSyllabusEvents, listSyllabusEventIds } = vi.hoisted(() => ({
  updateDoc: vi.fn(async () => {}),
  syncSyllabusEvents: vi.fn(async () => ({ added: 0, updated: 0, removed: 0 })),
  listSyllabusEventIds: vi.fn(async () => [] as string[]),
}));

vi.mock("@/src/library/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
  updateDoc,
}));
vi.mock("@/src/library/syllabusCalendarSync", () => ({ syncSyllabusEvents, listSyllabusEventIds }));
vi.mock("@/src/components/resourceManagement/fileUploadService", () => ({
  INDEXABLE_FILE_TYPES: ["pdf", "txt"],
  MAX_FILE_SIZE_BYTES: 20 * 1024 * 1024,
  uploadUserResource: vi.fn(),
}));

import SyllabusModal from "./SyllabusModal";

const saved = {
  resourceId: "res1",
  name: "BIO101 Syllabus.txt",
  officeHours: "Tue/Thu 2-3:30",
  textbooks: "Campbell Biology",
  grading: "Exams 50%",
  dates: [
    { date: "2026-11-25", title: "Fall Break", kind: "holiday" as const },
    { date: "2026-12-02", title: "Midterm 2", kind: "exam" as const },
  ],
};

function open() {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(
    <SyllabusModal
      uid="u1"
      courseId="course1"
      mode="edit"
      current={{ classCode: "BIO 101", className: "Intro Biology", term: "Fall 2026", syllabus: saved }}
      onClose={onClose}
      onApplied={onApplied}
    />
  );
  return { onClose, onApplied };
}

beforeEach(() => {
  updateDoc.mockClear();
  syncSyllabusEvents.mockClear();
  listSyllabusEventIds.mockClear();
});
afterEach(cleanup);

describe("SyllabusModal (edit mode)", () => {
  it("opens straight on the saved details so the student can fix what the AI got wrong", () => {
    open();
    expect(screen.getByText("Edit syllabus details")).toBeTruthy();
    expect((screen.getAllByLabelText("Title")[0] as HTMLInputElement).value).toBe("Fall Break");
    expect((screen.getAllByLabelText("Date")[1] as HTMLInputElement).value).toBe("2026-12-02");
  });

  it("saves an edited title and a multi-day range, and puts the whole range on the calendar", async () => {
    const { onApplied, onClose } = open();

    fireEvent.change(screen.getAllByLabelText("Title")[1], { target: { value: "Midterm Exam 2" } });
    fireEvent.change(screen.getAllByLabelText("Last day (optional)")[0], { target: { value: "2026-11-27" } });
    fireEvent.click(screen.getAllByLabelText(/On my calendar/)[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save to course" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const stored = (updateDoc.mock.calls[0] as unknown[])[1] as { syllabus: { dates: Record<string, string>[] } };
    expect(stored.syllabus.dates).toEqual([
      { date: "2026-11-25", endDate: "2026-11-27", title: "Fall Break", kind: "holiday" },
      { date: "2026-12-02", title: "Midterm Exam 2", kind: "exam" },
    ]);

    const planned = (syncSyllabusEvents.mock.calls[0] as unknown[])[3] as { data: Record<string, string> }[];
    expect(planned).toHaveLength(1);
    expect(planned[0].data).toMatchObject({ title: "BIO 101: Fall Break", startTime: "2026-11-25", endTime: "2026-11-28", allDay: true });
    expect(onApplied).toHaveBeenCalled();
  });

  it("ignores a last day that is not after the first day", () => {
    open();
    fireEvent.change(screen.getAllByLabelText("Last day (optional)")[0], { target: { value: "2026-11-20" } });
    expect((screen.getAllByLabelText("Last day (optional)")[0] as HTMLInputElement).value).toBe("");
  });

  it("lets a date be removed, and removing it stops it being sent to the calendar", async () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: "Remove Fall Break" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to course" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const stored = (updateDoc.mock.calls[0] as unknown[])[1] as { syllabus: { dates: { title: string }[] } };
    expect(stored.syllabus.dates.map((d) => d.title)).toEqual(["Midterm 2"]);
  });

  it("shows an error and stays open when saving fails", async () => {
    updateDoc.mockRejectedValueOnce(new Error("offline"));
    const { onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: "Save to course" }));
    await waitFor(() => expect(screen.getByText(/Couldn't save the course info/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});
