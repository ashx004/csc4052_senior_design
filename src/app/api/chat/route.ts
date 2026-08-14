import { NextRequest, NextResponse } from "next/server";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { embedTexts, cosineSimilarity } from "@/src/library/ollamaEmbeddings";
import { searchChunks } from "@/src/library/vectorStore";
import { resolveOllamaBaseUrl, resolveModelFromKey, FAST_MODEL_KEEP_ALIVE } from "@/src/library/ollamaClient";
import { clarifyUserQuery } from "@/src/library/queryClarifier";
import { searchWeb } from "@/src/library/webSearch";
import { searchYoutube } from "@/src/library/youtubeSearch";
import { generateAndUploadPdf, generateAndUploadPdfToCourse } from "@/src/library/pdfGenerate";
import { generateFlashcardsWithRetry } from "@/src/library/flashcardGeneration";
import { generateQuizWithValidation } from "@/src/library/quizGeneration";
import { warnIfSlowGeneration } from "@/src/library/ollamaHealthCheck";
import { getStudentProfile, maybeUpdateStudentProfile, StudentProfile } from "@/src/library/studentProfile";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import {pageContextSchema,buildPageContextPrompt,type PageContext,} from "@/src/library/Contextual_AI/contextualAi";
import { ChatContext, ChatClass, ChatDocument, buildSystemPrompt } from "@/src/library/systemPrompt";
import { describeChatError } from "@/src/library/chatErrors";
import { getIdToken, firestoreCreate, firestoreGet, firestoreUpdate, firestoreDelete, firestoreListCollection, firestoreRunQuery } from "@/src/library/firestoreRest";
import { deriveChatTitle } from "@/src/library/chatTitle";
import type { StoredChatMessage } from "@/src/library/chatMemory";
import { THINK_CLOSE_TAG, stripThinkLeak } from "@/src/library/stripThinkLeak";

const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_RATE_LIMIT_MAX = 15; // per user per window — generous for real use, catches runaway/abusive callers

const OLLAMA_TIMEOUT_MS = 120000; // first request after idle can take 30-60s+ to cold-load the model
const MAX_TOOL_ROUNDS = 5;
const MAX_DOCUMENT_CHARS = 30000;
const MAX_DOCS_SCANNED = 25;
const TOP_K_CHUNKS = 5;
const HYBRID_CANDIDATE_POOL = 15; // widen recall for the hybrid dense+sparse score before taking the top TOP_K_CHUNKS
const SIMILARITY_THRESHOLD = 0.3; // below this, a chunk is treated as "not actually relevant"
const CHAT_TEMPERATURE = 0.3; // lower than Ollama's default (~0.8) — favors grounded answers over creative ones
const WEB_SEARCH_MAX_RESULTS = 5;
const MAX_CHAT_INPUT_CHARS = 4000; // mirrors the client's <input maxLength> in ai-assistant/page.tsx

// Conversation compaction: once the "unsummarized" tail of a conversation
// gets this long, fold everything except the last KEEP_RECENT_MESSAGES turns
// into a running summary instead of resending it verbatim every request.
// Raised from the original 12000/6 - that was conservative even for
// qwen3:14b's real 40960-token context, and both current models (Fast:
// gpt-oss:20b, Quality: qwen3:30b-a3b) have substantially larger real
// context windows, so there's real headroom to keep more actual
// conversation verbatim (better continuity, no lossy summarization) before
// compaction needs to kick in at all.
const COMPACTION_CHAR_THRESHOLD = 45000;
const KEEP_RECENT_MESSAGES = 10;

type ChatMessage = { role: string; content: string };

const LIST_CLASSES_TOOL = {
  type: "function",
  function: {
    name: "list_enrolled_classes",
    description:
      "Returns the student's exact enrolled classes, instructors, contact info, and document lists, verbatim. Currently-enrolled classes and completed (finished) classes are returned in clearly separate sections — never describe a completed class as one the student is currently taking. Call this ONLY for requests about classes/documents AS A SET — 'what classes am I in', 'tell me about my classes', 'what documents do I have overall'. Do NOT call this when the student names or asks about ONE SPECIFIC document (use read_document or search_documents instead) — this tool is for the roster/overview level only. The tool's result is the complete, final answer to give the student — present its actual contents in your reply immediately; do not treat it as needing further clarification before you can answer, and do not describe it as something the student shared or provided (you looked it up yourself).",
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
      "Generate a formatted PDF the student can download — e.g. a practice exam, study guide, or worksheet. Write the body as markdown (use # / ## for section headings, numbered lists for questions, **bold** for emphasis); it gets rendered into a real PDF document. Only use this when the student actually wants a document to keep/print/download, not for a normal chat answer. If the PDF is for a specific class (e.g. a practice exam covering that class's material), pass courseId so it's also saved into that class's files, not just handed back as a one-off download.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the document, used as its filename" },
        markdown: { type: "string", description: "The document body, written in simple markdown" },
        courseId: { type: "string", description: "Optional: the class ID from context, if this PDF belongs to a specific class and should be saved into that class's files." },
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

const CREATE_FLASHCARDS_TOOL = {
  type: "function",
  function: {
    name: "create_flashcards",
    description:
      "Generate a set of study flashcards from a specific class document and save it to the student's flashcards for that class, ready to study immediately. Use this when the student asks to make/create/generate flashcards from a document (e.g. 'make flashcards from the syllabus', 'create flashcards for the chapter 3 notes'). Reference the exact courseId from the system context, and the document's filename exactly as shown there.",
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "The class ID the document belongs to" },
        documentName: { type: "string", description: "The document's filename to generate flashcards from, e.g. \"GroupCreationAssignment.pdf\"" },
      },
      required: ["courseId", "documentName"],
    },
  },
};

const CREATE_QUIZ_TOOL = {
  type: "function",
  function: {
    name: "create_quiz",
    description:
      "Generate a quiz (multiple choice / true-false / matching questions) from a specific class document and save it to the student's quizzes for that class, ready to take immediately. Use this when the student asks to make/create/generate a quiz or practice test from a document. Reference the exact courseId from the system context, and the document's filename exactly as shown there.",
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "The class ID the document belongs to" },
        documentName: { type: "string", description: "The document's filename to generate the quiz from, e.g. \"GroupCreationAssignment.pdf\"" },
        questionCount: { type: "number", description: "How many questions to generate, between 1 and 20. Default to 10 if the student doesn't say." },
      },
      required: ["courseId", "documentName"],
    },
  },
};

const DATETIME_FORMAT_NOTE =
  'Format as "YYYY-MM-DDTHH:MM" in the student\'s local time (24-hour clock, no timezone suffix) — match the "Current date/time" already given in context above for what "today"/"tomorrow"/relative dates mean.';

const LIST_CALENDAR_EVENTS_TOOL = {
  type: "function",
  function: {
    name: "list_calendar_events",
    description:
      "Returns every event on the student's personal calendar (title, start/end time, all-day flag, location, notes, and its id). Call this before update_calendar_event or delete_calendar_event to find the right event's id — matching by title alone is unreliable. Also use this to answer 'what's on my calendar' / 'when is X' questions. This does NOT include Google Calendar events if the student has that connected separately, only events created in Catalyst itself (including ones this assistant created).",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const CREATE_CALENDAR_EVENT_TOOL = {
  type: "function",
  function: {
    name: "create_calendar_event",
    description:
      "Add a new event to the student's personal calendar — e.g. a study session, appointment, reminder, or due date they mention. Use this whenever the student asks to add/schedule/create/remind them about something on their calendar.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short event title" },
        startDateTime: { type: "string", description: `When the event starts. ${DATETIME_FORMAT_NOTE}` },
        endDateTime: { type: "string", description: `When the event ends. ${DATETIME_FORMAT_NOTE} Omit to default to one hour after the start.` },
        allDay: { type: "boolean", description: "True for an all-day event (e.g. a due date with no specific time) — only startDateTime's date portion is used." },
        description: { type: "string", description: "Optional notes/details for the event" },
        location: { type: "string", description: "Optional location" },
      },
      required: ["title", "startDateTime"],
    },
  },
};

