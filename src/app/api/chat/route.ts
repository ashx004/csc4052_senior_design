import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { embedTexts, cosineSimilarity } from "@/src/library/ollamaEmbeddings";
import { searchWeb } from "@/src/library/webSearch";
import { searchYoutube } from "@/src/library/youtubeSearch";
import { generateAndUploadPdf } from "@/src/library/pdfGenerate";
import { warnIfSlowGeneration } from "@/src/library/ollamaHealthCheck";
import { getStudentProfile, maybeUpdateStudentProfile, StudentProfile } from "@/src/library/studentProfile";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";

const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_MAX = 15; // per user per window — generous for real use, catches runaway/abusive callers

const OLLAMA_TIMEOUT_MS = 120000; // first request after idle can take 30-60s+ to cold-load the model
const MAX_TOOL_ROUNDS = 5;
const MAX_DOCUMENT_CHARS = 30000;
const MAX_DOCS_SCANNED = 25;
const TOP_K_CHUNKS = 5;
const RERANK_CANDIDATE_POOL = 15; // widen hybrid-score recall, then rerank down to TOP_K_CHUNKS
const SIMILARITY_THRESHOLD = 0.3; // below this, a chunk is treated as "not actually relevant"
const CHAT_TEMPERATURE = 0.3; // lower than Ollama's default (~0.8) — favors grounded answers over creative ones
const WEB_SEARCH_MAX_RESULTS = 5;
const MAX_CHAT_INPUT_CHARS = 4000; // mirrors the client's <input maxLength> in ai-assistant/page.tsx

// Conversation compaction: once the "unsummarized" tail of a conversation
// gets this long, fold everything except the last KEEP_RECENT_MESSAGES turns
// into a running summary instead of resending it verbatim every request.
const COMPACTION_CHAR_THRESHOLD = 12000;
const KEEP_RECENT_MESSAGES = 6;

type ChatDocument = {
  resourceId: string;
  name: string;
  fileType: string;
  category: string;
  url: string;
};

type ChatClass = {
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
};

type ChatContext = {
  userId: string;
  email: string;
  name?: string;
  college?: string;
  classes: ChatClass[];
};

type ChatMessage = { role: string; content: string };

const LIST_CLASSES_TOOL = {
  type: "function",
  function: {
    name: "list_enrolled_classes",
    description:
      "Returns the student's exact enrolled classes, instructors, contact info, and document lists, verbatim. Call this ONLY for requests about classes/documents AS A SET — 'what classes am I in', 'tell me about my classes', 'what documents do I have overall'. Do NOT call this when the student names or asks about ONE SPECIFIC document (use read_document or search_documents instead) — this tool is for the roster/overview level only. The tool's result is the complete, final answer to give the student — present its actual contents in your reply immediately; do not treat it as needing further clarification before you can answer, and do not describe it as something the student shared or provided (you looked it up yourself).",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const READ_DOCUMENT_TOOL = {
  type: "function",
  function: {
    name: "read_document",
    description:
      "Fetch and read the full text of a specific class document (PDF, Word, Excel, plain text, or code file). Use this when you already know exactly which document is relevant — e.g. the student names it, or you already found it via search_documents. Reference the exact courseId from the system context, and the document's filename exactly as shown there — the filename is matched server-side, so get it close rather than needing it character-perfect.",
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "The class ID the document belongs to" },
        documentName: { type: "string", description: "The document's filename, e.g. \"GroupCreationAssignment.pdf\"" },
      },
      required: ["courseId", "documentName"],
    },
  },
};

const SEARCH_DOCUMENTS_TOOL = {
  type: "function",
  function: {
    name: "search_documents",
    description:
      "Semantically search across the student's indexed course documents (PDF, Word, Excel, plain text, code files) to find passages relevant to a question, when you don't know which specific document has the answer or the question is broad. Optionally scope the search to one class with courseId. Prefer this over read_document when you're unsure which file is relevant.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        courseId: { type: "string", description: "Optional: restrict the search to one class" },
      },
      required: ["query"],
    },
  },
};

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the live web for information that isn't in the student's course materials — general knowledge, current information, or a supplementary explanation. Still subject to the same academic-topic guardrails: use it to support learning, not for unrelated browsing. Results are capped to a handful of the most relevant sources — don't call it repeatedly for the same question.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        scholarly: {
          type: "boolean",
          description:
            "Set true to restrict results to reputable open-access academic sources (arXiv, PubMed Central, Semantic Scholar, etc.) instead of the general web — use for research-oriented questions, not quick factual lookups.",
        },
      },
      required: ["query"],
    },
  },
};

