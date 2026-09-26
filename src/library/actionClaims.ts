// Catches a reply that says it did something it never did. Confirmed live
// (2026-09-25): asked to "make a note ... and put a review on my calendar",
// the model created only the event, then wrote "I've created your note
// 'Eval radix recap' with this summary: ..." - no note tool ever ran. A
// prompt rule against exactly this was already in place.
//
// The chat route compares each "created / saved / added / deleted" claim in
// the finished reply with the write tools that actually succeeded this
// turn; an unbacked claim gets one corrective round (do it now, or say it
// wasn't done), and a visible correction if that fails too.

export interface ActionKind {
  /** What the student would call it, for the correction message. */
  label: string;
  /** "save the note", for "Want me to ... now?" - its verb also counts as consent. */
  offer: string;
  /** A write tool that makes the claim true. */
  tools: string[];
  /** The student's message asked for this kind of thing. */
  asked: RegExp;
  /** The reply claims it happened. */
  claimed: RegExp;
}

export const ACTION_KINDS: ActionKind[] = [
  {
    label: "the note",
    offer: "save the note",
    tools: ["create_note", "edit_note"],
    asked: /\b(make|create|save|write|put|add|start|jot)\b[^.?!]{0,60}\bnotes?\b|\bnotes?\b[^.?!]{0,40}\b(add|append|save)\b/i,
    claimed: /\b(created|saved|added|made|wrote|put|appended)\b[^.\n]{0,80}\bnotes?\b|\bnotes?\b[^.\n]{0,60}\b((has been|was|is now)\s+)?(created|saved|added|updated)\b/i,
  },
  {
    label: "the calendar event",
    offer: "add the event",
    tools: ["create_calendar_event", "update_calendar_event"],
    asked: /\b(add|put|schedule|book|remind|set up|create|move|reschedule)\b[^.?!]{0,80}\b(calendar|event|reminder|session)\b|\bremind me\b/i,
    claimed: /\b(added|scheduled|created|put|booked|set up|moved|rescheduled)\b[^.\n]{0,80}\b(calendar|event|reminder|session)\b|\bcalendar now (shows|includes|has)\b|\b(event|reminder|session)\b[^.\n]{0,60}\b((has been|is now|was)\s+)?(added|scheduled|created|set|moved)\b/i,
  },
  {
    label: "the quiz",
    offer: "create the quiz",
    tools: ["create_quiz"],
    asked: /\bquiz\b/i,
    claimed: /\b(created|made|generated|built)\b[^.\n]{0,60}\bquiz\b|\bquiz\b[^.\n]{0,60}\b((has been|is now|was)\s+)?(created|generated|made)\b/i,
  },
  {
    label: "the flashcards",
    offer: "create the flashcards",
    tools: ["create_flashcards"],
    asked: /\bflash ?cards?\b/i,
    claimed: /\b(created|made|generated|built)\b[^.\n]{0,60}\bflash ?cards?\b|\bflash ?cards?\b[^.\n]{0,60}\b((have been|are now|were)\s+)?(created|generated|made)\b/i,
  },
  {
    label: "the PDF",
    offer: "create the PDF",
    tools: ["create_pdf"],
    asked: /\b(pdf|study guide|cheat ?sheet|worksheet|practice exam)\b/i,
    claimed: /\b(created|made|generated)\b[^.\n]{0,60}\b(pdf|study guide|cheat ?sheet|worksheet|practice exam)\b/i,
  },
  {
    label: "the deletion",
    offer: "delete it",
    tools: ["delete_calendar_event", "delete_note"],
    asked: /\b(delete|remove|cancel|get rid of)\b/i,
    claimed: /\b(deleted|removed|cancel+ed)\b/i,
  },
  {
    label: "your confidence rating",
    offer: "save your rating",
    tools: ["set_self_confidence"],
    asked: /\b(\d ?\/ ?5|out of (5|five)|confiden\w*|shaky|lost|feel)\b/i,
    claimed: /\b(updated|set|recorded|saved|noted)\b[^.\n]{0,60}\b(confidence|rating)\b|\b(confidence|rating)\b[^.\n]{0,60}\b((has been|is now|was)\s+)?(updated|set|recorded|saved)\b/i,
  },
  {
    label: "the class details",
    offer: "update the class details",
    tools: ["update_course_details"],
    asked: /\b(change|update|fix|correct|moved|set)\b/i,
    claimed: /\b(updated|changed|corrected)\b[^.\n]{0,60}\b(office|email|phone|room|classroom|schedule|meeting time|instructor)\b|\b(office|email|phone|room|classroom|schedule|meeting time)\b[^.\n]{0,60}\b((has been|is now|was)\s+)?(updated|changed|corrected)\b/i,
  },
];