const UPDATE_CALENDAR_EVENT_TOOL = {
  type: "function",
  function: {
    name: "update_calendar_event",
    description:
      "Change an existing calendar event — reschedule it, rename it, or edit its details. Call list_calendar_events first to get the exact eventId; only include the fields that are actually changing.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event's id, from list_calendar_events" },
        title: { type: "string", description: "New title, if changing" },
        startDateTime: { type: "string", description: `New start time, if changing. ${DATETIME_FORMAT_NOTE}` },
        endDateTime: { type: "string", description: `New end time, if changing. ${DATETIME_FORMAT_NOTE}` },
        allDay: { type: "boolean", description: "New all-day flag, if changing" },
        description: { type: "string", description: "New notes/details, if changing" },
        location: { type: "string", description: "New location, if changing" },
      },
      required: ["eventId"],
    },
  },
};

const DELETE_CALENDAR_EVENT_TOOL = {
  type: "function",
  function: {
    name: "delete_calendar_event",
    description:
      "Cancel/remove an event from the student's calendar. Call list_calendar_events first to get the exact eventId. This cannot be undone — only call it when the student clearly asks to cancel/delete/remove a specific event.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event's id, from list_calendar_events" },
      },
      required: ["eventId"],
    },
  },
};

// Code-generated, not LLM-generated — the class listing is already fully
// known from context, but reciting it from memory has repeatedly produced
// fabricated course codes, instructor names, and invented contact emails
// (confirmed live 2026-07-21, even with correct context present and even
// on plain, non-compound requests). Returning the exact real text removes
// the model's opportunity to get it wrong.
function renderEnrolledClass(c: ChatClass): string {
  const contactParts = [
    c.facultyName ? `Instructor: ${c.facultyName}` : "Instructor: not listed",
    c.facultyEmail ? `Email: ${c.facultyEmail}` : "Email: not entered",
    c.facultyPhoneNumber ? `Phone: ${c.facultyPhoneNumber}` : "Phone: not entered",
    c.facultyOfficeNumber ? `Office: ${c.facultyOfficeNumber}` : "Office: not entered",
  ].join(", ");

  const docLines = c.documents.length
    ? c.documents
        .map((d) => `  - ${d.name} (${d.fileType}, tag: ${d.category || "untagged"}${d.ocrScanned ? ", OCR-scanned" : ""})`)
        .join("\n")
    : "  (no documents uploaded)";

  return `${c.classCode} — ${c.className} (${c.term})\n${contactParts}\nSchedule: ${c.classSchedule || "not listed"}\nDocuments:\n${docLines}`;
}

// Completed classes are kept in their own labeled block rather than mixed
// in — the AI must never present a finished class as one the student is
// currently taking (see systemPrompt.ts's buildAdaptiveVariableLayer for
// the same split applied to the always-present system prompt context).
function listEnrolledClasses(context: ChatContext | undefined): string {
  if (!context?.classes.length) {
    return "The student is not enrolled in any classes yet.";
  }

  const active = context.classes.filter((c) => c.status !== "completed");
  const completed = context.classes.filter((c) => c.status === "completed");

  const activeText = active.length
    ? active.map(renderEnrolledClass).join("\n\n")
    : "(Not currently enrolled in any classes)";

  if (!completed.length) return activeText;

  return `${activeText}\n\n--- Completed classes (finished — NOT currently enrolled in these) ---\n\n${completed
    .map(renderEnrolledClass)
    .join("\n\n")}`;
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

// Real BM25 (k1=1.5, b=0.75 — standard defaults) as the sparse signal
// complementing the dense (embedding) one — catches exact terms like course
// codes or names that semantic similarity alone sometimes misses. Computed
// over the candidate pool itself as the "corpus": the pool is small
// (bounded by HYBRID_CANDIDATE_POOL), so per-term document frequency and
// average document length are cheap to compute inline, with no need for a
// persistent text index. Replaces the previous naive "% of query terms
// present" ratio, which ignored term frequency and document length
// entirely (so a chunk mentioning a term once scored the same as one
// mentioning it ten times, and a one-line chunk scored the same as a
// thousand-word one for the same single match).
function bm25Scores(query: string, texts: string[]): number[] {
  const K1 = 1.5;
  const B = 0.75;
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0 || texts.length === 0) return texts.map(() => 0);

  const docTermCounts = texts.map((text) => {
    const counts = new Map<string, number>();
    for (const term of tokenize(text)) counts.set(term, (counts.get(term) ?? 0) + 1);
    return counts;
  });
  const docLengths = docTermCounts.map((counts) =>
    Array.from(counts.values()).reduce((sum, n) => sum + n, 0)
  );
  const avgdl = docLengths.reduce((sum, n) => sum + n, 0) / texts.length || 1;

  const N = texts.length;
  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    const docsWithTerm = docTermCounts.filter((counts) => counts.has(term)).length;
    idf.set(term, Math.log((N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1));
  }

  return docTermCounts.map((counts, i) => {
    let score = 0;
    for (const term of queryTerms) {
      const f = counts.get(term) ?? 0;
      if (f === 0) continue;
      const denom = f + K1 * (1 - B + (B * docLengths[i]) / avgdl);
      score += (idf.get(term) ?? 0) * ((f * (K1 + 1)) / denom);
    }
    return score;
  });
}