const YOUTUBE_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_youtube",
    description:
      "Find real explainer or lecture videos on YouTube relevant to a topic, when a visual/video walkthrough would help the student more than text. Only call this when a video genuinely fits the question — not for every answer. Link results with the real video URL, never a fabricated one.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to find a video about" },
      },
      required: ["query"],
    },
  },
};

const CREATE_PDF_TOOL = {
  type: "function",
  function: {
    name: "create_pdf",
    description:
      "Generate a formatted PDF the student can download — e.g. a practice exam, study guide, or worksheet. Write the body as markdown (use # / ## for section headings, numbered lists for questions, **bold** for emphasis); it gets rendered into a real PDF document. Only use this when the student actually wants a document to keep/print/download, not for a normal chat answer.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the document, used as its filename" },
        markdown: { type: "string", description: "The document body, written in simple markdown" },
      },
      required: ["title", "markdown"],
    },
  },
};

const RECALL_PAST_CHAT_TOOL = {
  type: "function",
  function: {
    name: "recall_past_chat",
    description:
      "Search the student's OTHER past conversations (not this one) for something discussed before — use only when the student explicitly references a previous chat (e.g. 'like we talked about last time', 'what did you say about X before'). Matches against each past chat's title and content.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for in past conversations" },
      },
      required: ["query"],
    },
  },
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

function buildGlobalContextLayer(identity: string | undefined, nowLine: string): string {
  const who = identity
    ? `You are Catalyst, an AI study assistant embedded in ${identity}'s academic platform. You have real access to their identity, school, enrolled classes, and uploaded course materials — use it naturally to personalize answers instead of asking the student to repeat information you already have.`
    : `You are Catalyst, an AI study assistant embedded in a student's academic platform.`;

  return `${who} ${nowLine} — use it for anything date/time-relative.

Guardrails & style: Stay on academic/learning topics; redirect off-topic or inappropriate requests briefly and warmly, no lecturing. Markdown only (CommonMark/GFM — this chat cannot render raw HTML like <br>/<b>, they'll show as literal text); real pipe tables for tabular data. Match response length to the question. Emojis sparingly. Use the student's first name and their real class/instructor names naturally.`;
}

function buildInstructionalLogicLayer(): string {
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

Teaching approach: guide, don't dump. Ask what they've tried, point at the specific issue, explain the underlying mechanism — hand over complete corrected code only if asked directly or they're stuck after a real attempt. Never produce a complete deliverable meant to be submitted as the student's own graded work (a full essay, a finished assignment) even on direct request — offer to help them build it instead. If text looks pasted from a live quiz/exam, decline to answer it directly and explain the concept instead.`;
}

function buildAdaptiveVariableLayer(context: ChatContext | undefined, learnerProfile?: string): string {
  const profileBlock = learnerProfile
    ? `\n\nWhat you've learned about this student over time (use it to tailor explanations and stay aligned with their goals — don't recite it back verbatim or make them feel watched):\n${learnerProfile}`
    : "";

  if (!context) return profileBlock.trim();

  const identityParts = [context.name, context.college].filter(Boolean).join(", ");
  const identity = identityParts ? `${identityParts} (${context.email})` : context.email;

  const classLines = context.classes.length
    ? context.classes
        .map((c) => {
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
        })
        .join("\n")
    : "  (Not enrolled in any classes yet)";

  return `Student: ${identity}${profileBlock}

Enrolled classes:
${classLines}`;
}

// Only appended once a tool has actually been called this turn — see the
// header comment above for why this is deliberately separated rather than
// always-present.
function buildPostToolLayer(): string {
  return `You've used a tool this turn. Now: actually answer the student's question with what you found — don't just confirm you looked something up. Tool results are things YOU looked up yourself — never describe them as something the student "pasted" or "provided." Everything you state about the student's classes, documents, instructors, or contact info must come verbatim from the tool result, never from memory or a plausible-sounding guess — if a field (email, phone, syllabus) is blank in the result, say plainly it wasn't entered/uploaded, never construct a value that merely looks right. When quoting code, reproduce it character-for-character in its real language — never re-render Java as Python-style pseudocode.

