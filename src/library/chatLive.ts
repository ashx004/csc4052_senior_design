import { toolRunningLabel } from "./toolActivity";

// What the browser shows while a reply is being worked out: the model's
// reasoning (raw and, when available, a one-line summary) plus a list of the
// tools it has used. A pure reducer so both chat surfaces share it and it can
// be tested without React.

export interface LiveTool {
  id: number;
  name: string;
  label: string;
  detail?: string;
  state: "running" | "done" | "failed";
}

export interface LiveActivity {
  /** Raw reasoning so far (only the most recent part is kept). */
  thoughts: string;
  /** A small model's one-line summary of the reasoning, if one has arrived. */
  summary: string;
  tools: LiveTool[];
}

export type LiveEvent =
  | { type: "thinking"; text: string }
  | { type: "thought_summary"; text: string }
  | { type: "tool"; name: string; detail?: string }
  | { type: "tool_done"; name: string; ok: boolean }
  /** The reply started streaming or ended: nothing is still running. */
  | { type: "settle" };

export const EMPTY_ACTIVITY: LiveActivity = { thoughts: "", summary: "", tools: [] };

/** Reasoning can run to thousands of words; the panel only needs the recent part. */
export const MAX_LIVE_THOUGHT_CHARS = 6_000;
const MAX_LIVE_TOOLS = 12;

export function reduceActivity(activity: LiveActivity, event: LiveEvent): LiveActivity {
  switch (event.type) {
    case "thinking": {
      const thoughts = (activity.thoughts + event.text).slice(-MAX_LIVE_THOUGHT_CHARS);
      return { ...activity, thoughts };
    }
    case "thought_summary":
      return { ...activity, summary: event.text };
    case "tool": {
      // Tools run one at a time, so a new one means the previous one finished.
      const settled = activity.tools.map((t) => (t.state === "running" ? { ...t, state: "done" as const } : t));
      activity = { ...activity, tools: settled };
      const next: LiveTool = {
        id: (activity.tools[activity.tools.length - 1]?.id ?? 0) + 1,
        name: event.name,
        label: toolRunningLabel(event.name),
        detail: event.detail,
        state: "running",
      };
      return { ...activity, tools: [...activity.tools, next].slice(-MAX_LIVE_TOOLS) };
    }
    case "settle":
      return activity.tools.some((t) => t.state === "running")
        ? { ...activity, tools: activity.tools.map((t) => (t.state === "running" ? { ...t, state: "done" as const } : t)) }
        : activity;
    case "tool_done": {
      // Tools run one after another, so the oldest still-running call of this name is the one that finished.
      const index = activity.tools.findIndex((t) => t.name === event.name && t.state === "running");
      if (index === -1) return activity;
      const tools = activity.tools.map((t, i) => (i === index ? { ...t, state: event.ok ? ("done" as const) : ("failed" as const) } : t));
      return { ...activity, tools };
    }
  }
}

const SENTENCE_END = /(?<=[.!?])\s+|\n+/;

/**
 * A one-line stand-in for the summary when none has arrived: the latest
 * complete sentence of the reasoning, trimmed. Reasoning is written in the
 * first person ("Let me check..."), which reads fine as a status line.
 */
export function headlineFromThoughts(thoughts: string, maxChars = 110): string {
  const text = thoughts.trim();
  if (!text) return "";
  const parts = text.split(SENTENCE_END).map((p) => p.trim()).filter(Boolean);
  // The last part may still be arriving mid-sentence; prefer the one before it once it exists.
  const endsCleanly = /[.!?]$/.test(text);
  const pick = (endsCleanly ? parts[parts.length - 1] : parts[parts.length - 2] ?? parts[parts.length - 1]) ?? "";
  const clean = pick.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : maxChars).trimEnd()}…`;
}

/** The line to show as the main status: the summary, else the latest thought, else nothing. */
export function currentHeadline(activity: LiveActivity): string {
  return activity.summary || headlineFromThoughts(activity.thoughts);
}
