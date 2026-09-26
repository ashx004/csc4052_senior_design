// Chooses which tool groups the model sees on a turn. Tool-selection
// accuracy falls off sharply as the tool list grows (Berkeley's function-
// calling leaderboard: 43% -> 2% going from 4 to 51 tools), and it falls
// hardest for small/mid models like ours. So instead of sending every tool
// every turn, a cheap keyword classifier - the "intent routing" tier of the
// usual layered design - picks the relevant groups from the latest message
// plus a little recent context (so "yes, do it" follow-ups keep their tools).
// The always-on core includes load_tools, so if routing misses, the model can
// pull in a group itself rather than being stuck.

export type ToolGroup = "documents" | "study" | "calendar" | "notes" | "courses" | "progress" | "web";

export const ALL_TOOL_GROUPS: ToolGroup[] = ["documents", "study", "calendar", "notes", "courses", "progress", "web"];

const SIGNALS: Record<ToolGroup, RegExp> = {
  documents: /\b(document|file|pdf|slides?|lecture|reading|chapter|syllabus|handout|uploaded|materials?|summari[sz]e|explain .* (from|in) my|according to|where (did|do) (we|i)|covered|search my)\b/i,
  study: /\b(flash ?cards?|quiz(zes)?|practice (test|exam|problems?)|study (set|guide|sheet)|cheat ?sheet|worksheet|review sheet|pdf|make me|generate|create)\b/i,
  calendar: /\b(calendar|schedul\w*|event|remind(er)?|appointment|meeting|due|deadline|tomorrow|today|tonight|this week|next week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s?(am|pm)|reschedule|cancel|free time|busy|study session|exam date|when is)\b/i,
  notes: /\b(notes?|notebooks?|jot|write (this|that|it) down|save (this|that|it)|typed note|write up)\b/i,
  courses: /\b(class(es)?|course|professor|prof|instructor|teacher|office|email|phone|room|building|credit|prereq\w*|term|semester|section|meets?|lecture time|enrolled|taking)\b/i,
  progress: /\b(confiden\w*|feel(ing)?|shaky|lost|confused|comfortable|good about|bad at|out of (5|five)|[1-5] ?\/ ?5|rate (myself|my)|how am i doing|how (did|do) i do|doing in|weak(est|ness)?|struggl\w*|strong(est)?|mastery|progress|scores?|grades?|results?|ready for|prepared|behind|understand|know (it|this|that) (well|already)|got (this|it) down)\b/i,
  web: /\b(search (the )?(web|internet|online)|google|look (it )?up|online|website|link|url|youtube|video|latest|current(ly)?|news|research|article|paper|source|release[ds]?|version)\b/i,
};

const COURSE_CODE = /\b[A-Z]{2,4}\s?\d{3,4}\b/;

type Message = { role: string; content: unknown };

/** The groups to offer this turn (core tools are always offered separately). */
export function selectToolGroups(messages: Message[]): Set<ToolGroup> {
  const texts = messages.filter((m) => typeof m.content === "string");
  const userTexts = texts.filter((m) => m.role === "user");
  const latest = (userTexts[userTexts.length - 1]?.content as string) ?? "";
  // Recent context: the previous user message and the assistant's last reply
  // (if it offered "want me to make a quiz?", a bare "yes" still needs study).
  const recent = [userTexts[userTexts.length - 2]?.content, [...texts].reverse().find((m) => m.role === "assistant")?.content]
    .filter((t): t is string => typeof t === "string")
    .join("\n");

  const groups = new Set<ToolGroup>();
  for (const group of ALL_TOOL_GROUPS) {
    if (SIGNALS[group].test(latest)) groups.add(group);
  }
  // A course code ("CSC 325") means course details may be needed.
  if (COURSE_CODE.test(latest)) groups.add("courses");
  const shortFollowUp = latest.trim().split(/\s+/).length <= 8;
  if (shortFollowUp || groups.size === 0) {
    for (const group of ALL_TOOL_GROUPS) if (SIGNALS[group].test(recent)) groups.add(group);
  }
  // Nothing matched at all (a plain concept question): documents and web are
  // the groups a tutoring answer most often needs.
  if (groups.size === 0) {
    groups.add("documents");
    groups.add("web");
  }
  // Study sets and PDFs are built from documents; progress answers point to them.
  if (groups.has("study") || groups.has("progress")) groups.add("documents");
  return groups;
}
