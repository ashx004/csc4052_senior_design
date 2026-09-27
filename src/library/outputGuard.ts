// Last line of defense between the model and the student, for the three
// kinds of fabrication that were confirmed live in chat testing and that no
// amount of prompting fully stopped:
//
//   - links the model made up (a "/download/..." path that 404'd, invented
//     Canvas/Blackboard URLs) - only URLs that actually appeared in a tool
//     result, the student's own context, or their message are kept;
//   - contact details garbled while copying ("man kimin@LATech.edu" for
//     mankimin@LATech.edu) - emails must match one on file, and a mangled
//     copy of a real one is repaired;
//   - internal Firestore IDs leaking into the text ("course ID `K6Ps...`").
//
// This is the "verify, don't trust" step production assistants put after
// generation (grounding / citation checks): the prompt asks for good
// behaviour, this makes the worst failures impossible to show.

export interface GuardFacts {
  /** URLs the reply may contain (tool results, generated files, the student's own messages). */
  urls: Iterable<string>;
  /** Email addresses on file (instructors, the student) or seen in tool results. */
  emails: Iterable<string>;
  /** Internal IDs -> what to show instead ("" to drop). */
  ids: Map<string, string>;
}

const URL_PATTERN = /https?:\/\/[^\s<>()\[\]"'`]+[^\s<>()\[\]"'`.,;:!?]/g;
const RELATIVE_URL_PATTERN = /(?:^|(?<=\())\/[A-Za-z0-9_\-/.%?=&]+/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MARKDOWN_LINK = /\[([^\]\n]{0,300})\]\(\s*([^)\s]+)\s*\)/g;

export function collectUrls(text: string): string[] {
  return [...(text.match(URL_PATTERN) ?? []), ...(text.match(RELATIVE_URL_PATTERN) ?? [])];
}
export function collectEmails(text: string): string[] {
  return text.match(EMAIL_PATTERN) ?? [];
}

const normalizeUrl = (u: string) => u.trim().replace(/[)\].,;:!?'"]+$/, "").replace(/\/$/, "").toLowerCase();

// Internal tool names in a reply mean nothing to a student ("review them
// with `list_notes`", confirmed live despite the prompt rule): say it in
// the app's own words instead.
const TOOL_WORDS: Record<string, string> = {
  list_notes: "the Notes tab",
  read_note: "the note",
  create_note: "a new note",
  edit_note: "the note",
  organize_notes: "your notebooks",
  delete_note: "the note",
  list_calendar_events: "your calendar",
  create_calendar_event: "your calendar",
  update_calendar_event: "your calendar",
  delete_calendar_event: "your calendar",
  read_document: "your class files",
  search_documents: "your class files",
  create_quiz: "a quiz",
  create_flashcards: "flashcards",
  create_pdf: "a PDF",
  list_enrolled_classes: "your classes",
  get_course_details: "your class details",
  update_course_details: "your class details",
  list_study_sets: "your study sets",
  get_course_confidence: "your progress",
  set_self_confidence: "your confidence rating",
  web_search: "a web search",
  search_youtube: "YouTube",
  recall_past_chat: "your past chats",
  load_tools: "",
};
const TOOL_NAME = new RegExp(`\`?\\b(${Object.keys(TOOL_WORDS).join("|")})\\b(\\(\\))?\`?`, "g");

export class OutputGuard {
  private urls: Set<string>;
  private emails: Map<string, string>; // lowercase -> as on file
  private ids: Map<string, string>;

  constructor(facts: GuardFacts) {
    this.urls = new Set([...facts.urls].map(normalizeUrl));
    this.emails = new Map([...facts.emails].map((e) => [e.toLowerCase(), e]));
    this.ids = facts.ids;
  }

  // Everything tools returned this turn, normalised, for checking quotes.
  private corpus = "";

  /** Learn more allowed facts mid-turn (each tool result as it arrives). */
  allowFrom(text: string) {
    this.corpus += ` ${normalizeForQuote(text)}`;
    collectUrls(text).forEach((u) => this.urls.add(normalizeUrl(u)));
    collectEmails(text).forEach((e) => this.emails.set(e.toLowerCase(), e));
  }

