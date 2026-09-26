type ToolCall = { id?: string; index?: number; function: { name: string; arguments: unknown; index?: number } };
type Packet = { error?: string; done?: boolean; done_reason?: string; eval_count?: number; eval_duration?: number; message?: { content?: string; tool_calls?: ToolCall[] } };

/** Ollama can send tool calls before its final (empty) done packet.
 * Reconstruct the whole assistant message so the next round sees its calls.
 */
export async function readOllamaChatStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  onDone?: (packet: Packet) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let completed = false;
  const calls = new Map<string, ToolCall>();
  function consume(line: string) {
    if (!line.trim()) return;
    const packet: Packet = JSON.parse(line);
    if (packet.error) throw new Error(`AI stream failed: ${packet.error}`);
    const delta = packet.message?.content;
    if (typeof delta === "string" && delta) { content += delta; onDelta(delta); }
    for (const call of packet.message?.tool_calls ?? []) {
      const index = call.index ?? call.function?.index;
      const key = call.id ?? (index !== undefined ? `index:${index}` : JSON.stringify(call));
      calls.set(key, { ...call, id: call.id ?? `call_${calls.has(key) ? [...calls.keys()].indexOf(key) : calls.size}` });
    }
    if (packet.done) {
      if (packet.done_reason === "length") throw new Error("The AI response reached its output limit. Please try a narrower request.");
      completed = true;
      onDone?.(packet);
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consume(line);
    }
    consume(buffer + decoder.decode());
    if (!completed) throw new Error("The AI connection ended before the response was complete. Please try again.");
    const toolCalls = calls.size ? [...calls.values()] : null;
    return { content, toolCalls, rawMessage: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } };
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
