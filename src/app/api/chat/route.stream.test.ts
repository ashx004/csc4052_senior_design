import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Exercises the real POST /api/chat handler against a fake Ollama server, to
// pin down what the browser relies on: reasoning is forwarded live, tool calls
// are announced (with a safe detail) and finished, and pressing Stop cancels the
// request to the model and still ends the stream with the partial reply.
// Only sign-in is stubbed; everything else in the route runs for real.

vi.mock("@/src/library/verifyAuth", () => ({ verifyRequestAuth: async () => ({ uid: "test-user" }) }));
vi.mock("@/src/library/billing/creditGate", () => ({ aiCreditGate: async () => null }));

// The student's learning profile is also read from Firestore; give it an empty one.
vi.mock("@/src/library/studentProfile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/studentProfile")>()),
  getStudentProfile: async () => ({ summary: "", messageCount: 0 }),
  maybeUpdateStudentProfile: async () => {},
}));

// Saved chats live in Firestore; record what the route writes instead of calling it.
const fs = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), update: vi.fn(), del: vi.fn() }));
vi.mock("@/src/library/firestoreRest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/firestoreRest")>()),
  firestoreCreate: fs.create,
  firestoreGet: fs.get,
  firestoreUpdate: fs.update,
  firestoreDelete: fs.del,
}));

type Script = (req: IncomingMessage, res: ServerResponse, call: number) => void;

let server: Server;
let script: Script = () => {};
let chatCalls = 0;
let lastChatClosed: Promise<void> = Promise.resolve();

const line = (res: ServerResponse, obj: unknown) => res.write(JSON.stringify(obj) + "\n");

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith("/api/chat")) {
      chatCalls += 1;
      const call = chatCalls;
      lastChatClosed = new Promise((resolve) => res.on("close", resolve));
      req.resume();
      req.on("end", () => script(req, res, call));
      return;
    }
    // /api/tags (reachability probe) and /api/ps (is the model loaded) just need to answer.
    res.setHeader("Content-Type", "application/json");
    res.end(req.url?.startsWith("/api/ps") ? JSON.stringify({ models: [{ name: "fake-model" }] }) : JSON.stringify({ models: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.OLLAMA_PRIMARY_URL = `http://127.0.0.1:${port}`;
  // The route pulls in the browser Firebase module, which won't initialize without a key (never contacted here).
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-key";
  process.env.OLLAMA_PRIMARY_FALLBACK_URL = "";
  process.env.OLLAMA_AUTH_TOKEN = "test";
  process.env.OLLAMA_MODEL_MAIN = "fake-model";
  process.env.OLLAMA_THINK_CHAT = "on";
  // No small summarizer configured: the browser falls back to the raw reasoning.
  delete process.env.OLLAMA_SECONDARY_URL;
  delete process.env.OLLAMA_THOUGHT_SUMMARY_MODEL;
  delete process.env.OLLAMA_CLARIFIER_MODEL;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  chatCalls = 0;
  script = () => {};
  fs.create.mockReset().mockResolvedValue("sess-new");
  fs.get.mockReset().mockResolvedValue(null);
  fs.update.mockReset().mockResolvedValue(true);
  fs.del.mockReset().mockResolvedValue(true);
});

function chatRequest(runId: string | undefined, text = "Which classes am I taking?") {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: text }],
      context: { userId: "test-user", email: "t@example.com", classes: [] },
      ephemeral: true,
      ...(runId ? { runId } : {}),
    }),
  });
}

type Event = { type: string; [key: string]: unknown };

async function* events(response: Response): AsyncGenerator<Event> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) yield JSON.parse(l) as Event;
  }
}

async function collect(response: Response): Promise<Event[]> {
  const out: Event[] = [];
  for await (const e of events(response)) out.push(e);
  return out;
}