// Sentences that offer, ask, or deny aren't claims.
// "Ready to be deleted - press Confirm" describes a Confirm card, not a done deal.
const NOT_A_CLAIM = /n't\b|\b(not|never|unable|failed|if you|would you|want me|shall i|should i|let me know if|do you want|once you|i can|i could|i'll|confirm|ready to|will be|to be)\b/i;

/** The kinds of action the reply claims but no successful tool backs up.
 *  studentMessage should include the student's previous message too, so a
 *  bare "yes" still counts as asking for what it confirms. */
export function unbackedClaims(reply: string, studentMessage: string, succeededTools: Set<string>): ActionKind[] {
  // "Dr." / "e.g." aren't sentence ends ("I've updated Dr. Cherry's office").
  const unabbreviated = reply.replace(/\b(Dr|Mr|Mrs|Ms|Prof|St|vs|e\.g|i\.e)\./gi, "$1");
  const sentences = unabbreviated.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim() && !NOT_A_CLAIM.test(s));
  return ACTION_KINDS.filter(
    (kind) =>
      kind.asked.test(studentMessage) &&
      !kind.tools.some((t) => succeededTools.has(t)) &&
      sentences.some((s) => kind.claimed.test(s))
  );
}

/** The reply sends the student to a Confirm card ("press Confirm below").
 *  Checked against whether a card really exists - the model has described
 *  one, even drawn "✅ Confirm | ❌ Cancel", without calling the tool. */
export function mentionsConfirmCard(reply: string): boolean {
  return /\b(press|tap|click|hit|select|use)(ing|es|s)?\b[^.\n]{0,25}\bconfirm\b|\bconfirm (below|button|by)\b|\bconfirm to (delete|remove|move|reschedule|update|change|apply|rewrite|replace|proceed)\b|✅\s*\**confirm/i.test(reply);
}

/** Did a tool result report success (as opposed to an error or a refusal)? */
export function toolSucceeded(result: string): boolean {
  return !/^(Error|Not done|Note: you already called)/.test(result.trim());
}

/** Shown when a claimed action still hasn't happened after the corrective round. */
export function correctionFor(kinds: ActionKind[]): string {
  const what = kinds.map((k) => k.label).join(" and ");
  const offer = kinds.map((k) => k.offer).join(" and ");
  return `Correction: ${what} ${kinds.length === 1 ? "wasn't" : "weren't"} actually done yet. Want me to ${offer} now?`;
}

// Unmistakable requests for something to be made. Checked when a reply ends
// without the tool having run - confirmed live: "Make a short PDF study guide
// ..." got the guide pasted into the chat and no PDF. Deliberately strict:
// only plain "make/create ... PDF / quiz / flashcards / note" phrasing.
const REQUESTS: { tools: string[]; offer: string; pattern: RegExp }[] = [
  { tools: ["create_pdf"], offer: "create the PDF", pattern: /\b(make|create|generate|build|export|give me)\b[^.?!\n]{0,60}\bpdf\b|\bas a pdf\b/i },
  { tools: ["create_quiz"], offer: "create the quiz", pattern: /\b(make|create|generate|build)\b[^.?!\n]{0,40}\bquiz\b/i },
  { tools: ["create_flashcards"], offer: "create the flashcards", pattern: /\b(make|create|generate|build)\b[^.?!\n]{0,40}\bflash ?cards?\b/i },
  {
    tools: ["create_note", "edit_note"],
    offer: "save the note",
    pattern: /\b(save|put) (it|this|that|them)? ?(as|to|in(to)?) (a |my )?(new )?notes?\b|\b(make|create|write) (me )?(a|some)\b[^.?!\n]{0,40}\bnotes?\b[^.?!\n]{0,20}\b(called|titled|named)\b/i,
  },
  // Confirmed live: "Rewrite my X note from scratch as ..." got the new text
  // in the chat and no edit at all.
  { tools: ["edit_note"], offer: "rewrite the note", pattern: /\b(rewrite|redo|replace)\b[^.?!\n]{0,40}\bnote\b|\bnote\b[^.?!\n]{0,30}\b(from scratch|rewritten)\b/i },
];

/** Things the student plainly asked to have made that no successful tool made. */
export function unfulfilledRequests(studentMessage: string, succeededTools: Set<string>): { tools: string[]; offer: string }[] {
  return REQUESTS.filter((r) => r.pattern.test(studentMessage) && !r.tools.some((t) => succeededTools.has(t))).map(({ tools, offer }) => ({ tools, offer }));
}
