// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import AdvisingDocumentsViewer from "./AdvisingDocumentsViewer";

const user = { getIdToken: async () => "token" } as unknown as User;

const listing = {
  documents: [
    { type: "transcript", label: "Transcript", storagePath: "users/u1/advising/transcript.pdf", available: true, size: 2048, lastModified: "2026-10-01T00:00:00Z" },
    { type: "curriculum", label: "Curriculum Sheet", storagePath: "users/u1/advising/curriculum.pdf", available: true, size: 4096, lastModified: "2026-10-02T00:00:00Z" },
  ],
};

let downloads: Record<string, (r: Response) => void>;
let blobCounter = 0;

beforeEach(() => {
  downloads = {};
  blobCounter = 0;
  const blobUrls = new Map<Blob, string>();
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      const url = `blob:test/${++blobCounter}`;
      blobUrls.set(blob, url);
      return url;
    },
    revokeObjectURL: vi.fn(),
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/advising/documents") return Promise.resolve(new Response(JSON.stringify(listing)));
      // Each download waits until the test lets it finish, in whatever order it likes.
      return new Promise<Response>((resolve) => {
        downloads[url.includes("transcript") ? "transcript" : "curriculum"] = resolve;
      });
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pdf = () => new Response(new Blob(["%PDF"]));

describe("AdvisingDocumentsViewer", () => {
  it("lists both documents with their size and upload date", async () => {
    render(<AdvisingDocumentsViewer user={user} />);
    expect(await screen.findByText("Transcript")).toBeTruthy();
    expect(screen.getByText("Curriculum Sheet")).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
  });

  it("shows the document the student clicked last, even if an earlier one finishes downloading later", async () => {
    render(<AdvisingDocumentsViewer user={user} />);
    fireEvent.click((await screen.findByText("Transcript")).closest("button")!);
    fireEvent.click(screen.getByText("Curriculum Sheet").closest("button")!);
    await waitFor(() => expect(downloads.transcript && downloads.curriculum).toBeTruthy());

    await act(async () => downloads.curriculum(pdf()));
    const shown = (await screen.findByTitle("Curriculum Sheet preview")) as HTMLIFrameElement;
    const curriculumUrl = shown.getAttribute("src");

    // The slow transcript download finally arrives: it must not replace the curriculum preview.
    await act(async () => downloads.transcript(pdf()));
    expect(screen.getByTitle("Curriculum Sheet preview").getAttribute("src")).toBe(curriculumUrl);
    expect(screen.queryByTitle("Transcript preview")).toBeNull();
    expect(blobCounter).toBe(1);
  });

  it("does not bring a preview back after the student closed it", async () => {
    render(<AdvisingDocumentsViewer user={user} />);
    fireEvent.click((await screen.findByText("Transcript")).closest("button")!);
    await waitFor(() => expect(downloads.transcript).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => downloads.transcript(pdf()));
    expect(screen.queryByTitle("Transcript preview")).toBeNull();
    expect(screen.queryByText("Opening document...")).toBeNull();
  });

  it("says so when a document isn't there, without trying to download it", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/advising/documents"
          ? new Response(JSON.stringify({ documents: [{ ...listing.documents[0], available: false, size: null, lastModified: null }] }))
          : new Response("", { status: 404 })
      )
    );
    render(<AdvisingDocumentsViewer user={user} />);
    fireEvent.click((await screen.findByText("Transcript")).closest("button")!);
    expect(await screen.findByText(/isn't available/)).toBeTruthy();
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).startsWith("/api/download"))).toBe(false);
  });
});
