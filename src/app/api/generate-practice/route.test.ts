import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/src/library/verifyAuth", () => ({ verifyRequestAuth: vi.fn() }));
vi.mock("@/src/library/ollamaClient", () => ({ resolveOllamaBaseUrl: vi.fn(async () => "http://ollama.test") }));
vi.mock("@/src/library/documentTextCache", () => ({ getDocumentText: vi.fn() }));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: { doc: () => ({ get: async () => ({ data: () => undefined }) }) } }));
vi.mock("@/src/library/practice/generation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/practice/generation")>()),
  generatePractice: vi.fn(),
}));

import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getDocumentText } from "@/src/library/documentTextCache";
import { generatePractice } from "@/src/library/practice/generation";
import { POST } from "./route";

const TEXT = "Differentiate composite functions with the chain rule. ".repeat(10);

let uid = 0;
function nextUid() {
  uid += 1;
  return `p${uid}`;
}

function post(body: unknown) {
  return POST({ json: async () => body } as unknown as NextRequest);
}

describe("POST /api/generate-practice", () => {
  let owner = "";

  beforeEach(() => {
    vi.clearAllMocks();
    owner = nextUid();
    vi.mocked(verifyRequestAuth).mockResolvedValue({ uid: owner } as Awaited<ReturnType<typeof verifyRequestAuth>>);
    vi.mocked(getDocumentText).mockResolvedValue(TEXT);
    vi.mocked(generatePractice).mockResolvedValue({ topicName: "Derivatives", items: [] });
  });

  function body(overrides: Record<string, unknown> = {}) {
    return {
      docUrl: `/api/download?key=users/${owner}/lecture.pdf`,
      docName: "Lecture.pdf",
      kind: "fill_blank",
      count: 6,
      ...overrides,
    };
  }

  it("forwards a concept focus to the generator", async () => {
    const focus = { quotas: [{ conceptKey: "chain rule", label: "Chain Rule", items: 6 }], avoid: ["Old question?"] };
    const response = await post(body({ focus }));

    expect(response.status).toBe(200);
    expect(vi.mocked(generatePractice).mock.calls[0][0].focus).toEqual(focus);
  });

  it("generates unfocused when the focus is malformed or missing", async () => {
    await post(body({ focus: { quotas: [{ label: "No key", items: 2 }] } }));
    await post(body());

    expect(vi.mocked(generatePractice).mock.calls[0][0].focus).toBeUndefined();
    expect(vi.mocked(generatePractice).mock.calls[1][0].focus).toBeUndefined();
  });
});