async function searchDocuments(
  request: NextRequest,
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

  const scored: { text: string; docName: string; classCode: string; page?: number; denseScore: number }[] = [];
  const docsByResourceId = new Map(candidateDocs.map((d) => [d.resourceId, d]));
  const scannedDocs = candidateDocs.slice(0, MAX_DOCS_SCANNED);

  // Which resources actually got upserted into Qdrant is decided once, at
  // index time (embed-document/route.ts sets vectorIndexed on success) —
  // NOT inferred here from "did a search happen to return anything," which
  // would wrongly re-scan Firestore for every document a given query simply
  // didn't match, defeating the point of the migration. Old, pre-migration
  // documents (vectorIndexed unset) go straight to the brute-force scan —
  // see scripts/backfillQdrant.ts for a one-time way to migrate them.
  const qdrantDocs = scannedDocs.filter((d) => d.vectorIndexed);
  let firestoreOnlyDocs = scannedDocs.filter((d) => !d.vectorIndexed);

  if (qdrantDocs.length > 0) {
    try {
      const results = await searchChunks(
        queryEmbedding,
        { userId: context.userId, resourceIds: qdrantDocs.map((d) => d.resourceId) },
        HYBRID_CANDIDATE_POOL * 3
      );
      for (const r of results) {
        const doc = docsByResourceId.get(r.payload.resourceId);
        if (!doc) continue; // defensive — shouldn't happen given the filter above
        scored.push({
          text: r.payload.text,
          docName: doc.name,
          classCode: doc.classCode,
          page: r.payload.page,
          denseScore: r.score, // Qdrant returns cosine similarity directly
        });
      }
    } catch (error) {
      console.error("Qdrant search failed, falling back to Firestore scan for its candidates:", error);
      // Qdrant itself is down — those documents need the brute-force path
      // too this time, on top of whatever was already routed there.
      firestoreOnlyDocs = firestoreOnlyDocs.concat(qdrantDocs);
    }
  }

  const fallbackDocs = firestoreOnlyDocs;

  const idToken = getIdToken(request);
  for (const doc of fallbackDocs) {
    try {
      const chunkDocs = idToken
        ? await firestoreListCollection(
            idToken,
            `users/${context.userId}/enrollment/${doc.courseId}/resources/${doc.resourceId}/chunks`
          )
        : [];
      chunkDocs.forEach((chunkDoc) => {
        const data = chunkDoc.data;
        if (!Array.isArray(data.embedding)) return;
        scored.push({
          text: data.text as string,
          docName: doc.name,
          classCode: doc.classCode,
          page: typeof data.page === "number" ? data.page : undefined,
          denseScore: cosineSimilarity(queryEmbedding, data.embedding as number[]),
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

  // BM25 needs corpus-wide stats (avg length, per-term document frequency),
  // so it's computed once here over the whole candidate pool rather than
  // per-chunk during collection above. Normalized against the pool's own
  // top score so it combines on the same ~[0,1] scale as the dense
  // (cosine) component below.
  const bm25 = bm25Scores(query, scored.map((s) => s.text));
  const maxBm25 = Math.max(0, ...bm25);
  const withScore = scored.map((s, i) => ({
    ...s,
    // Hybrid score: dense (embedding) similarity weighted primary, sparse
    // (BM25) as a secondary boost for exact-term recall.
    score: 0.75 * s.denseScore + 0.25 * (maxBm25 > 0 ? bm25[i] / maxBm25 : 0),
  }));

  withScore.sort((a, b) => b.score - a.score);
  const candidates = withScore.filter((r) => r.score >= SIMILARITY_THRESHOLD).slice(0, HYBRID_CANDIDATE_POOL);

  if (candidates.length === 0) {
    return (
      "Nothing in the indexed documents is actually relevant to that query — don't guess from weak matches. Tell the student you couldn't find this in their materials." +
      alreadyReadNote
    );
  }

  // `candidates` is already sorted by hybrid score (dense+sparse) descending
  // from the .sort() above - this used to hand off to an LLM reranker
  // (qwen3:4b) for a second pass, but that call was pure overhead on every
  // single document search: the hybrid score is already a real relevance
  // signal, not a rough pre-filter, and the LLM pass added a full secondary-
  // box round trip (plus, confirmed separately, that specific model ignores
  // think:false at the weights level, so it was an unavoidably slow round
  // trip) for a reordering that empirically wasn't earning its cost. Straight
  // deterministic top-K slice now - faster, and one less network hop that
  // can fail.
  const relevant = candidates.slice(0, TOP_K_CHUNKS);

  return relevant
    .map((r, i) => {
      const pageNote = typeof r.page === "number" ? `, p.${r.page}` : "";
      return `[${i + 1}] From "${r.docName}" (${r.classCode}${pageNote}):\n${r.text}`;
    })
    .join("\n\n");
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
  request: NextRequest,
  context: ChatContext | undefined,
  title: string,
  markdown: string,
  courseId?: string
): Promise<{ result: string; file?: { name: string; url: string } }> {
  if (!context?.userId) {
    return { result: "Error: no student context available to save a file for." };
  }
  if (!title || !markdown) {
    return { result: "Error: both a title and content are required to create a PDF." };
  }

  // Only trust a courseId the student is actually enrolled in — same check
  // readDocument does — so this can't be used to write into an arbitrary
  // course's resources.
  const validCourseId = courseId && context.classes.some((c) => c.classId === courseId) ? courseId : undefined;

  try {
    if (validCourseId) {
      const idToken = getIdToken(request);
      if (!idToken) return { result: "Error: not authenticated." };

      const file = await generateAndUploadPdfToCourse(context.userId, validCourseId, title, markdown);
      const resourceId = await firestoreCreate(idToken, `users/${context.userId}/enrollment/${validCourseId}/resources`, {
        name: file.name,
        url: file.url,
        fileType: "pdf",
        category: "assignments",
        uploadedAt: new Date(),
        lastViewedAt: new Date(),
      });

      // Fire-and-forget, same as the manual-upload UI (fileUploadService.ts)
      // — not awaited so the chat reply doesn't wait on embedding, which can
      // take a while for a long exam.
      if (resourceId) {
        fetch(resolveInternalUrl(request, "/api/embed-document"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ userId: context.userId, courseId: validCourseId, resourceId }),
        }).catch((error) => console.error("Background indexing of generated PDF failed:", error));
      }

      return {
        result: `PDF created successfully: "${file.name}". It's been saved into this class's files (so it'll show up in Course Resources and can be found again later), and is ready for the student to download now.`,
        file: { name: file.name, url: file.url },
      };
    }

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
  request: NextRequest,
  context: ChatContext | undefined,
  currentSessionId: string | undefined,
  searchQuery: string
): Promise<string> {
  if (!context?.userId) {
    return "Error: no student context available.";
  }

  try {
    const idToken = getIdToken(request);
    const sessionDocs = idToken
      ? await firestoreRunQuery(idToken, `users/${context.userId}`, "chatSessions", {
          orderByField: "updatedAt",
          direction: "DESCENDING",
          limit: MAX_PAST_CHATS_SCANNED,
        })
      : [];

    const candidates = sessionDocs
      .filter((d) => d.id !== currentSessionId)
      .map((d) => {
        const data = d.data;
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

        let updatedAt: Date | undefined;
        if (typeof data.updatedAt === "string") {
          const d = new Date(data.updatedAt);
          updatedAt = Number.isNaN(d.getTime()) ? undefined : d;
        } else {
          updatedAt = (data.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.();
        }

        return {
          title: typeof data.title === "string" && data.title ? data.title : "Untitled chat",
          searchableText,
          updatedAt,
        };
      })
      .filter((c) => c.searchableText);

    if (candidates.length === 0) {
      return "No other past conversations with enough content to search yet.";
    }

    const bm25 = bm25Scores(searchQuery, candidates.map((c) => `${c.title} ${c.searchableText}`));
    const scored = candidates
      .map((c, i) => ({ ...c, score: bm25[i] }))
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

type GeneratedStudySet = { kind: "flashcard" | "quiz"; id: string; courseId: string; name: string };

// The stored sourceDocKey (flashcardSets/quizSets schema) is the raw MinIO
// object key, not the download URL — matches the ?key= extraction the
// client pages already do (flashcards/page.tsx's extractStorageKey) so a
// chat-created set looks identical to one created from the course page.
function storageKeyFromDocUrl(url: string): string {
  return decodeURIComponent(url.split("key=")[1] ?? "");
}

// Shares the exact same generation logic as the standalone
// generate-flashcards/generate-quiz routes (see flashcardGeneration.ts/
// quizGeneration.ts) and the same document-reading path as the
// read_document tool above — just persists straight to Firestore instead of
// handing the result back to a client page to save. New sets are always
// created fresh (never merged into an existing set for the same document,
// unlike the course-page flow) — simpler, and a student re-asking the chat
// for "more flashcards" from the same doc reasonably expects a new set.
async function createFlashcardsFromDocument(
  request: NextRequest,
  context: ChatContext | undefined,
  primaryTarget: OllamaTarget,
  modelKey: string | undefined,
  courseId: string,
  documentName: string
): Promise<{ result: string; studySet?: GeneratedStudySet }> {
  if (!context?.userId) {
    return { result: "Error: no student context available to save flashcards for." };
  }

  const idToken = getIdToken(request);
  if (!idToken) {
    return { result: "Error: not authenticated." };
  }

  const readResult = await readDocument(request, context, courseId, documentName);
  if (!readResult.doc) {
    return { result: readResult.text };
  }

  try {
    const generated = await generateFlashcardsWithRetry(readResult.text, primaryTarget.baseUrl, modelKey);
    const collectionPath = `users/${context.userId}/enrollment/${courseId}/flashcardSets`;
    const docId = await firestoreCreate(idToken, collectionPath, {
      name: generated.topicName,
      sourceDocKey: storageKeyFromDocUrl(readResult.doc.url),
      cards: generated.questions,
      pinned: true,
      visibility: "private",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (!docId) {
      return { result: "Error: the flashcards were generated but failed to save. Tell the student and offer to try again." };
    }

    return {
      result: `Created a flashcard set called "${generated.topicName}" with ${generated.questions.length} cards from "${readResult.doc.name}". It's saved to this class's flashcards and ready to study — a link has been shared with the student, don't repeat the raw questions/answers back in your reply unless asked.`,
      studySet: { kind: "flashcard", id: docId, courseId, name: generated.topicName },
    };
  } catch (error) {
    console.error("create_flashcards tool failed:", error);
    return { result: "Error: failed to generate flashcards from that document. Tell the student and offer to try again." };
  }
}

async function createQuizFromDocument(
  request: NextRequest,
  context: ChatContext | undefined,
  primaryTarget: OllamaTarget,
  modelKey: string | undefined,
  courseId: string,
  documentName: string,
  questionCount: number | undefined
): Promise<{ result: string; studySet?: GeneratedStudySet }> {
  if (!context?.userId) {
    return { result: "Error: no student context available to save a quiz for." };
  }

  const idToken = getIdToken(request);
  if (!idToken) {
    return { result: "Error: not authenticated." };
  }

  const readResult = await readDocument(request, context, courseId, documentName);
  if (!readResult.doc) {
    return { result: readResult.text };
  }

  const count = Math.min(20, Math.max(1, Math.round(questionCount ?? 10)));

  try {
    const generated = await generateQuizWithValidation(
      readResult.text,
      count,
      { multipleChoice: true, trueFalse: true, matching: false },
      primaryTarget.baseUrl,
      modelKey
    );
    const collectionPath = `users/${context.userId}/enrollment/${courseId}/quizSets`;
    const docId = await firestoreCreate(idToken, collectionPath, {
      name: generated.topicName,
      sourceDocKey: storageKeyFromDocUrl(readResult.doc.url),
      questions: generated.questions,
      questionTypes: { multipleChoice: true, trueFalse: true, matching: false },
      questionCount: generated.questions.length,
      pinned: true,
      visibility: "private",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (!docId) {
      return { result: "Error: the quiz was generated but failed to save. Tell the student and offer to try again." };
    }

    return {
      result: `Created a quiz called "${generated.topicName}" with ${generated.questions.length} questions from "${readResult.doc.name}". It's saved to this class's quizzes and ready to take — a link has been shared with the student, don't repeat the raw questions back in your reply unless asked.`,
      studySet: { kind: "quiz", id: docId, courseId, name: generated.topicName },
    };
  } catch (error) {
    console.error("create_quiz tool failed:", error);
    return { result: "Error: failed to generate a quiz from that document. Tell the student and offer to try again." };
  }
}

const CALENDAR_EVENTS_COLLECTION = (userId: string) => `users/${userId}/events`;
const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

// The app has no per-user timezone concept anywhere yet — AddEventModal.tsx
// (the only other writer of this collection) builds its UTC ISO string from
// a bare "YYYY-MM-DDTHH:MM" using whatever timezone the browser is in, and
// buildSystemPrompt's own "Current date/time" line for the model is
// server-local time. This matches both of those exactly (server-local,
// since there's no browser here) rather than inventing a new convention.
function parseLocalDateTime(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

type CalendarEventFields = {
  title: string;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  tone: string;
  source: "local";
};

async function listCalendarEventsTool(request: NextRequest, context: ChatContext | undefined): Promise<string> {
  if (!context?.userId) return "Error: no student context available.";
  const idToken = getIdToken(request);
  if (!idToken) return "Error: not authenticated.";

  try {
    const events = await firestoreListCollection(idToken, CALENDAR_EVENTS_COLLECTION(context.userId));
    if (events.length === 0) return "The student has no events on their Catalyst calendar yet.";

    const rows = events
      .map((e) => ({ id: e.id, ...(e.data as CalendarEventFields) }))
      .filter((e) => typeof e.startTime === "string" && typeof e.title === "string")
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return rows
      .map((e) => {
        const when = e.allDay ? `${e.startTime.slice(0, 10)} (all day)` : `${e.startTime} to ${e.endTime}`;
        const extras = [e.location ? `location: ${e.location}` : null, e.description ? `notes: ${e.description}` : null]
          .filter(Boolean)
          .join(", ");
        return `[id: ${e.id}] "${e.title}" — ${when}${extras ? ` (${extras})` : ""}`;
      })
      .join("\n");
  } catch (error) {
    console.error("list_calendar_events tool failed:", error);
    return "Error: couldn't load the student's calendar right now.";
  }
}

async function createCalendarEventTool(
  request: NextRequest,
  context: ChatContext | undefined,
  args: { title?: string; startDateTime?: string; endDateTime?: string; allDay?: boolean; description?: string; location?: string }
): Promise<string> {
  if (!context?.userId) return "Error: no student context available to save an event for.";
  const idToken = getIdToken(request);
  if (!idToken) return "Error: not authenticated.";
  if (!args.title || !args.startDateTime) return "Error: an event needs at least a title and a start date/time.";

  const allDay = Boolean(args.allDay);
  let startTime: string;
  let endTime: string;

  if (allDay) {
    const datePart = args.startDateTime.slice(0, 10);
    const start = parseLocalDateTime(`${datePart}T00:00:00`);
    const end = parseLocalDateTime(`${datePart}T23:59:59`);
    if (!start || !end) return `Error: couldn't understand the date "${args.startDateTime}".`;
    startTime = start.toISOString();
    endTime = end.toISOString();
  } else {
    const start = parseLocalDateTime(args.startDateTime);
    if (!start) return `Error: couldn't understand the start date/time "${args.startDateTime}" — use YYYY-MM-DDTHH:MM.`;
    const end = args.endDateTime ? parseLocalDateTime(args.endDateTime) : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
    if (!end) return `Error: couldn't understand the end date/time "${args.endDateTime}" — use YYYY-MM-DDTHH:MM.`;
    startTime = start.toISOString();
    endTime = end.toISOString();
  }

  try {
    const docId = await firestoreCreate(idToken, CALENDAR_EVENTS_COLLECTION(context.userId), {
      title: args.title,
      description: args.description || null,
      location: args.location || null,
      startTime,
      endTime,
      allDay,
      tone: "sage",
      source: "local",
    } satisfies CalendarEventFields);

    if (!docId) return "Error: the event was created but failed to save. Tell the student and offer to try again.";
    return `Added "${args.title}" to the student's calendar. It's saved and visible on their Calendar page now.`;
  } catch (error) {
    console.error("create_calendar_event tool failed:", error);
    return "Error: failed to create the calendar event. Tell the student and offer to try again.";
  }
}

async function updateCalendarEventTool(
  request: NextRequest,
  context: ChatContext | undefined,
  args: {
    eventId?: string;
    title?: string;
    startDateTime?: string;
    endDateTime?: string;
    allDay?: boolean;
    description?: string;
    location?: string;
  }
): Promise<string> {
  if (!context?.userId) return "Error: no student context available.";
  const idToken = getIdToken(request);
  if (!idToken) return "Error: not authenticated.";
  if (!args.eventId) return "Error: an eventId is required — call list_calendar_events first to find it.";

  const fields: Record<string, unknown> = {};
  if (args.title) fields.title = args.title;
  if (args.description !== undefined) fields.description = args.description || null;
  if (args.location !== undefined) fields.location = args.location || null;
  if (typeof args.allDay === "boolean") fields.allDay = args.allDay;
  if (args.startDateTime) {
    const start = parseLocalDateTime(args.startDateTime);
    if (!start) return `Error: couldn't understand the start date/time "${args.startDateTime}" — use YYYY-MM-DDTHH:MM.`;
    fields.startTime = start.toISOString();
  }
  if (args.endDateTime) {
    const end = parseLocalDateTime(args.endDateTime);
    if (!end) return `Error: couldn't understand the end date/time "${args.endDateTime}" — use YYYY-MM-DDTHH:MM.`;
    fields.endTime = end.toISOString();
  }
  if (Object.keys(fields).length === 0) return "Error: nothing to update was specified.";

  const ok = await firestoreUpdate(idToken, CALENDAR_EVENTS_COLLECTION(context.userId), args.eventId, fields);
  if (!ok) return "Error: failed to update that event — it may not exist. Tell the student and offer to try again.";
  return "Updated the event. Changes are saved and visible on the student's Calendar page now.";
}

async function deleteCalendarEventTool(
  request: NextRequest,
  context: ChatContext | undefined,
  eventId: string | undefined
): Promise<string> {
  if (!context?.userId) return "Error: no student context available.";
  const idToken = getIdToken(request);
  if (!idToken) return "Error: not authenticated.";
  if (!eventId) return "Error: an eventId is required — call list_calendar_events first to find it.";

  const ok = await firestoreDelete(idToken, CALENDAR_EVENTS_COLLECTION(context.userId), eventId);
  if (!ok) return "Error: failed to remove that event — it may not exist. Tell the student and offer to try again.";
  return "Removed the event from the student's calendar.";
}

// Both chat models have shown this bug: even with think:false, they
// sometimes still emit raw chain-of-thought as plain content, ending in a
// stray closing </think> tag with no matching opening tag (qwen3:30b-a3b -
// confirmed live, reproduced 4/4 tries during model research; gpt-oss:20b -
// confirmed live 2026-08-11, same tag-delimited shape). A separate,
// non-tag-delimited gpt-oss:20b leak has also been seen once (a document-
// summarization reply) - that shape isn't catchable by matching a
// delimiter and isn't handled here.
//
// Buffers a round's output until either the tag shows up (then discards
// everything up to and including it, releasing only the real answer from
// there on) or a generous cap is hit without ever seeing it (then just
// releases the buffer as-is - a model that isn't leaking this round
// shouldn't be held back indefinitely). The client never sees raw
// chain-of-thought at all, not even briefly - the trade-off (confirmed as
// the preferred one live 2026-08-11, over an earlier live-stream-then-
// correct version that let a leak flash on screen before being wiped) is
// that the reply bubble shows a plain "Thinking..."/spinner status with
// nothing streaming until this resolves, instead of token-by-token
// streaming from the first token. Only worth paying that cost for the two
// models actually confirmed to leak (qwen3A3b, and fastResident/gpt-oss:20b
// per this same 2026-08-11 finding) - applying it to every model
// unconditionally (as it was before the 2026-08-13 model-selection
// settings added museGlimmer/nemotron/qwenCoder) meant those three never
// appeared to stream at all: any response short enough to stay under the
// cap, with no </think> tag to trigger early, sat fully buffered until the
// round finished and flush() released it all at once. See
// deltaHandlerForModel below for the model-scoped choice.
//
// Known remaining gap (confirmed live 2026-08-14, a verbose pre-tool-call
// reasoning block that ran long before finally emitting </think>): if the
// leak itself is long enough to cross this cap before the tag ever shows
// up, the cap-hit branch above releases the still-unstripped buffer raw —
// and once that's streamed to the client there's no undoing it, even
// though the tag (and discard(), if it turns out to be a tool-call round)
// would have caught it a moment later. Raised from 8000 to cut down how
// often real leaked reasoning is long enough to hit this, at the cost of
// a longer "Thinking..." wait before an unusually long *legitimate* reply
// starts streaming. Doesn't close the gap entirely — just narrows it.
const THINK_STRIP_BUFFER_CAP = 20000;

function wrapDeltaForThinkStripping(onDelta: (text: string) => void): {
  handleDelta: (text: string) => void;
  flush: () => void;
  discard: () => void;
} {
  let buffer = "";
  let resolved = false;

  function handleDelta(text: string) {
    if (resolved) {
      onDelta(text);
      return;
    }

    buffer += text;
    const closeIndex = buffer.indexOf(THINK_CLOSE_TAG);

    if (closeIndex !== -1) {
      resolved = true;
      const remainder = buffer.slice(closeIndex + THINK_CLOSE_TAG.length);
      if (remainder) onDelta(remainder);
      return;
    }

    if (buffer.length >= THINK_STRIP_BUFFER_CAP) {
      resolved = true;
      onDelta(buffer);
    }
  }

  // Call once the round that used handleDelta finishes AND turns out to be
  // a real answer (no tool calls) - releases whatever's still sitting in
  // the buffer. That's the common case: a normal reply that never
  // contained </think> and never crossed the cap, so neither branch above
  // ever fired on its own (confirmed live 2026-08-11 as a bubble that sat
  // empty far longer than it should have, before this call was added).
  function flush() {
    if (!resolved && buffer) {
      resolved = true;
      onDelta(buffer);
    }
  }

  // Call instead of flush() when the round turns out to be a tool-call
  // round - its buffered content (ordinary pre-tool-call chatter, or a
  // leak) was never a real answer either way, so it's dropped rather than
  // ever reaching the client (see the tool-call branch in the round loop).
  function discard() {
    resolved = true;
  }

  return { handleDelta, flush, discard };
}

// The two models with a confirmed <think>-leak (see THINK_STRIP_BUFFER_CAP's
// comment) - every other model streams straight through via
// passthroughDelta below instead.
const MODELS_KNOWN_TO_LEAK_THINKING = ["qwen3A3b", "fastResident"];

// No buffering, no delay - text reaches the client the instant Ollama
// produces it. flush/discard are no-ops since there's never anything held
// back to release or drop.
function passthroughDelta(onDelta: (text: string) => void): {
  handleDelta: (text: string) => void;
  flush: () => void;
  discard: () => void;
} {
  return { handleDelta: onDelta, flush: () => {}, discard: () => {} };
}

function deltaHandlerForModel(modelKey: string | undefined, onDelta: (text: string) => void) {
  return MODELS_KNOWN_TO_LEAK_THINKING.includes(modelKey ?? "")
    ? wrapDeltaForThinkStripping(onDelta)
    : passthroughDelta(onDelta);
}

const OLLAMA_PS_TIMEOUT_MS = 5000; // this only decides which status label to show - never worth blocking the real request over

// Whether modelName is already resident on Ollama right now, via /api/ps
// (Ollama's "list currently loaded models" endpoint). Used purely to pick
// the right status label before generating (see the "Cold booting
// model..."/"Sending your question..." send below) - fails open to `true`
// (the non-cold-boot label) on any error, since a wrong guess here is only
// a cosmetic mislabel, never worth surfacing as a real error or delaying
// the actual chat request over.
async function isModelLoaded(baseUrl: string, modelName: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_PS_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/ps`, {
      headers: { Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}` },
      signal: controller.signal,
    });
    if (!response.ok) return true;
    const data = await response.json();
    const loadedModels: unknown[] = Array.isArray(data?.models) ? data.models : [];
    return loadedModels.some((m) => {
      const entry = m as { name?: string; model?: string };
      return entry.name === modelName || entry.model === modelName;
    });
  } catch {
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

// keep_alive controls how long Ollama holds a model in VRAM after a
// request finishes idle, before evicting it (Ollama's own default is a
// short few minutes). -1 means never auto-evict — reserved for the fast
// model, which is meant to stay resident always (see OllamaTarget's own
// comment) — a duration string bounds how long the quality model lingers
// after use instead of camping in VRAM indefinitely, so it still frees up
// for OCR/vision after real disuse. Omitted entirely for anything else
// (compaction, clarification, embeddings' own explicit -1) — left at
// Ollama's default rather than guessing a policy for models out of scope
// here.
type OllamaTarget = { baseUrl: string; model: string; keepAlive?: number | string };

async function callOllama(
  messages: unknown[],
  tools?: unknown[],
  temperature = CHAT_TEMPERATURE,
  target: OllamaTarget = {
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
        think: false,
        options: { temperature },
        ...(target.keepAlive !== undefined ? { keep_alive: target.keepAlive } : {}),
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
  target: OllamaTarget,
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
        // Explicit, not omitted - this app previously never set this field
        // anywhere, relying entirely on Ollama's implicit per-model default.
        // Most models here (gpt-oss:20b, qwen3-vl) correctly suppress
        // thinking once this is actually set; qwen3:30b-a3b still leaks
        // sometimes even with this set (see wrapDeltaForThinkStripping,
        // still needed as a safety net regardless); qwen3:4b ignores it
        // entirely at the model-weights level, confirmed via direct
        // testing - not fixable from here, see stripThinkLeak call sites
        // for the actual mitigation used for that one.
        think: false,
        options: { temperature },
        ...(target.keepAlive !== undefined ? { keep_alive: target.keepAlive } : {}),
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
    // Which target to use is a "is secondary even configured" choice
    // (orthogonal to reachability, kept as the existing OR-chain); which URL
    // to actually hit for that chosen target is then resolved LAN-vs-fallback.
    const usingSecondary = Boolean(process.env.OLLAMA_SECONDARY_URL);
    const configuredUrl = process.env.OLLAMA_SECONDARY_URL || process.env.OLLAMA_PRIMARY_URL || "";
    const configuredFallback = usingSecondary ? process.env.OLLAMA_SECONDARY_FALLBACK_URL : process.env.OLLAMA_PRIMARY_FALLBACK_URL;
    const compactionBaseUrl = configuredUrl ? await resolveOllamaBaseUrl(configuredUrl, configuredFallback) : "";

    const response = await callOllama(summarizeMessages, undefined, 0.2, {
      baseUrl: compactionBaseUrl,
      model: process.env.OLLAMA_SUMMARY_MODEL || process.env.OLLAMA_MODEL || "gpt-oss:20b",
    });
    if (!response.ok) throw new Error(`Summarization failed (${response.status})`);

    const data = await response.json();
    warnIfSlowGeneration(
      compactionBaseUrl,
      process.env.OLLAMA_SUMMARY_MODEL || process.env.OLLAMA_MODEL || "gpt-oss:20b",
      data?.eval_count,
      data?.eval_duration
    );
    const newSummary = stripThinkLeak(data?.message?.content ?? "");
    if (!newSummary) throw new Error("Summarization returned no content");

    return { summary: newSummary, summarizedCount: summarizedCount + toFold.length };
  } catch (error) {
    console.error("Conversation compaction failed, continuing without it:", error);
    return { summary, summarizedCount };
  }
}

// ── Server-side chat persistence ──────────────────────────────────────────
// A reply must survive the user navigating away or closing the tab before
// it finishes, so this route (not the browser) owns saving the transcript.
// It writes at the start of a turn (so the question isn't lost even if
// generation never finishes) and again at the end (in the stream's
// `finally`, which — unlike the response stream itself — keeps running
// even after the client has disconnected; see the Ollama calls above,
// which are never tied to the incoming request's abort signal either).
const CHAT_SESSION_RETENTION_DAYS = 30;

type PersistTarget = {
  idToken: string;
  collectionPath: string;
  docId: string;
  isNewMainSession: boolean;
  messages: StoredChatMessage[];
};

function nextMessageId(existing: StoredChatMessage[]): number {
  return existing.reduce((max, m) => Math.max(max, m.id), 0) + 1;
}

// Creates/updates the doc with the new user turn + an empty assistant
// placeholder, generating:true. Returns null (persistence skipped, never
// blocks generation) if there's no usable ID token — e.g. the session
// cookie is present but not forwardable for some reason.
async function startChatPersistence(params: {
  request: NextRequest;
  uid: string;
  panelContextKey?: string;
  currentSessionId?: string;
  latestUserContent: string;
  summary: string;
  summarizedCount: number;
}): Promise<PersistTarget | null> {
  const idToken = getIdToken(params.request);
  if (!idToken) return null;

  const userMsg = (id: number): StoredChatMessage => ({ id, role: "user", text: params.latestUserContent });
  const placeholder = (id: number): StoredChatMessage => ({ id, role: "assistant", text: "" });

  if (params.panelContextKey) {
    const collectionPath = `users/${params.uid}/panelChatSessions`;
    const docId = params.panelContextKey;
    const existing = await firestoreGet(idToken, collectionPath, docId);
    const priorMessages = Array.isArray(existing?.messages) ? (existing!.messages as StoredChatMessage[]) : [];
    const id = nextMessageId(priorMessages);
    const messages = [...priorMessages, userMsg(id), placeholder(id + 1)];
    await firestoreUpdate(idToken, collectionPath, docId, { messages, generating: true, updatedAt: new Date() });
    return { idToken, collectionPath, docId, isNewMainSession: false, messages };
  }

  const collectionPath = `users/${params.uid}/chatSessions`;

  if (params.currentSessionId) {
    const docId = params.currentSessionId;
    const existing = await firestoreGet(idToken, collectionPath, docId);
    const priorMessages = Array.isArray(existing?.messages) ? (existing!.messages as StoredChatMessage[]) : [];
    const id = nextMessageId(priorMessages);
    const messages = [...priorMessages, userMsg(id), placeholder(id + 1)];
    await firestoreUpdate(idToken, collectionPath, docId, {
      messages,
      summary: params.summary,
      summarizedCount: params.summarizedCount,
      generating: true,
      updatedAt: new Date(),
    });
    return { idToken, collectionPath, docId, isNewMainSession: false, messages };
  }

  const messages = [userMsg(1), placeholder(2)];
  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + CHAT_SESSION_RETENTION_DAYS);
  const docId = await firestoreCreate(idToken, collectionPath, {
    messages,
    summary: params.summary,
    summarizedCount: params.summarizedCount,
    title: deriveChatTitle(params.latestUserContent),
    pinned: false,
    generating: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    expireAt,
  });
  if (!docId) return null;
  return { idToken, collectionPath, docId, isNewMainSession: true, messages };
}

// Fills in the placeholder assistant message with the finished (or errored)
// reply and clears generating. Never throws — a persistence failure must
// not surface as a chat error to whatever client might still be attached.
async function finishChatPersistence(
  target: PersistTarget,
  final: {
    text: string;
    documentsRead?: string[];
    generatedFiles?: { name: string; url: string }[];
    generatedStudySets?: GeneratedStudySet[];
    summary?: string;
    summarizedCount?: number;
  }
): Promise<void> {
  try {
    const messages = [...target.messages];
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = {
      ...last,
      text: final.text,
      ...(final.documentsRead?.length ? { documentsRead: final.documentsRead } : {}),
      ...(final.generatedFiles?.length ? { generatedFiles: final.generatedFiles } : {}),
      ...(final.generatedStudySets?.length ? { generatedStudySets: final.generatedStudySets } : {}),
    };

    const fields: Record<string, unknown> = { messages, generating: false, updatedAt: new Date() };
    if (final.summary !== undefined) fields.summary = final.summary;
    if (final.summarizedCount !== undefined) fields.summarizedCount = final.summarizedCount;

    await firestoreUpdate(target.idToken, target.collectionPath, target.docId, fields);
  } catch (error) {
    console.error("Failed to persist finished chat turn:", error);
  }
}

// Throttled mid-generation write of the placeholder's growing text, so
// anyone watching this session live via subscribeToChatSession/
// subscribeToPanelChatSession (e.g. reopened from the history panel mid-
// reply) sees the reply streaming in rather than a static "generating"
// state until the whole thing finishes. Deliberately NOT awaited by its
// caller (see recordDelta in the streaming loop below) — a Firestore round
// trip must never add latency to the response the original sender is
// already watching live over the HTTP stream itself. generating stays
// true; only finishChatPersistence flips it false.
async function persistPartialReply(target: PersistTarget, text: string): Promise<void> {
  try {
    const messages = [...target.messages];
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = { ...last, text };
    await firestoreUpdate(target.idToken, target.collectionPath, target.docId, { messages });
  } catch (error) {
    console.error("Failed to persist partial chat reply:", error);
  }
}

// Response protocol (newline-delimited JSON, one object per line):
//   {"type":"delta","text":"..."}                                — append to the reply
//   {"type":"tool","name":"search_documents"}                    — a tool started running
//   {"type":"done","documentsRead":[...],"generatedFiles":[...],"generatedStudySets":[...],"summary":"...","summarizedCount":N}
//   {"type":"error","error":"..."}
//   {"type":"session","id":"..."}                                 — new session's ID (first turn only)
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
    pageContext,
    panelContextKey,
    modelKey,
    extraTools,
  } = (await request.json().catch(() => ({}))) as {
    messages?: ChatMessage[];
    context?: ChatContext;
    summary?: string;
    summarizedCount?: number;
    currentSessionId?: string;
    pageContext?: unknown;
    panelContextKey?: string;
    // Client-stored preference (see src/library/chatMode.ts's
    // getEffectiveModelKey), sent with every request - the server has no
    // independent copy of this, it just trusts whatever the client sends
    // per-request, same as summary/context, resolving it through a fixed
    // server-side allow-list (see ollamaClient.ts's resolveModelFromKey)
    // rather than trusting a raw model string from the client.
    modelKey?: string;
    // Opt-in for tools that aren't always necessary (web/YouTube search) -
    // off by default. Fewer tools in the schema on every request means less
    // for the model to choose between (real tool-selection accuracy cost,
    // not just prompt size) and less latency, for the common case where a
    // student's question is answerable from their own course materials.
    extraTools?: boolean;
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

  // pageContext (flashcard/quiz sidebar) is optional and only sent by the
  // contextual Catalyst panel — validate its shape and confirm the course it
  // references is actually one the authenticated user is enrolled in, same
  // as the courseId inside `context` above.
  let validatedPageContext: PageContext | undefined;
  if (pageContext !== undefined) {
    const parsed = pageContextSchema.safeParse(pageContext);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid pageContext", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // learn_questions has no single courseId (a session spans every active
    // course), so the enrollment check only applies to the flashcard/quiz/
    // page_text kinds, which are scoped to one course. page_text's courseId
    // is itself optional (see contextualAi.ts) — pages that aren't about
    // one specific course (classes list, advising) omit it entirely, and
    // there's nothing course-private to authorize in that case since the
    // briefing is built from the student's own data either way.
    if (parsed.data.kind !== "learn_questions" && parsed.data.courseId !== undefined) {
      const enrolledCourseIds = (context?.classes || []).map((c) => c.classId);
      if (!enrolledCourseIds.includes(parsed.data.courseId)) {
        return NextResponse.json({ error: "pageContext.courseId not in user context" }, { status: 403 });
      }
    }

    validatedPageContext = parsed.data;
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
  // modelKey picks which of the 5 models (see chatMode.ts's TaskModelKey/
  // UnifiedModelKey) actually handles this chat turn - either the
  // student's per-task "AI Chat model" choice, or the unified pick if
  // they've turned on "Reduce cold boots" (see getEffectiveModelKey).
  // Whichever one it is boots immediately and then stays resident
  // indefinitely (FAST_MODEL_KEEP_ALIVE), until the student picks a
  // different one - not just when it happens to be "fastResident". Every
  // key other than "fastResident" itself still competes with the
  // vision/OCR model for VRAM while it's the one loaded - see the
  // gatekeeper proxy in front of Ollama for the eviction mechanics.
  const primaryTarget: OllamaTarget = {
    baseUrl: await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL),
    model: resolveModelFromKey(modelKey),
    keepAlive: FAST_MODEL_KEEP_ALIVE,
  };
  const stream = new ReadableStream({
    async start(controller) {
      // Swallows enqueue failures (e.g. the client already disconnected) so
      // a dead connection doesn't abort generation partway through — the
      // model keeps producing tokens and finishChatPersistence below still
      // gets the complete answer, even though nobody's listening anymore.
      function send(obj: unknown) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // client gone — ignore, generation continues regardless
        }
      }

      let studentProfile: StudentProfile = { summary: "", messageCount: 0 };
      const documentsRead: string[] = [];
      const generatedFiles: { name: string; url: string }[] = [];
      const generatedStudySets: GeneratedStudySet[] = [];
      let persistTarget: PersistTarget | null = null;
      // Accumulates the same post-think-stripping text actually sent to the
      // live client, so a resumed viewer's partial text always matches what
      // the original sender saw — never the raw pre-strip buffer.
      let liveReplyText = "";
      let lastPartialPersistAt = 0;
      let hasPersistedFirstChunk = false;
      const PARTIAL_PERSIST_INTERVAL_MS = 800;

      // Fire-and-forget, throttled — persistTarget is captured by reference
      // (assigned below, after this closure is created) so it's read at
      // call time, once startChatPersistence has actually resolved. The
      // very first write skips the throttle entirely — otherwise anyone
      // watching this session live (a resumed/history-panel view) sits on a
      // blank placeholder for up to the full interval even after real text
      // has already started arriving.
      function persistLiveReplyThrottled() {
        if (!persistTarget) return;
        const now = Date.now();
        if (hasPersistedFirstChunk && now - lastPartialPersistAt < PARTIAL_PERSIST_INTERVAL_MS) return;
        hasPersistedFirstChunk = true;
        lastPartialPersistAt = now;
        persistPartialReply(persistTarget, liveReplyText).catch(() => {});
      }
      function recordDeltaForPersistence(delta: string) {
        liveReplyText += delta;
        persistLiveReplyThrottled();
      }

      // Fresh buffer state per round (each call site invokes this once per
      // streamOllamaRound call) - see deltaHandlerForModel above for which
      // models actually get buffered vs. stream straight through. onDelta
      // only ever fires with already-clean text, so nothing downstream of
      // it - including recordDeltaForPersistence - ever sees raw
      // chain-of-thought either.
      const makeDeltaHandler = () => {
        const base = (delta: string) => {
          send({ type: "delta", text: delta });
          recordDeltaForPersistence(delta);
        };
        return deltaHandlerForModel(modelKey, base);
      };
      let finalAnswerText: string | null = null;
      // Persisted alongside the finished reply below; defaults to the raw
      // incoming values and is refreshed once compactionPromise resolves
      // (see the "done" sends below) so an error before that point still
      // persists something sane rather than nothing.
      let persistedSummary = incomingSummary ?? "";
      let persistedSummarizedCount = incomingSummarizedCount ?? 0;

      try {
        // Sent before any of the (potentially slow) work below starts —
        // this is what actually ends the client's "Connecting..." state,
        // since a streamed Response's headers don't reach the client until
        // the first chunk is enqueued. Without this, everything from here
        // through the model's first token happened in total silence.
        send({ type: "status", label: "Loading your classes and profile..." });

        // Compaction runs in the background rather than gating this turn:
        // qwen3:4b's own thinking preamble (~5s, see stripThinkLeak's
        // comment) made every compaction-triggering turn sit in total
        // silence before the primary model even started streaming. Nothing
        // this turn actually needs the NEW summary — using last turn's
        // summary/summarizedCount to build the conversation below just
        // means the raw tail folds in one turn later than it could have,
        // which only affects context size, not correctness. The refreshed
        // values are awaited later, right before they're reported in the
        // "done" event (and used for persistence), by which point the
        // primary model's own (often longer) response has usually already
        // absorbed the wait.
        const compactionPromise = compactIfNeeded(messages, incomingSummary ?? "", incomingSummarizedCount ?? 0);

        // Clarification and persisting this turn's user message run
        // alongside profile-loading (not after) so their round-trips are
        // hidden behind that rather than adding their own serial latency in
        // front of every response. Clarification itself is skipped outright
        // for the always-resident "fastResident" key: it's designed
        // fail-open/additive (see queryClarifier.ts), so skipping it just
        // means the raw message goes to the primary model unclarified, same
        // as any other message this feature declines to touch - a real (if
        // now modest, since the llama3.2:3b swap) latency + one fewer
        // network round trip saved for students who've explicitly opted
        // into the fastest model.
        const [loadedProfile, clarifiedIntent, startedPersist] = await Promise.all([
          context?.userId ? getStudentProfile(context.userId, getIdToken(request) ?? undefined) : Promise.resolve(studentProfile),
          modelKey !== "fastResident" && typeof latestMessage?.content === "string"
            ? clarifyUserQuery(latestMessage.content)
            : Promise.resolve(null),
          typeof latestMessage?.content === "string"
            ? startChatPersistence({
                request,
                uid: auth.uid,
                panelContextKey,
                currentSessionId,
                latestUserContent: latestMessage.content,
                summary: incomingSummary ?? "",
                summarizedCount: incomingSummarizedCount ?? 0,
              }).catch((error) => {
                console.error("Failed to persist chat turn start:", error);
                return null;
              })
            : Promise.resolve(null),
        ]);
        studentProfile = loadedProfile;
        persistTarget = startedPersist;
        if (persistTarget?.isNewMainSession) {
          send({ type: "session", id: persistTarget.docId });
        }

        const summary = incomingSummary ?? "";
        const summarizedCount = incomingSummarizedCount ?? 0;
        const conversation: any[] = [
          { role: "system", content: buildSystemPrompt(context, studentProfile.summary, false, clarifiedIntent) },
          ...(summary ? [{ role: "system", content: `Summary of earlier conversation:\n${summary}` }] : []),
          ...(validatedPageContext ? [{ role: "system", content: buildPageContextPrompt(validatedPageContext) }] : []),
          ...messages.slice(summarizedCount),
        ];
        const tools = [
          LIST_CLASSES_TOOL,
          SEARCH_DOCUMENTS_TOOL,
          READ_DOCUMENT_TOOL,
          CREATE_PDF_TOOL,
          CREATE_FLASHCARDS_TOOL,
          CREATE_QUIZ_TOOL,
          LIST_CALENDAR_EVENTS_TOOL,
          CREATE_CALENDAR_EVENT_TOOL,
          UPDATE_CALENDAR_EVENT_TOOL,
          DELETE_CALENDAR_EVENT_TOOL,
          RECALL_PAST_CHAT_TOOL,
          // Opt-in only (see extraTools in the request body type above) -
          // these two are the only tools that reach outside the student's
          // own course materials, and aren't needed for most questions.
          ...(extraTools ? [WEB_SEARCH_TOOL, YOUTUBE_SEARCH_TOOL] : []),
        ];

        let finished = false;
        let emptyRoundRetries = 0;
        let anyToolCalled = false;
        const documentsReadThisTurn: { courseId: string; resourceId: string; name: string }[] = [];

        // The model's first token can legitimately take a while (cold model
        // load after idle — see OLLAMA_TIMEOUT_MS), so this is the last
        // status update before either a real answer or a tool call starts
        // streaming in on its own. isModelLoaded is a best-effort check
        // (fails open to the non-cold-boot label on any error) purely so a
        // student switching models on the settings page sees an honest
        // "this is going to take a bit" label instead of the generic one.
        const modelAlreadyLoaded = await isModelLoaded(primaryTarget.baseUrl, primaryTarget.model);
        send({
          type: "status",
          label: modelAlreadyLoaded
            ? "Sending your question to the AI model..."
            : "Cold booting model...",
        });

        for (let round = 0; round < MAX_TOOL_ROUNDS && !finished; round++) {
          const { handleDelta, flush, discard } = makeDeltaHandler();
          const { content, toolCalls, rawMessage } = await streamOllamaRound(
            conversation,
            tools,
            CHAT_TEMPERATURE,
            primaryTarget,
            handleDelta
          );

          if (toolCalls && toolCalls.length > 0) {
            // A tool-call round must never leave visible/persisted text
            // behind — its buffered content (ordinary pre-tool-call
            // chatter, or a leak that never produces a closing tag because
            // the round ends in a tool call instead of an answer) was never
            // a real answer either way, so it's dropped rather than
            // flushed. Confirmed live: flushing it regardless of tool calls
            // (the buffer's contents reaching the client either way) is
            // what made a reply look like it was "thinking twice" — once
            // for this round's stray content, again for the next round's
            // real one.
            discard();
            if (!anyToolCalled) {
              anyToolCalled = true;
              // Swap in the post-tool layer for every round from here on —
              // no extra request, just changes what this same next round
              // already sends. See buildPostToolLayer's comment for why.
              conversation[0] = { role: "system", content: buildSystemPrompt(context, studentProfile.summary, true, clarifiedIntent) };
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
                result = await searchDocuments(request, context, args.query, args.courseId, documentsReadThisTurn);
              } else if (fnName === "web_search") {
                result = await webSearchTool(args.query, args.scholarly);
              } else if (fnName === "search_youtube") {
                result = await youtubeSearchTool(args.query);
              } else if (fnName === "create_pdf") {
                const pdfResult = await createPdfTool(request, context, args.title, args.markdown, args.courseId);
                result = pdfResult.result;
                if (pdfResult.file) generatedFiles.push(pdfResult.file);
              } else if (fnName === "create_flashcards") {
                const flashcardResult = await createFlashcardsFromDocument(
                  request,
                  context,
                  primaryTarget,
                  modelKey,
                  args.courseId,
                  args.documentName
                );
                result = flashcardResult.result;
                if (flashcardResult.studySet) generatedStudySets.push(flashcardResult.studySet);
              } else if (fnName === "create_quiz") {
                const quizResult = await createQuizFromDocument(
                  request,
                  context,
                  primaryTarget,
                  modelKey,
                  args.courseId,
                  args.documentName,
                  args.questionCount
                );
                result = quizResult.result;
                if (quizResult.studySet) generatedStudySets.push(quizResult.studySet);
              } else if (fnName === "list_calendar_events") {
                result = await listCalendarEventsTool(request, context);
              } else if (fnName === "create_calendar_event") {
                result = await createCalendarEventTool(request, context, args);
              } else if (fnName === "update_calendar_event") {
                result = await updateCalendarEventTool(request, context, args);
              } else if (fnName === "delete_calendar_event") {
                result = await deleteCalendarEventTool(request, context, args.eventId);
              } else if (fnName === "recall_past_chat") {
                result = await recallPastChatTool(request, context, currentSessionId, args.query);
              } else {
                result = `Error: unknown tool "${fnName}".`;
              }

              conversation.push({ role: "tool", tool_call_id: toolCall.id, content: result });
            }

            send({ type: "status", label: "Reviewing what it found..." });
            continue;
          }

          // Not a tool-call round — release whatever's buffered (see
          // wrapDeltaForThinkStripping/flush above): the common case is a
          // normal reply that never contained </think> and never crossed
          // the buffer cap, so it hasn't reached the client at all yet.
          flush();

          // Normally this round's content is the final answer — but
          // occasionally Ollama returns neither tool calls nor content (an
          // empty round), or the round's entire content turns out to have
          // BEEN the leaked chain-of-thought with nothing real after the
          // closing tag (confirmed live 2026-08-11 — the buffer correctly
          // withheld the leaked text from the live view, but the round
          // still had a non-empty raw `content`, so it passed the old
          // `!content` check and got finalized as-is, persisting an empty
          // answer that then sat blank forever with no retry and no error).
          // Checking the stripped text catches both cases the same way -
          // silently declaring either "done" produces an invisible, empty
          // assistant bubble, so retry once before surfacing an error.
          const strippedContent = stripThinkLeak(content).trim();
          if (!strippedContent) {
            if (emptyRoundRetries < 1) {
              emptyRoundRetries++;
              continue;
            }
            finalAnswerText = "The assistant didn't generate a response. Please try asking again.";
            send({ type: "error", error: finalAnswerText });
            finished = true;
            break;
          }

          finished = true;
          // stripThinkLeak here is a safety net, not the primary defense —
          // wrapDeltaForThinkStripping above already corrected what the
          // live client saw via a reset event. This just keeps what gets
          // persisted (and what a resumed/history-panel viewer eventually
          // sees) in sync with that, since `content` itself is the raw,
          // pre-strip round output.
          finalAnswerText = strippedContent;
          const finalCompaction = await compactionPromise;
          persistedSummary = finalCompaction.summary;
          persistedSummarizedCount = finalCompaction.summarizedCount;
          send({
            type: "done",
            documentsRead,
            generatedFiles,
            generatedStudySets,
            summary: finalCompaction.summary,
            summarizedCount: finalCompaction.summarizedCount,
          });
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

          send({ type: "status", label: "Wrapping up an answer..." });
          const finalRoundHandler = makeDeltaHandler();
          const { content } = await streamOllamaRound(
            conversation,
            [],
            CHAT_TEMPERATURE,
            primaryTarget,
            finalRoundHandler.handleDelta
          );
          finalRoundHandler.flush();

          // See the retry loop's identical check above — content that was
          // entirely leaked chain-of-thought (non-empty raw, empty once
          // stripped) must not be finalized as an answer either.
          const strippedFinalContent = content ? stripThinkLeak(content).trim() : "";
          if (strippedFinalContent) {
            finalAnswerText = strippedFinalContent;
            const finalCompaction = await compactionPromise;
            persistedSummary = finalCompaction.summary;
            persistedSummarizedCount = finalCompaction.summarizedCount;
            send({
              type: "done",
              documentsRead,
              generatedFiles,
              generatedStudySets,
              summary: finalCompaction.summary,
              summarizedCount: finalCompaction.summarizedCount,
            });
          } else {
            finalAnswerText = "The assistant needed too many steps to answer. Please try rephrasing your question.";
            send({ type: "error", error: finalAnswerText });
          }
        }
      } catch (error: any) {
        console.error("Chat route error:", error);
        finalAnswerText = describeChatError(error);
        send({ type: "error", error: finalAnswerText });
      } finally {
        // Fire-and-forget — never awaited, must not add latency to a
        // response the student is already looking at. Errors are handled
        // entirely inside maybeUpdateStudentProfile itself.
        if (context?.userId) {
          const idToken = getIdToken(request);
          if (idToken) {
            maybeUpdateStudentProfile(context.userId, studentProfile, messages.slice(-8), idToken).catch((error) =>
              console.error("Unhandled student profile update error:", error)
            );
          }
        }
        // Runs regardless of whether a client is still attached (see the
        // send() comment above) — this is what makes a reply durable even
        // when the user has already navigated away or closed the tab.
        if (persistTarget) {
          await finishChatPersistence(persistTarget, {
            text: finalAnswerText ?? "Something went wrong generating this reply. Please try again.",
            documentsRead,
            generatedFiles,
            generatedStudySets,
            summary: persistedSummary,
            summarizedCount: persistedSummarizedCount,
          });
        }
        try {
          controller.close();
        } catch {
          // client already gone — nothing left to close for
        }
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