Do exactly what was asked with what you found, nothing more. If the request was to summarize, explain, or describe a document, give a summary — even if that document turns out to describe a programming assignment or problem set, do NOT start writing or solving it; a strong pull toward "I found a coding problem, let me solve it" is a known failure mode here and must be resisted unless the student specifically asked you to write or help write the code.`;
}

function buildSystemPrompt(context?: ChatContext, learnerProfile?: string, includePostToolLayer = false): string {
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
    buildGlobalContextLayer(identityWithEmail, nowLine),
    buildInstructionalLogicLayer(),
    buildAdaptiveVariableLayer(context, learnerProfile),
  ];
  if (includePostToolLayer) layers.push(buildPostToolLayer());

  return layers.filter(Boolean).join("\n\n");
}

// Code-generated, not LLM-generated — the class listing is already fully
// known from context, but reciting it from memory has repeatedly produced
// fabricated course codes, instructor names, and invented contact emails
// (confirmed live 2026-07-21, even with correct context present and even
// on plain, non-compound requests). Returning the exact real text removes
// the model's opportunity to get it wrong.
function listEnrolledClasses(context: ChatContext | undefined): string {
  if (!context?.classes.length) {
    return "The student is not enrolled in any classes yet.";
  }

  return context.classes
    .map((c) => {
      const contactParts = [
        c.facultyName ? `Instructor: ${c.facultyName}` : "Instructor: not listed",
        c.facultyEmail ? `Email: ${c.facultyEmail}` : "Email: not entered",
        c.facultyPhoneNumber ? `Phone: ${c.facultyPhoneNumber}` : "Phone: not entered",
        c.facultyOfficeNumber ? `Office: ${c.facultyOfficeNumber}` : "Office: not entered",
      ].join(", ");

      const docLines = c.documents.length
        ? c.documents.map((d) => `  - ${d.name} (${d.fileType}, tag: ${d.category || "untagged"})`).join("\n")
        : "  (no documents uploaded)";

      return `${c.classCode} — ${c.className} (${c.term})\n${contactParts}\nSchedule: ${c.classSchedule || "not listed"}\nDocuments:\n${docLines}`;
    })
    .join("\n\n");
}

async function readDocument(
  request: NextRequest,
  context: ChatContext | undefined,
  courseId: string,
  documentName: string
): Promise<{ text: string; doc?: ChatDocument }> {
  const classDoc = context?.classes.find((c) => c.classId === courseId);
  if (!classDoc) {
    return { text: "Error: no class found with that courseId." };
  }

  // Match by name rather than requiring the model to reproduce an opaque
  // resourceId character-for-character — confirmed live 2026-07-21 that
  // this was a real source of failures (the model asked for a document by
  // its real filename, but transcribed the wrong internal ID, and the
  // lookup failed even though the document genuinely existed). Exact match
  // first, then case-insensitive, then substring, so small naming slips
  // still resolve.
  const needle = documentName.trim().toLowerCase();
  const doc =
    classDoc.documents.find((d) => d.name === documentName) ??
    classDoc.documents.find((d) => d.name.toLowerCase() === needle) ??
    classDoc.documents.find((d) => d.name.toLowerCase().includes(needle) || needle.includes(d.name.toLowerCase()));

  if (!doc) {
    const available = classDoc.documents.map((d) => d.name).join(", ") || "(no documents in this class)";
    return { text: `Error: no document named "${documentName}" found in this class. Available documents: ${available}` };
  }
  if (!SUPPORTED_DOCUMENT_TYPES.includes(doc.fileType)) {
    return {
      text: `Error: "${doc.name}" is a .${doc.fileType} file — that type isn't readable yet (PDF, Word, Excel, plain text, and common code files are supported).`,
    };
  }

  try {
    const fullUrl = resolveInternalUrl(request, doc.url);
    let text = await extractDocumentText(fullUrl, doc.fileType);

    if (!text) {
      return { text: `Error: "${doc.name}" has no extractable text.` };
    }
    if (text.length > MAX_DOCUMENT_CHARS) {
      text = text.slice(0, MAX_DOCUMENT_CHARS) + "\n\n[document truncated]";
    }

    return { text, doc };
  } catch (error) {
    console.error(`Error reading document ${doc.name}:`, error);
    return { text: `Error: failed to read "${doc.name}".` };
  }
}

// Simple sparse (keyword) signal to complement the dense (embedding) one —
// catches exact terms like course codes or names that semantic similarity
// alone sometimes misses.
function keywordScore(query: string, text: string): number {
  const queryTerms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2)
    )
  );
  if (queryTerms.length === 0) return 0;

  const lowerText = text.toLowerCase();
  const matched = queryTerms.filter((t) => lowerText.includes(t)).length;
  return matched / queryTerms.length;
}