describe("POST /api/chat live activity", () => {
  it("streams reasoning, announces a tool call and its result, then the answer", async () => {
    script = (_req, res, call) => {
      res.setHeader("Content-Type", "application/x-ndjson");
      if (call === 1) {
        line(res, { message: { role: "assistant", thinking: "The student wants their classes. " } });
        line(res, { message: { role: "assistant", thinking: "I should look them up." } });
        line(res, { message: { role: "assistant", content: "", tool_calls: [{ function: { name: "list_enrolled_classes", arguments: {} } }] } });
        line(res, { done: true, done_reason: "stop", message: { role: "assistant", content: "" } });
      } else {
        line(res, { message: { role: "assistant", thinking: "No classes came back." } });
        line(res, { message: { role: "assistant", content: "You aren't enrolled in any classes yet." } });
        line(res, { done: true, done_reason: "stop", message: { role: "assistant", content: "" } });
      }
      res.end();
    };

    const { POST } = await import("./route");
    const response = await POST(chatRequest("run-live-0001"));
    const seen = await collect(response);
    const types = seen.map((e) => e.type);

    // Reasoning arrives as it is written, from both model rounds.
    const thoughts = seen.filter((e) => e.type === "thinking").map((e) => e.text).join("");
    expect(thoughts).toContain("The student wants their classes.");
    expect(thoughts).toContain("No classes came back.");

    // The tool is announced, then finished, in that order, before the answer.
    const toolIndex = types.indexOf("tool");
    const doneIndex = types.indexOf("tool_done");
    expect(toolIndex).toBeGreaterThan(-1);
    expect(doneIndex).toBeGreaterThan(toolIndex);
    expect(seen[toolIndex]).toMatchObject({ type: "tool", name: "list_enrolled_classes" });
    expect(seen[doneIndex]).toMatchObject({ type: "tool_done", name: "list_enrolled_classes", ok: true });

    const answer = seen.filter((e) => e.type === "delta").map((e) => e.text).join("");
    expect(answer).toContain("aren't enrolled");
    expect(types.indexOf("delta")).toBeGreaterThan(doneIndex);
    expect(types).toContain("done");
    expect(types).not.toContain("error");
    expect(types).not.toContain("stopped");
    // Reasoning is never mixed into the answer text.
    expect(answer).not.toContain("student wants");
  });

  it("works without a runId (older clients) and without reasoning", async () => {
    script = (_req, res) => {
      res.setHeader("Content-Type", "application/x-ndjson");
      line(res, { message: { role: "assistant", content: "Hello there." } });
      line(res, { done: true, done_reason: "stop", message: { role: "assistant", content: "" } });
      res.end();
    };
    const { POST } = await import("./route");
    const seen = await collect(await POST(chatRequest(undefined, "hi")));
    expect(seen.filter((e) => e.type === "delta").map((e) => e.text).join("")).toContain("Hello there.");
    expect(seen.some((e) => e.type === "thinking")).toBe(false);
    expect(seen.at(-1)?.type).toBe("done");
  });
});

describe("POST /api/chat Stop", () => {
  it("cancels the model request, keeps the partial reply, and ends the stream cleanly", async () => {
    let released = false;
    script = (_req, res) => {
      res.setHeader("Content-Type", "application/x-ndjson");
      line(res, { message: { role: "assistant", thinking: "Working through this carefully. " } });
      // A long reply that would take many seconds if it were left to finish.
      let n = 0;
      const timer = setInterval(() => {
        if (res.writableEnded || res.destroyed) return clearInterval(timer);
        n += 1;
        line(res, { message: { role: "assistant", content: `word${n} ` } });
        if (n >= 400) {
          released = true;
          line(res, { done: true, done_reason: "stop", message: { role: "assistant", content: "" } });
          res.end();
          clearInterval(timer);
        }
      }, 20);
      res.on("close", () => clearInterval(timer));
    };

    const { stopChatRun } = await import("@/src/library/chatRuns");
    const { POST } = await import("./route");
    const startedAt = Date.now();
    const response = await POST(chatRequest("run-stop-0001"));

    const seen: Event[] = [];
    let stoppedAt = 0;
    for await (const e of events(response)) {
      seen.push(e);
      // Once a few words of the reply exist, press Stop.
      if (!stoppedAt && seen.filter((x) => x.type === "delta").length >= 3) {
        stoppedAt = Date.now();
        expect(stopChatRun("test-user", "run-stop-0001")).toBe(true);
      }
    }

    const types = seen.map((e) => e.type);
    expect(types).toContain("stopped");
    expect(types.at(-1)).toBe("done");
    expect(types).not.toContain("error");
    expect(released).toBe(false); // the fake model never got to finish: its request was cancelled
    await lastChatClosed; // ...and its connection was closed by the server
    // The whole thing wrapped up shortly after Stop, far sooner than the 8s the reply needed.
    expect(Date.now() - stoppedAt).toBeLessThan(2000);
    expect(Date.now() - startedAt).toBeLessThan(5000);
    // What was written before Stop is what the student saw.
    expect(seen.filter((e) => e.type === "delta").map((e) => e.text).join("")).toContain("word1");
  });

  it("stopping a run that already finished is harmless", async () => {
    const { stopChatRun } = await import("@/src/library/chatRuns");
    script = (_req, res) => {
      res.setHeader("Content-Type", "application/x-ndjson");
      line(res, { message: { role: "assistant", content: "Quick answer." } });
      line(res, { done: true, done_reason: "stop", message: { role: "assistant", content: "" } });
      res.end();
    };
    const { POST } = await import("./route");
    await collect(await POST(chatRequest("run-done-00001")));
    expect(stopChatRun("test-user", "run-done-00001")).toBe(false);
  });

  it("only the student's own run can be stopped", async () => {
    const { registerChatRun, stopChatRun } = await import("@/src/library/chatRuns");
    const controller = registerChatRun("someone-else", "run-theirs-0001");
    expect(stopChatRun("test-user", "run-theirs-0001")).toBe(false);
    expect(controller.signal.aborted).toBe(false);
  });
});