  /** Hide an ID first seen mid-turn (e.g. calendar event ids from a listing). */
  hideId(id: string, label = "") {
    if (id.length >= 12 && !this.ids.has(id)) this.ids.set(id, label);
  }

  private urlAllowed(url: string): boolean {
    const n = normalizeUrl(url);
    if (this.urls.has(n)) return true;
    // Same page with a trailing slash/fragment difference, or a link to a
    // domain the student (or a tool) already put in play.
    for (const allowed of this.urls) if (allowed.startsWith(n) || n.startsWith(allowed + "#")) return true;
    return false;
  }

  /** Clean one complete piece of text (see StreamingGuard for streams). */
  clean(text: string): string {
    let out = text;

    // Internal IDs, including the "(course ID `abc`)" wrapper they arrive in.
    for (const [id, label] of this.ids) {
      if (!id || !out.includes(id)) continue;
      const wrapped = new RegExp(`\\s*\\(?\\s*(?:course|resource|document|event|class)?\\s*_?id\\s*[:=]?\\s*\`?${escapeRegExp(id)}\`?\\s*\\)?`, "gi");
      out = out.replace(wrapped, "");
      out = out.split(id).join(label);
    }

    out = out.replace(TOOL_NAME, (_whole, name: string) => TOOL_WORDS[name]);

    // Links: keep the words, drop an address nobody gave us.
    out = out.replace(MARKDOWN_LINK, (whole, label: string, url: string) => {
      // "#" goes nowhere (seen live: "[Study Flashcards](#)"); a mailto is
      // only kept for an address on file.
      if (/^mailto:/i.test(url)) return this.emails.has(url.slice(7).toLowerCase()) ? whole : label;
      if (url.startsWith("#")) return label;
      return this.urlAllowed(url) ? whole : label;
    });
    out = out.replace(URL_PATTERN, (url) => (this.urlAllowed(url) ? url : "\u0000"));
    // Tidy only where an address was removed (never elsewhere - code blocks
    // depend on their exact spacing): "Canvas (<url>)" -> "Canvas".
    out = out.replace(/\s?\(\s*\u0000\s*\)|\s?<\u0000>|\s?\u0000/g, "");

    // Emails: keep ones on file, repair a mangled copy of one, drop the rest.
    out = out.replace(new RegExp(`(\\b[A-Za-z0-9._%+-]{1,20}\\s)?(${EMAIL_PATTERN.source})`, "g"), (whole, before: string | undefined, email: string, offset: number, all: string) => {
      const lower = email.toLowerCase();
      // "a valid address, like jdoe@latech.edu" is an illustration, not a claim.
      if (/\b(like|e\.g\.?|such as|for example|format)[\s:,`*"']*$/i.test(all.slice(Math.max(0, offset - 30), offset + (before?.length ?? 0)))) return whole;
      if (this.emails.has(lower)) return whole;
      // Reserved example domains (RFC 2606) are illustrations, not claims.
      if (/@(example\.(com|org|net|edu)|.*\.example)$/i.test(lower)) return whole;
      if (before) {
        const joined = (before.trim() + email).toLowerCase();
        if (this.emails.has(joined)) return this.emails.get(joined)!;
      }
      for (const [known, original] of this.emails) {
        if (known.endsWith(lower) || lower.endsWith(known)) return `${before ?? ""}${original}`;
      }
      return `${before ?? ""}(email not on file)`;
    });

    // Quotes: a blockquote, or a long "quoted passage", must really appear
    // in something a tool returned - otherwise it's a paraphrase dressed up
    // as the source's words (seen live: "Here's the key excerpt: > ..." that
    // wasn't in the document). The words stay; the quotation styling goes.
    out = out.replace(/^(\s*)>\s?(.+)$/gm, (whole, indent: string, body: string) => (this.quoteIsReal(body) ? whole : `${indent}${body}`));
    out = this.checkInlineQuotes(out);
    return out;
  }

  // Pairs quote marks in order along each line (1st with 2nd, 3rd with 4th).
  // A regex scan paired the closing quote of one short title with the
  // opening quote of the next ("A" ... "B") and mangled both - seen live.
  private checkInlineQuotes(text: string): string {
    return text
      .split("\n")
      .map((line) => {
        const marks: number[] = [];
        for (let i = 0; i < line.length; i++) if (line[i] === '"' || line[i] === "“" || line[i] === "”") marks.push(i);
        if (marks.length < 2) return line;
        const drop = new Set<number>();
        for (let k = 0; k + 1 < marks.length; k += 2) {
          const body = line.slice(marks[k] + 1, marks[k + 1]);
          if (body.length >= 60 && body.length <= 400 && !this.quoteIsReal(body)) {
            drop.add(marks[k]);
            drop.add(marks[k + 1]);
          }
        }
        return drop.size ? [...line].filter((_, i) => !drop.has(i)).join("") : line;
      })
      .join("\n");
  }

  private quoteIsReal(body: string): boolean {
    const text = normalizeForQuote(body.replace(/^[*_]+|[*_]+$/g, ""));
    if (text.length < 25) return true; // short phrases aren't worth second-guessing
    if (this.corpus.includes(text)) return true;
    // Allow small extraction differences: 85% of its 6-word runs must appear.
    const words = text.split(" ");
    if (words.length < 8) return false;
    let hits = 0;
    let total = 0;
    for (let i = 0; i + 6 <= words.length; i++, total++) if (this.corpus.includes(words.slice(i, i + 6).join(" "))) hits++;
    return total > 0 && hits / total >= 0.85;
  }
}

function normalizeForQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Applies an OutputGuard to streamed text. Holds back the unfinished tail
 * (a word, link, or email can arrive split across chunks) and releases text
 * once it can't change any more.
 */
const HELD_WORDS = 4;

export class StreamingGuard {
  private buffer = "";
  constructor(private guard: OutputGuard, private emit: (text: string) => void) {}

  push(chunk: string) {
    this.buffer += chunk;
    // The unfinished tail plus HELD_WORDS whole words stay held, so a
    // "(course ID: `abc`)" wrapper or "man kimin@x.edu" is always cleaned whole.
    const spaces: number[] = [];
    let i = this.buffer.length - 1;
    while (i >= 0 && /\s/.test(this.buffer[i])) i--; // a trailing space isn't a word
    for (; i >= 0 && spaces.length < HELD_WORDS + 2; i--) if (/\s/.test(this.buffer[i]) && !/\s/.test(this.buffer[i + 1])) spaces.push(i);
    if (spaces.length < HELD_WORDS + 1) return;
    let cut = spaces[HELD_WORDS];
    // The word before an email may be a split-off piece of it - hold it too.
    if (/^\S*@/.test(this.buffer.slice(cut + 1))) cut = spaces.length > HELD_WORDS + 1 ? spaces[HELD_WORDS + 1] : -1;
    // Don't split a markdown link or a "(course ID: `abc`)" wrapper: hold
    // from an unclosed "[" or "(" until it closes (bounded, so a stray
    // bracket can't stall the stream).
    // The cut may not fall between a bracket and its closing partner.
    for (const [openCh, closeCh] of [["[", ")"], ["(", ")"]]) {
      const open = this.buffer.lastIndexOf(openCh, cut);
      if (open < 0 || cut - open > 400) continue;
      const close = this.buffer.indexOf(closeCh, open);
      if (close < 0 || close > cut) cut = Math.min(cut, open - 1);
    }
    // A blockquote line is checked whole, so hold an unfinished one.
    const lineStart = this.buffer.lastIndexOf("\n", cut) + 1;
    if (/^\s*>/.test(this.buffer.slice(lineStart)) && this.buffer.indexOf("\n", lineStart) < 0) cut = lineStart - 1;
    if (cut < 0) return;
    const ready = this.buffer.slice(0, cut + 1);
    this.buffer = this.buffer.slice(cut + 1);
    if (ready) this.send(this.guard.clean(ready));
  }

  private lastChar = "";
  private send(text: string) {
    // A removal at the start of a piece leaves its leading space next to the
    // previous piece's trailing one.
    const out = this.lastChar === " " ? text.replace(/^ +/, "") : text;
    if (!out) return;
    this.lastChar = out[out.length - 1];
    this.emit(out);
  }

  flush() {
    if (this.buffer) this.send(this.guard.clean(this.buffer));
    this.buffer = "";
  }
}