async function searchDocuments(
  context: ChatContext | undefined,
  query: string,
  courseId?: string,
  documentsReadThisTurn: { courseId: string; resourceId: string; name: string }[] = []
): Promise<string> {
  if (!context?.userId) {
    return "Error: no student context available for search.";
  }

  // If a document was already fully read via read_document this turn, an
  // empty/weak search result must not read as "nothing found" — the model
  // has repeatedly (confirmed live 2026-07-21) treated a failed search as
  // overriding a successful read it had moments earlier, and reported total
  // failure despite already having the document's full content in hand.
  const alreadyReadNote = documentsReadThisTurn.length
    ? ` Note: you already successfully read the full content of ${documentsReadThisTurn
        .map((d) => `"${d.name}"`)
        .join(", ")} this turn via read_document — that content is still in this conversation and is not affected by this search coming up empty. Use it directly; do not report failure to access the document.`
    : "";

  const targetClasses = courseId
    ? context.classes.filter((c) => c.classId === courseId)
    : context.classes;

  const candidateDocs = targetClasses.flatMap((c) =>
    c.documents
      .filter((d) => SUPPORTED_DOCUMENT_TYPES.includes(d.fileType))
      .map((d) => ({ ...d, courseId: c.classId, classCode: c.classCode }))
  );

  if (candidateDocs.length === 0) {
    return "No indexed documents are available to search." + alreadyReadNote;
  }

  let queryEmbedding: number[];
  try {
    [queryEmbedding] = await embedTexts([query]);
  } catch (error) {
    console.error("Query embedding failed:", error);
    return "Error: the search service is unavailable right now.";
  }

  const scored: { text: string; docName: string; classCode: string; score: number }[] = [];

  for (const doc of candidateDocs.slice(0, MAX_DOCS_SCANNED)) {
    try {
      const chunksSnap = await getDocs(
        collection(
          db,
          "users",
          context.userId,
          "enrollment",
          doc.courseId,
          "resources",
          doc.resourceId,
          "chunks"
        )
      );
      chunksSnap.forEach((chunkDoc) => {
        const data = chunkDoc.data();
        if (!Array.isArray(data.embedding)) return;
        // Hybrid score: dense (embedding) similarity weighted primary, sparse
        // (keyword overlap) as a secondary boost for exact-term recall.
        const hybridScore =
          0.75 * cosineSimilarity(queryEmbedding, data.embedding) +
          0.25 * keywordScore(query, data.text);
        scored.push({
          text: data.text,
          docName: doc.name,
          classCode: doc.classCode,
          score: hybridScore,
        });
      });
    } catch (error) {
      console.error(`Error scanning chunks for ${doc.name}:`, error);
    }
  }

  if (scored.length === 0) {
    return (
      "No indexed content found yet — these documents may still be processing. Try read_document on a specific file instead." +
      alreadyReadNote
    );
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.filter((r) => r.score >= SIMILARITY_THRESHOLD).slice(0, RERANK_CANDIDATE_POOL);

  if (candidates.length === 0) {
    return (
      "Nothing in the indexed documents is actually relevant to that query — don't guess from weak matches. Tell the student you couldn't find this in their materials." +
      alreadyReadNote
    );
  }

  const relevant = await rerankChunks(query, candidates, TOP_K_CHUNKS);

  return relevant
    .map((r, i) => `[${i + 1}] From "${r.docName}" (${r.classCode}):\n${r.text}`)
    .join("\n\n");
}

// Two-stage retrieval: hybrid dense+sparse score gets a wide candidate pool
// (recall), then a cross-encoder-style LLM pass reranks it down to the few
// chunks actually worth sending to the primary model (precision). Runs on
// the secondary box's small model — fails open to hybrid-score order if the
// call fails, since a worse-ranked result set beats no result set.
async function rerankChunks<T extends { text: string }>(
  query: string,
  candidates: T[],
  topK: number
): Promise<T[]> {
  if (candidates.length <= topK) return candidates;
  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    return candidates.slice(0, topK);
  }

  const numbered = candidates.map((c, i) => `[${i + 1}] ${c.text.slice(0, 500)}`).join("\n\n");

  try {
    const response = await callOllama(
      [
        {
          role: "system",
          content: `You are a search relevance reranker. Given a query and numbered passages, reply with ONLY a comma-separated list of the ${topK} passage numbers most relevant to the query, best first — nothing else. Example: 3,1,7`,
        },
        { role: "user", content: `Query: ${query}\n\nPassages:\n${numbered}` },
      ],
      undefined,
      0.1,
      {
        baseUrl: process.env.OLLAMA_SECONDARY_URL,
        model: process.env.OLLAMA_SUMMARY_MODEL || "qwen3:4b",
      }
    );
    if (!response.ok) return candidates.slice(0, topK);

    const data = await response.json();
    warnIfSlowGeneration(
      process.env.OLLAMA_SECONDARY_URL || "",
      process.env.OLLAMA_SUMMARY_MODEL || "qwen3:4b",
      data?.eval_count,
      data?.eval_duration
    );
    const raw = (data?.message?.content || "").trim();
    const indices = raw
      .split(",")
      .map((s: string) => parseInt(s.trim(), 10) - 1)
      .filter((i: number) => Number.isInteger(i) && i >= 0 && i < candidates.length);

    if (indices.length === 0) return candidates.slice(0, topK);

    const seen = new Set<number>();
    const reranked: T[] = [];
    for (const i of indices) {
      if (seen.has(i)) continue;
      seen.add(i);
      reranked.push(candidates[i]);
      if (reranked.length >= topK) break;
    }
    return reranked.length > 0 ? reranked : candidates.slice(0, topK);
  } catch (error) {
    console.error("Reranking failed, using hybrid-score order:", error);
    return candidates.slice(0, topK);
  }
}

