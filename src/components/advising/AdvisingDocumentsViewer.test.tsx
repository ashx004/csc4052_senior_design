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

  it("keeps the page shell and recovers from a network failure by retrying the same request", async () => {
    let listAttempts = 0;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url !== "/api/advising/documents") return Promise.resolve(pdf());
      listAttempts += 1;
      return listAttempts === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(new Response(JSON.stringify(listing)));
    });

    render(<AdvisingDocumentsViewer user={user} />);

    expect(await screen.findByRole("heading", { name: "We're having trouble connecting" })).toBeTruthy();
    // The surrounding page content remains present while only this data region recovers.
    expect(screen.getByRole("heading", { name: "My Documents" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Transcript")).toBeTruthy();
    const listCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === "/api/advising/documents");
    expect(listCalls).toHaveLength(2);
    expect(listCalls.map(([, options]) => options)).toEqual([
      { headers: { Authorization: "Bearer token" } },
      { headers: { Authorization: "Bearer token" } },
    ]);
  });

  it("uses server recovery copy, keeps retry available after another failure, and hides server details", async () => {
    const privateMessage = "database connection string leaked";
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/advising/documents"
          ? new Response(JSON.stringify({ error: privateMessage }), { status: 503 })
          : pdf()
      )
    );

    render(<AdvisingDocumentsViewer user={user} />);

    expect(await screen.findByRole("heading", { name: "Catalyst couldn't complete that request" })).toBeTruthy();
    expect(screen.queryByText(privateMessage)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      const listCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === "/api/advising/documents");
      expect(listCalls).toHaveLength(2);
    });
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("uses the unavailable recovery variant for a missing required resource", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      Promise.resolve(url === "/api/advising/documents" ? new Response("", { status: 404 }) : pdf())
    );

    render(<AdvisingDocumentsViewer user={user} />);

    expect(await screen.findByRole("heading", { name: "This page isn't available" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("does not mislabel an authorization response as a network or server error", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      Promise.resolve(url === "/api/advising/documents" ? new Response("", { status: 401 }) : pdf())
    );

    render(<AdvisingDocumentsViewer user={user} />);

    expect(await screen.findByText(/session no longer has access/i)).toBeTruthy();
    expect(screen.queryByText("We're having trouble connecting")).toBeNull();
    expect(screen.queryByText("Catalyst couldn't complete that request")).toBeNull();
  });
});
