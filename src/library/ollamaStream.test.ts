import { describe, expect, it, vi } from "vitest";
import { readOllamaChatStream } from "./ollamaStream";

function stream(parts: string[]) {
  return new ReadableStream<Uint8Array>({ start(c) { for (const part of parts) c.enqueue(new TextEncoder().encode(part)); c.close(); } });
}
const line = (v: unknown) => JSON.stringify(v) + "\n";
describe("Ollama streaming protocol", () => {
  it("reassembles split packets and consumes a final packet without newline", async () => {
    const s = line({ message: { content: "Hello" } }) + JSON.stringify({ done: true, message: { content: " world" } });
    const delta = vi.fn(); const result = await readOllamaChatStream(stream([s.slice(0, 11), s.slice(11)]), delta);
    expect(result.content).toBe("Hello world"); expect(delta).toHaveBeenCalledTimes(2);
    expect(result.rawMessage.content).toBe("Hello world");
  });
  it("keeps multiple calls when the final message is empty", async () => {
    const call = (index: number, name: string) => ({ function: { index, name, arguments: {} } });
    const result = await readOllamaChatStream(stream([
      line({ message: { tool_calls: [call(0, "list_notes")] } }),
      line({ message: { tool_calls: [call(1, "list_calendar_events")] } }),
      line({ done: true, message: { content: "" } }),
    ]), vi.fn());
    expect(result.toolCalls?.map((t) => t.function.name)).toEqual(["list_notes", "list_calendar_events"]);
    expect(result.rawMessage.tool_calls).toEqual(result.toolCalls);
  });
  it("does not duplicate a call repeated in a final packet", async () => {
    const call = { function: { index: 0, name: "read_document", arguments: {} } };
    const result = await readOllamaChatStream(stream([line({ message: { tool_calls: [call] } }), line({ done: true, message: { tool_calls: [call] } })]), vi.fn());
    expect(result.toolCalls).toHaveLength(1);
  });
  it.each([
    [line({ message: { content: "Partial" } }), "before the response was complete"],
    [line({ error: "model unavailable" }), "model unavailable"],
    ["{broken}\n", "JSON"],
    [line({ done: true, done_reason: "length" }), "output limit"],
  ])("reports broken streams instead of reporting success", async (data, error) => {
    await expect(readOllamaChatStream(stream([data]), vi.fn())).rejects.toThrow(error);
  });
  it("never streams reasoning as answer content", async () => {
    const onDelta = vi.fn();
    await readOllamaChatStream(stream([line({ message: { thinking: "private reasoning" } }), line({ done: true, message: { content: "Answer" } })]), onDelta);
    expect(onDelta.mock.calls).toEqual([["Answer"]]);
  });
});
