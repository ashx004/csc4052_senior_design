import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { embedTexts, cosineSimilarity } from "@/src/library/ollamaEmbeddings";
import { searchChunks } from "@/src/library/vectorStore";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { clarifyUserQuery } from "@/src/library/queryClarifier";
import { searchWeb } from "@/src/library/webSearch";
import { searchYoutube } from "@/src/library/youtubeSearch";
import { generateAndUploadPdf } from "@/src/library/pdfGenerate";
import { warnIfSlowGeneration } from "@/src/library/ollamaHealthCheck";
import { getStudentProfile, maybeUpdateStudentProfile, StudentProfile } from "@/src/library/studentProfile";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import {pageContextSchema,buildPageContextPrompt,type PageContext,} from "@/src/library/Contextual_AI/contextualAi";
import { ChatContext, ChatClass, ChatDocument, PageAIContext, buildSystemPrompt } from "@/src/library/systemPrompt";
import { describeChatError } from "@/src/library/chatErrors";

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
    ? c.documents.map((d) => `  - ${d.name} (${d.fileType}, tag: ${d.category || "untagged"})`).join("\n")
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
// (bounded by RERANK_CANDIDATE_POOL), so per-term document frequency and
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

  const scored: { text: string; docName: string; classCode: string; denseScore: number }[] = [];
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
        RERANK_CANDIDATE_POOL * 3
      );
      for (const r of results) {
        const doc = docsByResourceId.get(r.payload.resourceId);
        if (!doc) continue; // defensive — shouldn't happen given the filter above
        scored.push({
          text: r.payload.text,
          docName: doc.name,
          classCode: doc.classCode,
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

  for (const doc of fallbackDocs) {
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
        scored.push({
          text: data.text,
          docName: doc.name,
          classCode: doc.classCode,
          denseScore: cosineSimilarity(queryEmbedding, data.embedding),
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
  const candidates = withScore.filter((r) => r.score >= SIMILARITY_THRESHOLD).slice(0, RERANK_CANDIDATE_POOL);

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
    const rerankBaseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_SECONDARY_URL, process.env.OLLAMA_SECONDARY_FALLBACK_URL);
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
        baseUrl: rerankBaseUrl,
        model: process.env.OLLAMA_SUMMARY_MODEL || "qwen3:4b",
      }
    );
    if (!response.ok) return candidates.slice(0, topK);

    const data = await response.json();
    warnIfSlowGeneration(
      rerankBaseUrl,
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
    pageContext,
  } = (await request.json().catch(() => ({}))) as {
    messages?: ChatMessage[];
    context?: ChatContext;
    summary?: string;
    summarizedCount?: number;
    currentSessionId?: string;
    pageContext?: unknown;
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

    const enrolledCourseIds = (context?.classes || []).map((c) => c.classId);
    if (!enrolledCourseIds.includes(parsed.data.courseId)) {
      return NextResponse.json({ error: "pageContext.courseId not in user context" }, { status: 403 });
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
  const primaryTarget = {
    baseUrl: await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL, process.env.OLLAMA_PRIMARY_FALLBACK_URL),
    model: process.env.OLLAMA_MODEL || "gpt-oss:20b",
  };
  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      let studentProfile: StudentProfile = { summary: "", messageCount: 0 };

      try {
        // Sent before any of the (potentially slow) work below starts —
        // this is what actually ends the client's "Connecting..." state,
        // since a streamed Response's headers don't reach the client until
        // the first chunk is enqueued. Without this, everything from here
        // through the model's first token happened in total silence.
        send({ type: "status", label: "Loading your classes and profile..." });

        // Clarification runs alongside compaction/profile-loading (not
        // after) so its round-trip is hidden behind theirs rather than
        // adding its own serial latency in front of every response.
        const [{ summary, summarizedCount }, loadedProfile, clarifiedIntent] = await Promise.all([
          compactIfNeeded(messages, incomingSummary ?? "", incomingSummarizedCount ?? 0),
          context?.userId ? getStudentProfile(context.userId) : Promise.resolve(studentProfile),
          typeof latestMessage?.content === "string" ? clarifyUserQuery(latestMessage.content) : Promise.resolve(null),
        ]);
        studentProfile = loadedProfile;

        const conversation: any[] = [
          { role: "system", content: buildSystemPrompt(context, studentProfile.summary, false, clarifiedIntent) },
          ...(summary ? [{ role: "system", content: `Summary of earlier conversation:\n${summary}` }] : []),
          ...(validatedPageContext ? [{ role: "system", content: buildPageContextPrompt(validatedPageContext) }] : []),
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

        // The model's first token can legitimately take a while (cold model
        // load after idle — see OLLAMA_TIMEOUT_MS), so this is the last
        // status update before either a real answer or a tool call starts
        // streaming in on its own.
        send({ type: "status", label: "Sending your question to the AI model..." });

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

            send({ type: "status", label: "Reviewing what it found..." });
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

          send({ type: "status", label: "Wrapping up an answer..." });
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
        send({ type: "error", error: describeChatError(error) });
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
