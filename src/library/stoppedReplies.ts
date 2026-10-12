// The Stop button leaves a marker in the reply it cut short. The student sees
// it in their history; the model must not: left in, it would treat "(Stopped)"
// as part of its own earlier answer, and a placeholder with no answer in it
// reads as the assistant having said nothing.

export const STOPPED_MARKER = "_(Stopped)_";
export const STOPPED_BEFORE_ANSWER = "_(Stopped before the assistant answered.)_";

/** What the student's chat shows for a reply that was stopped. */
export function stoppedReplyText(partial: string): string {
  const text = partial.trim();
  return text ? `${text}\n\n${STOPPED_MARKER}` : STOPPED_BEFORE_ANSWER;
}

/**
 * The same messages, as the model should read them. Positions are kept (the
 * running summary counts messages by index), so nothing is removed: a stopped
 * partial reply loses its marker, and an empty one becomes a short note.
 */
export function withoutStopMarkers<T extends { role: string; content: unknown }>(messages: T[]): T[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || typeof message.content !== "string") return message;
    const content = message.content.trim();
    if (content === STOPPED_BEFORE_ANSWER) {
      return { ...message, content: "(The student stopped this reply before it was written; they will probably re-ask.)" };
    }
    if (content.endsWith(STOPPED_MARKER)) {
      const partial = content.slice(0, -STOPPED_MARKER.length).trimEnd();
      return { ...message, content: `${partial}\n\n(This reply was cut short when the student stopped it.)` };
    }
    return message;
  });
}
