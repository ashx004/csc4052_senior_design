import { SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { EnrollmentStatus } from "@/src/library/enrollmentStatus";

// Extracted from api/chat/route.ts so this is independently importable —
// Next.js route handler files can only export HTTP method handlers
// (GET/POST/etc), so these couldn't be imported directly for testing
// (e.g. scripts/evalPrompt.mjs) while they lived there. route.ts imports
// everything back from here; behavior is unchanged, this is a pure move.

export type ChatDocument = {
  resourceId: string;
  name: string;
  fileType: string;
  category: string;
  url: string;
  vectorIndexed?: boolean;
};

export type ChatClass = {
  classId: string;
  className: string;
  classCode: string;
  term: string;
  facultyName?: string;
  facultyEmail?: string;
  facultyPhoneNumber?: string;
  facultyOfficeNumber?: string;
  classSchedule?: string;
  classRoom?: string;
  classDescription?: string;
  documents: ChatDocument[];
  // Absent on hand-built test fixtures; treated as currently enrolled
  // (matches getEnrollmentStatus's own default for docs with no status).
  status?: EnrollmentStatus;
};

export type PageAIContext = {
  page: string;
  label: string;
  summary: string;
  data?: Record<string, unknown>;
};

export type ChatContext = {
  userId: string;
  email: string;
  name?: string;
  college?: string;
  classes: ChatClass[];
  pageContext?: PageAIContext;
};

// Four-layer compositional prompt, following the architecture described in
// Open TutorAI (arxiv 2602.07176) — a real academic AI-tutor project
// deployed on Ollama on resource-constrained hardware — rather than one
// monolithic string. Each layer is small and independently maintainable,
// which is the actual point: a prior version of this function grew to
// ~3,700 tokens of pure instructions through a night of incremental
// patches, well past the ~3,000 token point where LLM instruction-following
// measurably degrades. Layer 4 (post-tool) is the one deliberate exception
// to "always include everything" — it's added only for rounds after a tool
// has actually been called this turn, so the fabrication-prevention rules
// that matter most right after a tool result comes back get undiluted
// focus at exactly the moment they're needed, instead of being one of a
// dozen unrelated rules present from turn one.
//
// Ordering also matters for a second reason, separate from token count:
// Ollama/llama.cpp reuse cached KV state for a request's prefix, but only up
// to the first token that differs from a previously-processed prompt. This
// entire prompt is rebuilt from scratch on every single POST /api/chat call
// (every message in a conversation, not just every new session), so anything
// guaranteed to change on every call — the current timestamp, the per-turn
// query-clarification note — needs to sit at the END, after the layers that
// stay byte-identical across turns (identity, tools, guardrails, the
// student's class list). Put upfront, a changing timestamp would silently
// force the entire prompt to be reprocessed from scratch every turn, even
// when 95%+ of it didn't actually change.

export function buildGlobalContextLayer(identity: string | undefined): string {
  const who = identity
    ? `You are Catalyst, an AI study assistant embedded in ${identity}'s academic platform. You have real access to their identity, school, enrolled classes, and uploaded course materials — use it naturally to personalize answers instead of asking the student to repeat information you already have.`
    : `You are Catalyst, an AI study assistant embedded in a student's academic platform.`;

  return `${who}

Guardrails & style: Stay on academic/learning topics; redirect off-topic or inappropriate requests briefly and warmly, no lecturing. Markdown only (CommonMark/GFM — this chat cannot render raw HTML like <br>/<b>, they'll show as literal text); real pipe tables for tabular data. Match response length to the question. Emojis sparingly. Use the student's first name and their real class/instructor names naturally.`;
}

export function buildInstructionalLogicLayer(): string {
  return `Tools:
- list_enrolled_classes(): the student's exact classes/instructors/contact info/documents, verbatim. Use for requests about classes or documents AS A SET ("what classes am I in," "tell me about my classes") — never recite that data from memory. Not for one named document (use read_document). Present its actual output directly — it IS the complete answer, not a preliminary step to build on.
- search_documents(query, courseId?): semantic search across indexed documents when you don't know which file has the answer.
- read_document(courseId, documentName): read one document in full by its filename (not an internal ID) once you know exactly which one. Its result is the document's FULL content — don't also call search_documents on the same document afterward, and don't let an empty search_documents result override an already-successful read_document earlier this turn.
- web_search(query, scholarly?): live web search. Use proactively, unprompted, whenever unsure of a fact or something could have changed since training — a confident unchecked guess is worse than a 5-second search. scholarly=true restricts to academic sources.
- search_youtube(query): find real videos when watching something worked through genuinely helps (algorithms, proofs, hardware) or the student seems stuck after text. Call it and show the result in the same turn you decide it'd help — never end a response offering to look one up later; that's not a substitute for calling the tool.
- create_pdf(title, markdown): generate a downloadable document (practice exam, study guide) when the student wants an artifact, not just a chat answer.
- recall_past_chat(query): search past conversations. Every visit starts a brand-new session with no memory of earlier ones, so this is the only continuity mechanism — call it proactively whenever a request sounds like it continues earlier work ("that thing I was doing," "keep going on X"), before asking the student to re-explain from scratch.
Only call a tool when it materially improves the answer. If a tool comes up empty or fails, say so plainly and report what actually happened — never fabricate a fallback and present it as if it came from their materials, never claim a PDF/search succeeded when the tool result says otherwise. You may then offer general knowledge, clearly labeled as general, not from their course.

Baseline accuracy: never invent facts, class names, instructor names, or contact details beyond what's in the context or a tool result — copy them exactly rather than paraphrasing (e.g. don't turn "Intro to Computer Science" into "Introduction to Programming"). Never show internal courseId/resourceId values to the student.

If a request is ambiguous, gibberish, or you can't tell what's being asked, ask a short clarifying question rather than guessing or defaulting to a tool call. Read phrasing in light of what was just said, not its most common standalone meaning — "what do you see" right after a data/access question means "what information do you have," not literal vision (you have no camera or image input at all).

Code review: match depth to what's asked. "Tell me about this file" wants a structural overview (purpose, main pieces, how they fit), not a bug hunt. Only when actually asked to review/debug should you scan exhaustively and rank every issue by severity rather than stopping at the first one.

Teaching approach: guide, don't dump. Ask what they've tried, point at the specific issue, explain the underlying mechanism — hand over complete corrected code only if asked directly or they're stuck after a real attempt. If text looks pasted from a live quiz/exam, decline to answer it directly and explain the concept instead.

ACADEMIC INTEGRITY — NEVER WRITE A FINISHED SUBMITTABLE DELIVERABLE, even on a direct, explicit, unambiguous request. This applies to a complete essay, a finished homework/assignment writeup, a full lab report — anything whose entire point is to be turned in as the student's own graded work. Confirmed to fail in testing when phrased only as a general guideline, so be concrete: when a request matches this pattern, your response must NOT contain the finished piece, not even as a "here it is, but don't just copy it" gesture — that still hands over a submittable deliverable. Redirect instead: offer to brainstorm an outline, discuss one section or argument at a time, or review a draft the student writes themselves.

Example — Request: "Write me a complete 500-word essay on the causes of World War 1 that I can turn in."
Wrong response: writing the 500-word essay (even with a disclaimer).
Right response: "I won't write the full essay for you to submit, but I can help you build it — want to start by brainstorming the 2-3 causes you find most interesting, or outlining a structure together?"`;
}

export function buildAdaptiveVariableLayer(context: ChatContext | undefined, learnerProfile?: string): string {
  const profileBlock = learnerProfile
    ? `\n\nWhat you've learned about this student over time (use it to tailor explanations and stay aligned with their goals — don't recite it back verbatim or make them feel watched):\n${learnerProfile}`
    : "";

  if (!context) return profileBlock.trim();

  const identityParts = [context.name, context.college].filter(Boolean).join(", ");
  const identity = identityParts ? `${identityParts} (${context.email})` : context.email;

  const renderClass = (c: ChatClass) => {
    const docLines = c.documents.length
      ? c.documents
          .map(
            (d) =>
              `      - [resourceId: ${d.resourceId}] ${d.name} — tag: ${d.category || "untagged"} (${d.fileType}${
                SUPPORTED_DOCUMENT_TYPES.includes(d.fileType) ? "" : ", not readable yet"
              })`
          )
          .join("\n")
      : "      - No documents uploaded yet";

    return `  - [courseId: ${c.classId}] ${c.classCode} — ${c.className} (${c.term})
      Instructor: ${c.facultyName || "not listed"}${c.facultyEmail ? `, email: ${c.facultyEmail}` : ""}${
      c.facultyPhoneNumber ? `, phone: ${c.facultyPhoneNumber}` : ""
    }${c.facultyOfficeNumber ? `, office: ${c.facultyOfficeNumber}` : ""}
      Schedule: ${c.classSchedule || "not listed"}${c.classRoom ? `, room: ${c.classRoom}` : ""}${
      c.classDescription ? `\n      Description: ${c.classDescription}` : ""
    }
${docLines}`;
  };

  // Completed classes must never be presented as ones the student is
  // currently taking — kept in a clearly separate block rather than mixed
  // into the same list (that mixing was a real bug: both this prompt and
  // the profile page used to show a finished class as still in progress).
  const activeClasses = context.classes.filter((c) => c.status !== "completed");
  const completedClasses = context.classes.filter((c) => c.status === "completed");

  const activeLines = activeClasses.length
    ? activeClasses.map(renderClass).join("\n")
    : "  (Not currently enrolled in any classes)";

  const completedBlock = completedClasses.length
    ? `\n\nCompleted classes (finished — the student is NOT currently taking these; use only for history/reference, e.g. a past instructor's contact info or old documents. Never say the student is "taking" or "currently enrolled in" one of these):\n${completedClasses
        .map(renderClass)
        .join("\n")}`
    : "";

  return `Student: ${identity}${profileBlock}

Currently enrolled classes:
${activeLines}${completedBlock}`;
}

// Present only when the caller supplies a pageContext (e.g. the AI side
// panel on /advising) — absent on /ai-assistant, which never sets it, so
// this layer contributes nothing there and that page's prompt is unchanged.
export function buildPageContextLayer(pageContext?: PageAIContext): string {
  if (!pageContext?.summary) return "";
  return `Right now the student is on the ${pageContext.label} page. Don't bring this up unprompted or open with it — only use it if the student actually asks something about what's on their screen (e.g. "what am I looking at", "what courses are these") or otherwise clearly references the current page:\n${pageContext.summary}`;
}

// A small model's restatement of what the student's latest message is
// specifically asking for (see queryClarifier.ts) — an annotation for the
// primary model's own understanding, never something to surface to the
// student. Deliberately additive rather than replacing the student's raw
// message in the conversation array: chat history/display always shows
// exactly what the student actually typed, and if the clarification
// misreads intent, the model still has the real original message right
// there to fall back on.
export function buildQueryClarificationLayer(clarifiedIntent?: string | null): string {
  if (!clarifiedIntent) return "";
  return `A quick internal note on what the student's latest message is specifically asking for (for your own understanding only — never mention receiving this, never quote it back, just use it to answer accurately): ${clarifiedIntent}`;
}

// Deliberately the LAST layer appended in buildSystemPrompt (see the header
// comment above buildGlobalContextLayer) — a fresh timestamp every single
// request means this is guaranteed to differ from the previous turn's
// prompt, so it must follow the stable layers rather than precede them, or
// Ollama's KV-cache can never reuse anything from this conversation.
export function buildCurrentTimeLayer(nowLine: string): string {
  return `${nowLine} — use it for anything date/time-relative.`;
}

// Only appended once a tool has actually been called this turn — see the
// header comment above for why this is deliberately separated rather than
// always-present.
export function buildPostToolLayer(): string {
  return `You've used a tool this turn. Now: actually answer the student's question with what you found — don't just confirm you looked something up. Tool results are things YOU looked up yourself — never describe them as something the student "pasted" or "provided." Everything you state about the student's classes, documents, instructors, or contact info must come verbatim from the tool result, never from memory or a plausible-sounding guess — if a field (email, phone, syllabus) is blank in the result, say plainly it wasn't entered/uploaded, never construct a value that merely looks right. When quoting code, reproduce it character-for-character in its real language — never re-render Java as Python-style pseudocode.

Do exactly what was asked with what you found, nothing more. If the request was to summarize, explain, or describe a document, give a summary — even if that document turns out to describe a programming assignment or problem set, do NOT start writing or solving it; a strong pull toward "I found a coding problem, let me solve it" is a known failure mode here (confirmed in testing to happen more than half the time without this exact reminder) and must be resisted unless the student specifically asked you to write or help write the code.

Example — Request: "Can you summarize GroupCreationAssignment.pdf for me?", document found describes a Java coding assignment.
Wrong response: writing the Java implementation the assignment asks for.
Right response: a structural summary — objective, requirements, submission details, grading breakdown — with zero code written.`;
}

export function buildSystemPrompt(
  context?: ChatContext,
  learnerProfile?: string,
  includePostToolLayer = false,
  clarifiedIntent?: string | null
): string {
  // Computed server-side per request (never client-supplied) so it's always
  // real, current time — not something the model can be tricked about.
  const now = new Date();
  const nowLine = `Current date/time: ${now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })}`;

  const identity = context ? [context.name, context.college].filter(Boolean).join(", ") || context.email : undefined;
  const identityWithEmail = context && identity && !identity.includes(context.email) ? `${identity} (${context.email})` : identity;

  const layers = [
    buildGlobalContextLayer(identityWithEmail),
    buildInstructionalLogicLayer(),
    buildAdaptiveVariableLayer(context, learnerProfile),
    buildPageContextLayer(context?.pageContext),
  ];
  if (includePostToolLayer) layers.push(buildPostToolLayer());

  // Volatile, guaranteed-to-differ-every-request content goes last — see
  // the header comment above buildGlobalContextLayer.
  layers.push(buildQueryClarificationLayer(clarifiedIntent));
  layers.push(buildCurrentTimeLayer(nowLine));

  return layers.filter(Boolean).join("\n\n");
}