async function webSearchTool(query: string, scholarly?: boolean): Promise<string> {
  try {
    const results = await searchWeb(query, WEB_SEARCH_MAX_RESULTS, Boolean(scholarly));
    if (results.length === 0) {
      return "No web results found for that query.";
    }
    return results.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.content}`).join("\n\n");
  } catch (error) {
    console.error("Web search failed:", error);
    return "Error: web search is unavailable right now.";
  }
}

async function youtubeSearchTool(query: string): Promise<string> {
  try {
    const results = await searchYoutube(query);
    if (results.length === 0) {
      return "No relevant YouTube videos found.";
    }
    return results
      .map(
        (r, i) =>
          `[${i + 1}] "${r.title}" by ${r.channelTitle}\nurl: ${r.url}\nthumbnail: ${r.thumbnailUrl}\n${r.description}`
      )
      .join("\n\n");
  } catch (error) {
    console.error("YouTube search failed:", error);
    return "Error: video search is unavailable right now.";
  }
}

async function createPdfTool(
  context: ChatContext | undefined,
  title: string,
  markdown: string
): Promise<{ result: string; file?: { name: string; url: string } }> {
  if (!context?.userId) {
    return { result: "Error: no student context available to save a file for." };
  }
  if (!title || !markdown) {
    return { result: "Error: both a title and content are required to create a PDF." };
  }

  try {
    const file = await generateAndUploadPdf(context.userId, title, markdown);
    return { result: `PDF created successfully: "${file.name}". It's ready for the student to download.`, file };
  } catch (error) {
    console.error("PDF generation failed:", error);
    return { result: "Error: failed to generate the PDF. Tell the student and offer to try again." };
  }
}

const MAX_PAST_CHATS_SCANNED = 50;
const MAX_PAST_CHAT_MATCHES = 3;
const PAST_CHAT_FALLBACK_MESSAGE_COUNT = 6;
const PAST_CHAT_EXCERPT_CHARS = 800;

