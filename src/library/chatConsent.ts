// Server-side consent for the chat's write tools. The model decides WHEN to
// call a tool, but for anything that changes or removes the student's data
// the server also checks that the student actually asked for it - in this
// message, or by confirming the assistant's question just before it. This is
// the "approval gate" pattern: reads run freely, writes need a real request,
// destructive writes need an explicit one. The model can't talk its way past
// it, because it only reads what the student typed.

export type ConsentKind = "delete" | "edit" | "create";

const DELETE_WORDS = /\b(delete|remove|cancel|get rid of|erase|trash|clear (out|it|them|that)|drop)\b/i;
const EDIT_WORDS =
  /\b(change|update|edit|set|fix|correct|rename|replace|rewrite|modify|move|reschedule|push|postpone|switch|swap|make (it|that|the)|put|add|append|organi[sz]e|file|save|(take|pull|get) .{0,40}\bout\b|out of (its|the|my|a|that) notebook)\b/i;
const CREATE_WORDS = /\b(make|create|generate|write|save|jot|add|put|schedule|book|remind|set up|i (?:need|want|would like))\b/i;
const AFFIRM = /^\s*(y(es|ep|eah|up)?|sure|ok(ay)?|confirm(ed)?|do it|go ahead|please do|yes please|sounds good|that'?s (fine|right|correct)|correct|approved?|proceed)\b/i;

// A mention of an operation is not permission to execute it. These checks
// are deliberately conservative; ambiguous destructive requests are clarified.
const INFORMATION_REQUEST = /^(?:please\s+)?(how (?:do|can|would|could|should|to)|what (?:happens|would happen|does|will)|explain|describe|tell me (?:how|what)|show me how|instructions? (?:for|to)|if (?:i|you|we)|whether|thinking (?:about|of)|considering|might (?:want|need))\b/i;
const SPECULATION = /\b(?:if (?:i|you|we)|thinking (?:about|of)|considering|might (?:want|need))\b/i;
const NEGATION = /\b(?:don['’]?t|do not|never|must not|should not|shouldn['’]?t|cannot|can['’]?t|won['’]?t|wouldn['’]?t|without|avoid|stop|not to|not now|not yet|no thanks|changed my mind|keep (?:it|them|that|the|my))\b/i;

function requestText(text: string): string {
  // Quoted examples/titles and code are data, not an instruction to mutate.
  return text.replace(/```[\s\S]*?```|`[^`]*`|"[^"\n]*"|“[^”\n]*”/g, " ").replace(/’/g, "'");
}

type Message = { role: string; content: unknown };

/** Did the student ask for this kind of change (or just confirm it)? */
export function studentRequested(kind: ConsentKind, messages: Message[]): boolean {
  const users = messages.filter((m) => m.role === "user" && typeof m.content === "string");
  const latest = requestText((users[users.length - 1]?.content as string | undefined) ?? "");
  const words = kind === "delete" ? DELETE_WORDS : kind === "create" ? CREATE_WORDS : EDIT_WORDS;
  if (NEGATION.test(latest) || INFORMATION_REQUEST.test(latest) || SPECULATION.test(latest)) return false;
  if (words.test(latest)) return true;

  // "yes" to the assistant's own "Should I delete ...?" counts - but only if
  // that question and the request before it were about this kind of change.
  if (!AFFIRM.test(latest)) return false;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && typeof m.content === "string");
  const offered = typeof lastAssistant?.content === "string" ? requestText(lastAssistant.content) : "";
  return /\?/.test(offered) && /\b(should i|shall i|want me to|would you like me to|can i|may i|do you want|confirm)\b/i.test(offered) && words.test(offered) && !NEGATION.test(offered);
}

export function consentError(kind: ConsentKind, what: string): string {
  return kind === "delete"
    ? `Not done: removing ${what} can't be undone, and the student hasn't asked for that. Ask them to confirm first (e.g. "Do you want me to delete ${what}?") and only call this again after they say yes.`
    : `Not done: the student hasn't asked to change ${what}. Describe the change you'd make and ask them to confirm first.`;
}