// A saved (non-ephemeral) chat: the route writes the question and an empty reply
// up front, and a stopped turn with nothing written is taken back out again.
function savedChatRequest(runId: string, extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Explain mitosis" }],
      context: { userId: "test-user", email: "t@example.com", classes: [] },
      runId,
      ...extra,
    }),
  });
}

/** A model that reasons for a long while without ever writing an answer. */
const onlyThinking: Script = (_req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  line(res, { message: { role: "assistant", thinking: "Let me think about this. " } });
  const timer = setInterval(() => line(res, { message: { role: "assistant", thinking: "Still thinking. " } }), 20);
  res.on("close", () => clearInterval(timer));
};

async function stopOnceThinking(response: Response, runId: string): Promise<Event[]> {
  const { stopChatRun } = await import("@/src/library/chatRuns");
  const seen: Event[] = [];
  let pressed = false;
  for await (const e of events(response)) {
    seen.push(e);
    if (!pressed && e.type === "thinking") {
      pressed = true;
      expect(stopChatRun("test-user", runId)).toBe(true);
    }
  }
  return seen;
}

describe("POST /api/chat Stop before any answer", () => {
  it("removes the turn from a brand-new chat, deleting the chat that held only it", async () => {
    script = onlyThinking;
    const { POST } = await import("./route");
    const seen = await stopOnceThinking(await POST(savedChatRequest("run-discard-01")), "run-discard-01");

    expect(seen.find((e) => e.type === "stopped")).toMatchObject({ type: "stopped", discarded: true });
    expect(seen.map((e) => e.type)).not.toContain("error");
    expect(fs.create).toHaveBeenCalledTimes(1); // the chat was created when the question arrived...
    await vi.waitFor(() => expect(fs.del).toHaveBeenCalledWith("test-token", "users/test-user/chatSessions", "sess-new")); // ...and is gone again
    // The "(Stopped before the assistant answered.)" placeholder is never saved.
    expect(JSON.stringify(fs.update.mock.calls)).not.toContain("Stopped before");
  });

  it("removes just the stopped question and empty reply from an existing chat", async () => {
    fs.get.mockResolvedValue({
      messages: [
        { id: 1, role: "user", text: "Earlier question" },
        { id: 2, role: "assistant", text: "Earlier answer" },
      ],
    });
    script = onlyThinking;
    const { POST } = await import("./route");
    const seen = await stopOnceThinking(await POST(savedChatRequest("run-discard-02", { currentSessionId: "sess-9" })), "run-discard-02");

    expect(seen.find((e) => e.type === "stopped")).toMatchObject({ discarded: true });
    await vi.waitFor(() => {
      const last = fs.update.mock.calls.at(-1);
      expect(last?.[3]).toMatchObject({ generating: false });
      expect((last?.[3] as { messages: { text: string }[] }).messages.map((m) => m.text)).toEqual(["Earlier question", "Earlier answer"]);
    });
    expect(fs.del).not.toHaveBeenCalled();
  });

  it("keeps a partial reply: the question stays and the reply is saved with its Stopped marker", async () => {
    script = (_req, res) => {
      res.setHeader("Content-Type", "application/x-ndjson");
      const timer = setInterval(() => line(res, { message: { role: "assistant", content: "Mitosis has four phases. " } }), 20);
      res.on("close", () => clearInterval(timer));
    };
    const { stopChatRun } = await import("@/src/library/chatRuns");
    const { POST } = await import("./route");
    const seen: Event[] = [];
    let pressed = false;
    for await (const e of events(await POST(savedChatRequest("run-keep-0001")))) {
      seen.push(e);
      if (!pressed && seen.filter((x) => x.type === "delta").length >= 3) {
        pressed = true;
        stopChatRun("test-user", "run-keep-0001");
      }
    }
    expect(seen.find((e) => e.type === "stopped")).toMatchObject({ discarded: false });
    await vi.waitFor(() => expect(JSON.stringify(fs.update.mock.calls.at(-1))).toContain("_(Stopped)_"));
    expect(fs.del).not.toHaveBeenCalled();
  });
});
