import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: {} }));
const wallet = vi.hoisted(() => ({ refundFailedWork: vi.fn<(uid: string, micros: number, feature: string) => Promise<void>>(async () => {}) }));
vi.mock("./wallet", async () => ({ ...(await vi.importActual<object>("./wallet")), ...wallet }));

import { refundOnFailure } from "./refundOnFailure";
import { currentAiScope, enterAiUser } from "@/src/library/ai/usageScope";

// Stands in for a route: identifies the student, "spends" like aiFetch does, then answers.
const route = (status: number, spent = 1234) =>
  refundOnFailure("quiz-generation", async () => {
    enterAiUser("student-1");
    const spend = currentAiScope().spend!;
    spend.micros += spent;
    spend.uid ??= "student-1";
    return new Response("{}", { status });
  });

afterEach(() => {
  delete process.env.BILLING_MODE;
  wallet.refundFailedWork.mockClear();
});

describe("refundOnFailure", () => {
  it("gives back what a request spent when it fails on our side", async () => {
    process.env.BILLING_MODE = "enforce";
    expect((await route(502)()).status).toBe(502);
    expect(wallet.refundFailedWork).toHaveBeenCalledWith("student-1", 1234, "quiz-generation");
  });

  it("keeps the charge when the task succeeded or the request was the student's mistake", async () => {
    process.env.BILLING_MODE = "enforce";
    await route(200)();
    await route(400)();
    expect(wallet.refundFailedWork).not.toHaveBeenCalled();
  });

  it("does nothing in the dry run, where nobody was charged", async () => {
    process.env.BILLING_MODE = "log";
    await route(500)();
    expect(wallet.refundFailedWork).not.toHaveBeenCalled();
  });

  it("keeps each request's spend separate", async () => {
    process.env.BILLING_MODE = "enforce";
    await Promise.all([route(500, 100)(), route(500, 200)()]);
    expect(wallet.refundFailedWork.mock.calls.map((c) => c[1]).sort()).toEqual([100, 200]);
  });
});
