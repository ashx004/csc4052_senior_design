// Relays the main model's reasoning to the browser while a reply is being
// worked out, so the student can see what the assistant is thinking about.
//
// Two things reach the client:
//   {"type":"thinking","text":"..."}          raw reasoning, in small batches
//   {"type":"thought_summary","text":"..."}   one short friendly line, written
//                                             by a small model every few seconds
//
// The summary is optional: with no summarizer (or when it is slow or fails)
// the client falls back to the last sentence of the raw reasoning.

import { StreamingGuard, type OutputGuard } from "./outputGuard";

export interface ThoughtRelayOptions {
  send: (event: { type: "thinking" | "thought_summary"; text: string }) => void;
  /** Turns recent reasoning into one short status line. Null or a throw means "no summary this time". */
  summarize?: (recentThoughts: string) => Promise<string | null>;
  now?: () => number;
  /** Most reasoning characters forwarded per turn; the rest is dropped. */
  maxChars?: number;
  /** Send a batch once this many characters are waiting... */
  flushChars?: number;
  /** ...or this long has passed since the last batch. */
  flushMs?: number;
  summaryMinNewChars?: number;
  summaryMinIntervalMs?: number;
  /** How much of the latest reasoning the summarizer sees. */
  summaryWindowChars?: number;
}

export interface ThoughtRelay {
  push(text: string): void;
  /** Send anything waiting now (a model round just finished). */
  flush(): void;
  /** Flush and stop: nothing more is sent, including late summaries. Call when the turn ends. */
  end(): void;
}

export function createThoughtRelay(options: ThoughtRelayOptions): ThoughtRelay {
  const now = options.now ?? Date.now;
  const maxChars = options.maxChars ?? 20_000;
  const flushChars = options.flushChars ?? 60;
  const flushMs = options.flushMs ?? 150;
  const minNew = options.summaryMinNewChars ?? 400;
  const minInterval = options.summaryMinIntervalMs ?? 4_000;
  const windowChars = options.summaryWindowChars ?? 1_800;

  let pending = "";
  let sent = 0;
  let lastFlush = now();
  let tail = "";
  let sinceSummary = 0;
  let lastSummaryAt = -Infinity;
  let summarizing = false;
  let ended = false;

  function flush() {
    if (!pending) return;
    options.send({ type: "thinking", text: pending });
    pending = "";
    lastFlush = now();
  }

  function maybeSummarize() {
    if (!options.summarize || summarizing || ended) return;
    if (sinceSummary < minNew || now() - lastSummaryAt < minInterval) return;
    summarizing = true;
    sinceSummary = 0;
    lastSummaryAt = now();
    const recent = tail.slice(-windowChars);
    options.summarize(recent).then(
      (line) => {
        summarizing = false;
        const clean = line?.trim();
        if (clean && !ended) options.send({ type: "thought_summary", text: clean });
      },
      () => {
        summarizing = false;
      }
    );
  }

  return {
    push(text: string) {
      if (ended || !text) return;
      tail = (tail + text).slice(-windowChars * 2);
      sinceSummary += text.length;
      if (sent < maxChars) {
        const room = maxChars - sent;
        const piece = text.length > room ? text.slice(0, room) : text;
        pending += piece;
        sent += piece.length;
      }
      if (pending.length >= flushChars || now() - lastFlush >= flushMs) flush();
      maybeSummarize();
    },
    flush,
    end() {
      flush();
      ended = true;
    },
  };
}

/**
 * A thought relay whose output passes through the same OutputGuard as the
 * reply itself. The model's reasoning quotes tool results, internal IDs and
 * tool names freely, none of which a student should see; the guard hides IDs,
 * unverified links and emails, and swaps tool function names for plain words.
 * Reasoning arrives in pieces, so it goes through a StreamingGuard (an ID can
 * be split across two pieces).
 */
export function createGuardedThoughtRelay(options: ThoughtRelayOptions, guard: OutputGuard): ThoughtRelay {
  const thinking = new StreamingGuard(guard, (text) => options.send({ type: "thinking", text }));
  const relay = createThoughtRelay({
    ...options,
    send(event) {
      if (event.type === "thinking") {
        thinking.push(event.text);
        return;
      }
      const clean = guard.clean(event.text).trim();
      if (clean) options.send({ type: "thought_summary", text: clean });
    },
  });
  return {
    push: (text) => relay.push(text),
    flush() {
      relay.flush();
      thinking.flush();
    },
    end() {
      relay.end();
      thinking.flush();
    },
  };
}