async function recallPastChatTool(
  context: ChatContext | undefined,
  currentSessionId: string | undefined,
  searchQuery: string
): Promise<string> {
  if (!context?.userId) {
    return "Error: no student context available.";
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, "users", context.userId, "chatSessions"),
        orderBy("updatedAt", "desc"),
        limit(MAX_PAST_CHATS_SCANNED)
      )
    );

    const candidates = snap.docs
      .filter((d) => d.id !== currentSessionId)
      .map((d) => {
        const data = d.data();
        const summary = typeof data.summary === "string" ? data.summary : "";
        const messages = Array.isArray(data.messages) ? data.messages : [];
        // Most chats never grow long enough to trigger compaction (empty
        // summary) — fall back to the opening messages so short past chats
        // are still searchable, not just long compacted ones.
        const fallbackText = messages
          .slice(0, PAST_CHAT_FALLBACK_MESSAGE_COUNT)
          .map((m: any) => m.text)
          .join(" ");
        const searchableText = (summary || fallbackText).trim();

        return {
          title: typeof data.title === "string" && data.title ? data.title : "Untitled chat",
          searchableText,
          updatedAt: data.updatedAt?.toDate?.() as Date | undefined,
        };
      })
      .filter((c) => c.searchableText);

    if (candidates.length === 0) {
      return "No other past conversations with enough content to search yet.";
    }

    const scored = candidates
      .map((c) => ({ ...c, score: keywordScore(searchQuery, `${c.title} ${c.searchableText}`) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PAST_CHAT_MATCHES);

    if (scored.length === 0) {
      return "Nothing in past conversations matches that — tell the student you don't have a record of it.";
    }

    return scored
      .map((c, i) => {
        const dateLabel = c.updatedAt ? ` (${c.updatedAt.toDateString()})` : "";
        const excerpt =
          c.searchableText.length > PAST_CHAT_EXCERPT_CHARS
            ? c.searchableText.slice(0, PAST_CHAT_EXCERPT_CHARS) + "…"
            : c.searchableText;
        return `[${i + 1}] "${c.title}"${dateLabel}:\n${excerpt}`;
      })
      .join("\n\n");
  } catch (error) {
    console.error("Recall past chat failed:", error);
    return "Error: couldn't search past conversations right now.";
  }
}

