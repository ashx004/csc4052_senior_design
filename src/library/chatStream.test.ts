import { describe, expect, it } from "vitest";
import { readChatStream } from "./chatStream";

function streamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + "\n"));
      controller.close();
    },
  });
  return new Response(body);
}

async function collect(response: Response) {
  const events = [];
  for await (const event of readChatStream(response)) events.push(event);
  return events;
}

describe("readChatStream", () => {
  it("parses one event per NDJSON line", async () => {
    const response = streamResponse([
      JSON.stringify({ type: "delta", text: "Hel" }),
      JSON.stringify({ type: "delta", text: "lo" }),
      JSON.stringify({ type: "done", summary: "s", summarizedCount: 1 }),
    ]);
    const events = await collect(response);
    expect(events).toEqual([
      { type: "delta", text: "Hel" },
      { type: "delta", text: "lo" },
      { type: "done", summary: "s", summarizedCount: 1 },
    ]);
  });

  it("skips blank lines", async () => {
    const response = streamResponse(["", JSON.stringify({ type: "delta", text: "x" }), ""]);
    const events = await collect(response);
    expect(events).toEqual([{ type: "delta", text: "x" }]);
  });

  it("skips a malformed line instead of aborting the whole stream", async () => {
    const response = streamResponse(["not json", JSON.stringify({ type: "delta", text: "ok" })]);
    const events = await collect(response);
    expect(events).toEqual([{ type: "delta", text: "ok" }]);
  });

  it("yields nothing when the response has no body", async () => {
    const response = new Response(null);
    const events = await collect(response);
    expect(events).toEqual([]);
  });
});
