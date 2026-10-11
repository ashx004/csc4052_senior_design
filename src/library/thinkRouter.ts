// Decides how much the main model should reason about the latest chat
// message. Reasoning is the slow part of a reply (a lookup costs ~230 tokens
// either way; a proof walk-through costs ~1,700), so a cheap heuristic spends
// it only when the question earns it - the same fast-vs-slow idea as the
// two-machine split, applied inside the main model. thinkMode.ts turns the
// tier into the actual Ollama request. Pure and synchronous: no model call.

export type ThinkTier = "fast" | "standard" | "deep";
export type ThinkDecision = { tier: ThinkTier; reason: string };

type Message = { role: string; content: unknown };

const ACK_WORD =
  "(?:hi|hey|hello|yo|thanks|thank you|thx|ty|ok|okay|k|cool|great|nice|awesome|sweet|neat|wow|lol|haha|got it|makes sense|perfect|bye|goodbye|never ?mind|no problem|np|sounds good|all good|alright|you too|good (?:morning|afternoon|evening|night))";
const GREETING_OR_ACK = new RegExp(`^(?:${ACK_WORD}\\b[\\s!.,]*){1,4}$`, "i");

// "yes do it" is not chit-chat: it often triggers a tool call that needs
// correct arguments, so it gets the standard tier.
const CONFIRMATION = /^(yes|yeah|yep|yup|sure|please|do it|go ahead|sounds good|no|nope|nah)\b/i;

const LOOKUP_QUESTION =
  /\b(when|when'?s|whens|wen|where|who|who'?s|which|what time|what day|what date|what (room|building|class|classes|week|year)|how many|how much|what('?s| is| are) (the|my|our)|what does the (syllabus|professor|prof|instructor) say|what'?s on|do i have|have i got)\b|^(is|are|do|does|did|will|am)\b/i;
const LOOKUP_SUBJECT =
  /\b(due( date)?|deadlines?|office hours?|rooms?|buildings?|locations?|e-?mail|phone|professor|prof|instructor|ta|exams?( date)?|midterm|final|meets?|class(es)?|class time|schedule|credits?|syllabus|weights?|worth|late (policy|penalty|work)|textbook|grad(e|es|ing)|attendance|next class|quiz(zes)?|homework|hw|assignments?|project|lab|semester|breaks?|holidays?|points|gpa|open[- ]book|courses?|teach\w*|sections?|taking)\b/i;
const FACT_LOOKUP =
  /\b(stands? for|capital of|what year|who (wrote|invented|discovered|founded))\b/i;

// Anything that asks the model to work something out rather than look it up.
const REASONING_REQUEST =
  /\b(explain|prove|proof|derive|derivation|step[- ]by[- ]step|walk me through|why|how (does|did|come|would)|how (do|should|can) (i|we) (approach|solve|prove|derive|calculate|compute|implement|optimi[sz]e|debug|fix|design|structure|model|test)|compare|contrast|difference between|solve|calculate|compute|debug|analy[sz]e|evaluate|critique|justify|show that|figure out|trade-?offs?|pros and cons|optimi[sz]e|implement|refactor|what if|study plan|work through|reason (about|through)|what (would|will) happen|hints?|segfault|stack ?trace|exceptions?|errors?|bugs?|crash(es|ed)?|not working|doesn'?t work|intuition|understand why|help me (understand|think|figure|work)|(don'?t|do not|doesn'?t|can'?t) (get|understand|see|follow)|confus(ed|ing)|stuck on|what'?s wrong|what is wrong|is (this|that|my|the) (argument|proof|answer|code|solution|reasoning|approach|logic|thesis|essay|query|function) (right|correct|valid|wrong|good|strong|ok|okay|sound)|(check|review|grade|proofread) my|what (caused|causes|led to)|meaning of|write (me )?(a|an|the) (python|java|javascript|js|c\+\+|sql|function|program|script|class|essay|paragraph|code)|approach|best way to|strategy)\b/i;
const REASONING_SUBJECT =
  /\b(integral|derivative|equation|theorem|lemma|algorithm|complexity|big-?o|recurrence|induction|matrix|eigen\w*|probability|proof|polynomial|regex|pseudocode|prime|factor(s|ize|ing)?)\b/i;
const MATH_OR_CODE = /```|[∫∑√≤≥≠∞∂]|\d\s*[+\-*/^=]\s*\d|\d\s*%\s*of\b|\b[a-z]\(x\)|\bO\([^)]*\)/i;

// Doing something (tool calls) rather than just answering; the arguments
// need to be right, so a little reasoning is worth it.
const ACTION_REQUEST = /\b(make|create|generate|add|schedule|reschedule|delete|remove|cancel|update|change|rename|summari[sz]e|quiz me|flash ?cards?|study guide)\b/i;

// "when is the exam and what should I study" is two questions, not a lookup.
const COMPOUND_QUESTION = /\b(and|also|plus)\s+(what|how|when|where|why|who|which|can|should|could)\b|\?\s+\S/i;

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function lastUserText(messages: Message[], skip = 0): string {
  const users = messages.filter((m) => m.role === "user" && typeof m.content === "string");
  return (users[users.length - 1 - skip]?.content as string | undefined) ?? "";
}

function classifyText(text: string): ThinkDecision & { definite: boolean } {
  const t = text.trim();
  if (!t) return { tier: "standard", reason: "empty message", definite: false };
  const words = wordCount(t);

  if (GREETING_OR_ACK.test(t)) return { tier: "fast", reason: "greeting or acknowledgement", definite: true };

  const asksToReason = REASONING_REQUEST.test(t) || REASONING_SUBJECT.test(t) || MATH_OR_CODE.test(t);
  if (asksToReason) return { tier: "deep", reason: "asks to reason, derive, or explain", definite: true };
  if (words > 80) return { tier: "deep", reason: "long, detailed message", definite: true };
  if ((t.match(/\?/g) ?? []).length >= 3) return { tier: "deep", reason: "several questions at once", definite: true };

  if (words <= 16 && !COMPOUND_QUESTION.test(t) && ((LOOKUP_QUESTION.test(t) && LOOKUP_SUBJECT.test(t)) || FACT_LOOKUP.test(t))) {
    return { tier: "fast", reason: "short factual lookup", definite: true };
  }
  if (CONFIRMATION.test(t) && words <= 8) return { tier: "standard", reason: "confirmation that may trigger an action", definite: true };
  if (ACTION_REQUEST.test(t)) return { tier: "standard", reason: "action request", definite: true };

  // A fragment with no signal of its own ("and homework 2?") takes its tier
  // from the question it follows.
  return { tier: "standard", reason: "no clear signal", definite: false };
}

export function classifyThinkingNeed(messages: Message[]): ThinkDecision {
  const latest = lastUserText(messages);
  const result = classifyText(latest);
  if (!result.definite && wordCount(latest) <= 6) {
    const previous = classifyText(lastUserText(messages, 1));
    if (previous.definite) return { tier: previous.tier, reason: `follow-up to a ${previous.tier} question` };
  }
  return { tier: result.tier, reason: result.reason };
}