async function callOllama(
  messages: unknown[],
  tools?: unknown[],
  temperature = CHAT_TEMPERATURE,
  target: { baseUrl: string; model: string } = {
    baseUrl: process.env.OLLAMA_PRIMARY_URL || "",
    model: process.env.OLLAMA_MODEL || "gpt-oss:20b",
  }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    return await fetch(`${target.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: target.model,
        messages,
        ...(tools ? { tools } : {}),
        stream: false,
        options: { temperature },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Streams one round of Ollama /api/chat and forwards each real content token
// to onDelta as it arrives. Verified live against the primary box: text-only
// responses stream `message.content` token-by-token across `done:false`
// chunks; tool-call decisions arrive whole in the final `done:true` chunk
// with `content` staying empty the entire round — so it's always safe to
// call onDelta unconditionally, tool-call rounds just never produce a delta.
async function streamOllamaRound(
  messages: unknown[],
  tools: unknown[],
  temperature: number,
  target: { baseUrl: string; model: string },
  onDelta: (text: string) => void
): Promise<{ content: string; toolCalls: any[] | null; rawMessage: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${target.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: target.model,
        messages,
        tools,
        stream: true,
        options: { temperature },
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let contentAccum = "";
    let toolCalls: any[] | null = null;
    let rawMessage: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep any incomplete trailing line for the next read

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let chunk: any;
        try {
          chunk = JSON.parse(trimmed);
        } catch {
          continue; // skip a malformed line rather than aborting the whole stream
        }

        const delta = chunk?.message?.content;
        if (typeof delta === "string" && delta.length > 0) {
          contentAccum += delta;
          onDelta(delta);
        }

        if (Array.isArray(chunk?.message?.tool_calls) && chunk.message.tool_calls.length > 0) {
          toolCalls = chunk.message.tool_calls;
        }

        if (chunk?.done) {
          rawMessage = chunk.message ?? { role: "assistant", content: contentAccum };
          warnIfSlowGeneration(target.baseUrl, target.model, chunk.eval_count, chunk.eval_duration);
        }
      }
    }

    return {
      content: contentAccum,
      toolCalls,
      rawMessage: rawMessage ?? { role: "assistant", content: contentAccum },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Folds everything except the last KEEP_RECENT_MESSAGES turns into a running
// summary once the unsummarized tail gets long, so long-running conversations
// stay fast and cheap instead of resending the whole transcript every turn.
// Fails open: if summarization itself fails, just proceed with the full
// history for this turn rather than blocking the student's message.
async function compactIfNeeded(
  messages: ChatMessage[],
  summary: string,
  summarizedCount: number
): Promise<{ summary: string; summarizedCount: number }> {
  const recent = messages.slice(summarizedCount);
  const recentChars = recent.reduce((sum, m) => sum + m.content.length, 0);

  if (recentChars <= COMPACTION_CHAR_THRESHOLD || recent.length <= KEEP_RECENT_MESSAGES) {
    return { summary, summarizedCount };
  }

  const toFold = recent.slice(0, recent.length - KEEP_RECENT_MESSAGES);
  const foldText = toFold.map((m) => `${m.role}: ${m.content}`).join("\n\n");

  const summarizeMessages = [
    {
      role: "system",
      content:
        "Summarize the following conversation excerpt concisely but completely — preserve concrete facts, decisions, names, numbers, and open questions the student raised. Write it as flowing notes, not a transcript. Keep it under 300 words.",
    },
    {
      role: "user",
      content: summary
        ? `Existing summary of earlier conversation:\n${summary}\n\nNew excerpt to fold in:\n${foldText}\n\nProduce one updated summary covering everything.`
        : `Conversation excerpt to summarize:\n${foldText}`,
    },
  ];

  try {
    const response = await callOllama(summarizeMessages, undefined, 0.2, {
      baseUrl: process.env.OLLAMA_SECONDARY_URL || process.env.OLLAMA_PRIMARY_URL || "",
      model: process.env.OLLAMA_SUMMARY_MODEL || process.env.OLLAMA_MODEL || "gpt-oss:20b",
    });
    if (!response.ok) throw new Error(`Summarization failed (${response.status})`);

    const data = await response.json();
    warnIfSlowGeneration(
      process.env.OLLAMA_SECONDARY_URL || process.env.OLLAMA_PRIMARY_URL || "",
      process.env.OLLAMA_SUMMARY_MODEL || process.env.OLLAMA_MODEL || "gpt-oss:20b",
      data?.eval_count,
      data?.eval_duration
    );
    const newSummary = data?.message?.content;
    if (!newSummary) throw new Error("Summarization returned no content");

    return { summary: newSummary, summarizedCount: summarizedCount + toFold.length };
  } catch (error) {
    console.error("Conversation compaction failed, continuing without it:", error);
    return { summary, summarizedCount };
  }
}

// Response protocol (newline-delimited JSON, one object per line):
//   {"type":"delta","text":"..."}                                — append to the reply
//   {"type":"tool","name":"search_documents"}                    — a tool started running
//   {"type":"done","documentsRead":[...],"generatedFiles":[...],"summary":"...","summarizedCount":N}
//   {"type":"error","error":"..."}
export async function POST(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(auth.uid, CHAT_RATE_LIMIT_WINDOW_MS, CHAT_RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "You're sending messages too quickly — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const {
    messages,
    context,
    summary: incomingSummary,
    summarizedCount: incomingSummarizedCount,
    currentSessionId,
  } = (await request.json().catch(() => ({}))) as {
    messages?: ChatMessage[];
    context?: ChatContext;
    summary?: string;
    summarizedCount?: number;
    currentSessionId?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  // The client sends its own ChatContext (built client-side) rather than us
  // trusting a userId string alone — verify it actually matches who's
  // logged in, so one account can't pull another's class/document data by
  // just editing the request body.
  if (context?.userId && context.userId !== auth.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Server-side backstop behind the client's maxLength — the client can be
  // bypassed by calling this route directly.
  const latestMessage = messages[messages.length - 1];
  if (typeof latestMessage?.content === "string" && latestMessage.content.length > MAX_CHAT_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Message is too long (max ${MAX_CHAT_INPUT_CHARS.toLocaleString()} characters).` },
      { status: 400 }
    );
  }

  if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    return NextResponse.json({ error: "The AI assistant is not configured." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const primaryTarget = {
    baseUrl: process.env.OLLAMA_PRIMARY_URL,
    model: process.env.OLLAMA_MODEL || "gpt-oss:20b",
  };
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      let studentProfile: StudentProfile = { summary: "", messageCount: 0 };

      try {
        const [{ summary, summarizedCount }, loadedProfile] = await Promise.all([
          compactIfNeeded(messages, incomingSummary ?? "", incomingSummarizedCount ?? 0),
          context?.userId ? getStudentProfile(context.userId) : Promise.resolve(studentProfile),
        ]);
        studentProfile = loadedProfile;

        const conversation: any[] = [
          { role: "system", content: buildSystemPrompt(context, studentProfile.summary) },
          ...(summary ? [{ role: "system", content: `Summary of earlier conversation:\n${summary}` }] : []),
          ...messages.slice(summarizedCount),
        ];
        const documentsRead: string[] = [];
        const generatedFiles: { name: string; url: string }[] = [];
        const tools = [
          LIST_CLASSES_TOOL,
          SEARCH_DOCUMENTS_TOOL,
          READ_DOCUMENT_TOOL,
          WEB_SEARCH_TOOL,
          YOUTUBE_SEARCH_TOOL,
          CREATE_PDF_TOOL,
          RECALL_PAST_CHAT_TOOL,
        ];

        let finished = false;
        let emptyRoundRetries = 0;
        let anyToolCalled = false;
        const documentsReadThisTurn: { courseId: string; resourceId: string; name: string }[] = [];

        for (let round = 0; round < MAX_TOOL_ROUNDS && !finished; round++) {
          const { content, toolCalls, rawMessage } = await streamOllamaRound(
            conversation,
            tools,
            CHAT_TEMPERATURE,
            primaryTarget,
            (delta) => send({ type: "delta", text: delta })
          );

          if (toolCalls && toolCalls.length > 0) {
            if (!anyToolCalled) {
              anyToolCalled = true;
              // Swap in the post-tool layer for every round from here on —
              // no extra request, just changes what this same next round
              // already sends. See buildPostToolLayer's comment for why.
              conversation[0] = { role: "system", content: buildSystemPrompt(context, studentProfile.summary, true) };
            }
            conversation.push(rawMessage);

            for (const toolCall of toolCalls) {
              const fnName = toolCall.function?.name;
              const args = toolCall.function?.arguments ?? {};
              send({ type: "tool", name: fnName });
              let result: string;

              if (fnName === "list_enrolled_classes") {
                result = listEnrolledClasses(context);
              } else if (fnName === "read_document") {
                const readResult = await readDocument(request, context, args.courseId, args.documentName);
                result = readResult.text;
                if (readResult.doc) {
                  documentsRead.push(readResult.doc.name);
                  documentsReadThisTurn.push({
                    courseId: args.courseId,
                    resourceId: readResult.doc.resourceId,
                    name: readResult.doc.name,
                  });
                }
              } else if (fnName === "search_documents") {
                result = await searchDocuments(context, args.query, args.courseId, documentsReadThisTurn);
              } else if (fnName === "web_search") {
                result = await webSearchTool(args.query, args.scholarly);
              } else if (fnName === "search_youtube") {
                result = await youtubeSearchTool(args.query);
              } else if (fnName === "create_pdf") {
                const pdfResult = await createPdfTool(context, args.title, args.markdown);
                result = pdfResult.result;
                if (pdfResult.file) generatedFiles.push(pdfResult.file);
              } else if (fnName === "recall_past_chat") {
                result = await recallPastChatTool(context, currentSessionId, args.query);
              } else {
                result = `Error: unknown tool "${fnName}".`;
              }

              conversation.push({ role: "tool", tool_call_id: toolCall.id, content: result });
            }

            continue;
          }

          // No tool calls. Normally this round's content is the final answer
          // — but occasionally Ollama returns neither tool calls nor content
          // (an empty round). Silently declaring that "done" produces an
          // invisible, empty assistant bubble, so retry once before
          // surfacing an error.
          if (!content) {
            if (emptyRoundRetries < 1) {
              emptyRoundRetries++;
              continue;
            }
            send({
              type: "error",
              error: "The assistant didn't generate a response. Please try asking again.",
            });
            finished = true;
            break;
          }

          finished = true;
          send({ type: "done", documentsRead, generatedFiles, summary, summarizedCount });
        }

        if (!finished) {
          // Ran out of tool-call rounds without reaching a final answer —
          // force one last text-only response (empty tools array guarantees
          // no further tool calls) rather than dead-ending on the student.
          conversation.push({
            role: "system",
            content:
              "You've used up your tool calls for this turn. Answer now using only what you've already found. If you genuinely don't have enough to answer, say so plainly.",
          });

          const { content } = await streamOllamaRound(conversation, [], CHAT_TEMPERATURE, primaryTarget, (delta) =>
            send({ type: "delta", text: delta })
          );

          if (content) {
            send({ type: "done", documentsRead, generatedFiles, summary, summarizedCount });
          } else {
            send({
              type: "error",
              error: "The assistant needed too many steps to answer. Please try rephrasing your question.",
            });
          }
        }
      } catch (error: any) {
        console.error("Chat route error:", error);
        send({
          type: "error",
          error:
            error?.name === "AbortError"
              ? "The assistant took too long to respond. Please try again."
              : "Couldn't reach the assistant. Please try again.",
        });
      } finally {
        // Fire-and-forget — never awaited, must not add latency to a
        // response the student is already looking at. Errors are handled
        // entirely inside maybeUpdateStudentProfile itself.
        if (context?.userId) {
          maybeUpdateStudentProfile(context.userId, studentProfile, messages.slice(-8)).catch((error) =>
            console.error("Unhandled student profile update error:", error)
          );
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
