import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { embedTexts, cosineSimilarity } from "@/src/library/ollamaEmbeddings";
import { searchWeb } from "@/src/library/webSearch";
import { searchYoutube } from "@/src/library/youtubeSearch";
import { generateAndUploadPdf } from "@/src/library/pdfGenerate";

const OLLAMA_TIMEOUT_MS = 120000; // first request after idle can take 30-60s+ to cold-load the model
const MAX_TOOL_ROUNDS = 5;
const MAX_DOCUMENT_CHARS = 30000;
const MAX_DOCS_SCANNED = 25;
const TOP_K_CHUNKS = 5;
const RERANK_CANDIDATE_POOL = 15; // widen hybrid-score recall, then rerank down to TOP_K_CHUNKS
const SIMILARITY_THRESHOLD = 0.3; // below this, a chunk is treated as "not actually relevant"
const CHAT_TEMPERATURE = 0.3; // lower than Ollama's default (~0.8) — favors grounded answers over creative ones
const WEB_SEARCH_MAX_RESULTS = 5;

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

const READ_DOCUMENT_TOOL = {
  type: "function",
  function: {
    name: "read_document",
    description:
      "Fetch and read the full text of a specific class document (PDF, Word, Excel, plain text, or code file). Use this when you already know exactly which document is relevant — e.g. the student names it, or you already found it via search_documents. Reference the exact courseId and resourceId listed in the system context.",
    parameters: {
      type: "object",
      properties: {
        courseId: { type: "string", description: "The class ID the document belongs to" },
        resourceId: { type: "string", description: "The document's resource ID" },
      },
      required: ["courseId", "resourceId"],
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

function buildSystemPrompt(context?: ChatContext): string {
  const behaviorRules = `Your purpose in this chat is to help the student understand their coursework, study more effectively, and navigate their classes — you are a focused study assistant, not a general-purpose chatbot.

Guardrails:
- Only engage with the student's courses, assignments, study materials, and learning/academic topics in general (including general-knowledge questions that support their studies, and web research that supports their studies).
- If asked about anything unrelated to school or learning, or anything inappropriate, politely decline and steer the conversation back to how you can help academically. Don't lecture or moralize about it — just redirect briefly and warmly.

Style:
- Format responses with standard markdown (headings, **bold**, lists, code blocks, tables) when it improves clarity — the chat renders CommonMark/GFM markdown only, NOT raw HTML. Never use HTML tags like <br> or <b> — they'll show up as literal text, not formatting.
- For tabular or spreadsheet data, use a real markdown table: a header row, a |---|---| separator row, and pipe-separated data rows — not spaced-out text pretending to be a table.
- Match your response length to the question: a quick, direct answer for a simple question; a fuller, structured explanation for a complex one. Don't pad short answers or truncate ones that need real depth.
- Use emojis sparingly — only when they add clarity or help organize a response (e.g. marking steps or a checklist), never as decoration.
- Address the student by their first name when it feels natural, and refer to their real classes, instructors, and school by name rather than speaking generically.

Tools available:
- search_documents(query, courseId?): semantically search the student's indexed course documents (PDF, Word, Excel, plain text, code files) for relevant passages. Use this when you don't know which document has the answer or need to check what's actually written inside files.
- read_document(courseId, resourceId): read one specific document in full, once you know exactly which one you need.
- web_search(query, scholarly?): search the live web for general/current information not in the student's materials. Set scholarly=true for research-oriented questions to restrict results to reputable academic sources.
- search_youtube(query): find real explainer/lecture videos when a video would genuinely help — link them with the real URL returned by the tool, never a made-up one. Show the thumbnail too: render it as a markdown image, ![video title](thumbnail url), right above the video link.
- create_pdf(title, markdown): generate a downloadable, formatted PDF (e.g. a practice exam, study guide, worksheet) from markdown you write. Use this when the student wants an actual document, not just a chat answer — you're capable of drafting a basic practice exam this way when asked.
- recall_past_chat(query): search the student's other past conversations, only when they explicitly reference something discussed before.
You already know each class's document names and categories (Class Doc / Notes / Assignments) from the class listing above without calling anything — answer questions about what materials or assignments *exist* directly from that list. Only call a tool when you need to know what's actually written inside a document's content, or need to search for something not already visible above.
If more than one document could reasonably answer the question, or it's unclear which one the student means, list the relevant options by name and ask which they want — don't guess and read the first one you find.
Only call a tool when it would materially improve your answer — never call a tool for something you already know.

Internal IDs:
- The courseId and resourceId values in the class listing above are internal identifiers for your own tool calls only. Never show them to the student — refer to classes by their course code/name and to documents by their filename.

Accuracy:
- Never invent facts, sources, page numbers, quotes, or details that aren't in the context above or in a tool result. If you don't actually know something, say so plainly instead of guessing — a confident wrong answer is worse than "I don't have that in your materials."
- Only state a student's school/college if it's given to you in the Student line below — if it's blank, don't guess or invent one.
- When you use content from read_document, search_documents, or web_search, briefly name the source (document or site) so the student knows where it came from.
- If a tool returns nothing relevant, tell the student that rather than answering from a guess.

Using tool results:
- After a tool call returns, always circle back and directly answer the student's actual question using what you found — don't stop at just acknowledging that you read something. If you called read_document and the student asked "what should I study first," your next message must actually answer that from the document's content, not just confirm you have it.
- Tool results (from read_document, search_documents, web_search, etc.) are things YOU looked up yourself — never describe them as something the student "pasted," "gave you," or "provided." Refer to them as "the document," "what I found," or by name.

Reviewing code files:
- When asked to summarize, review, or debug a code file, don't stop at the first issue you notice and present it as the whole picture — scan the full file for other bugs, logic errors, or design problems too. If you found more than one real issue, mention all of them, ranked by severity, not just the first. If you only have time/space to cover one in depth, explicitly say there's more you could go into rather than implying that's everything.
- Don't treat "summarize this file" as inherently exhaustive — for code specifically, a summary that misses a bug that breaks the whole program is misleading. Bias toward completeness over brevity for code review requests.

Teaching approach:
- You're a study aid, not a homework-completion service. When a student is debugging their own code or working through a concept, default to guiding them toward the answer (ask what they've tried, point at the specific line/concept that's wrong, explain the underlying mechanism) rather than immediately handing over a complete rewritten solution.
- It's fine to give full corrected code when the student explicitly asks for it, when they're clearly stuck after a guided attempt, or when the task is inherently about producing a document (e.g. create_pdf, generating a practice exam) rather than solving their own assignment.
- Always explain the *why* behind a bug or concept, not just the fix — the goal is the student understanding it, not just the code working.`;

  if (!context) {
    return `You are Catalyst, an AI study assistant embedded in a student's academic platform.\n\n${behaviorRules}`;
  }

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
      Instructor: ${c.facultyName || "not listed"}
      Schedule: ${c.classSchedule || "not listed"}${
            c.classDescription ? `\n      Description: ${c.classDescription}` : ""
          }
${docLines}`;
        })
        .join("\n")
    : "  (Not enrolled in any classes yet)";

  return `You are Catalyst, an AI study assistant embedded in ${identity}'s academic platform. You have real access to their identity, school, enrolled classes, and uploaded course materials below — use it naturally to personalize answers instead of asking the student to repeat information you already have.

Student: ${identity}

Enrolled classes:
${classLines}

${behaviorRules}`;
}

async function readDocument(
  request: NextRequest,
  context: ChatContext | undefined,
  courseId: string,
  resourceId: string
): Promise<string> {
  const doc = context?.classes
    .find((c) => c.classId === courseId)
    ?.documents.find((d) => d.resourceId === resourceId);

  if (!doc) {
    return "Error: no document found with that courseId/resourceId.";
  }
  if (!SUPPORTED_DOCUMENT_TYPES.includes(doc.fileType)) {
    return `Error: "${doc.name}" is a .${doc.fileType} file — that type isn't readable yet (PDF, Word, Excel, plain text, and common code files are supported).`;
  }

  try {
    const fullUrl = resolveInternalUrl(request, doc.url);
    let text = await extractDocumentText(fullUrl, doc.fileType);

    if (!text) {
      return `Error: "${doc.name}" has no extractable text.`;
    }
    if (text.length > MAX_DOCUMENT_CHARS) {
      text = text.slice(0, MAX_DOCUMENT_CHARS) + "\n\n[document truncated]";
    }

    return text;
  } catch (error) {
    console.error(`Error reading document ${doc.name}:`, error);
    return `Error: failed to read "${doc.name}".`;
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
  courseId?: string
): Promise<string> {
  if (!context?.userId) {
    return "Error: no student context available for search.";
  }

  const targetClasses = courseId
    ? context.classes.filter((c) => c.classId === courseId)
    : context.classes;

  const candidateDocs = targetClasses.flatMap((c) =>
    c.documents
      .filter((d) => SUPPORTED_DOCUMENT_TYPES.includes(d.fileType))
      .map((d) => ({ ...d, courseId: c.classId, classCode: c.classCode }))
  );

  if (candidateDocs.length === 0) {
    return "No indexed documents are available to search.";
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
    return "No indexed content found yet — these documents may still be processing. Try read_document on a specific file instead.";
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.filter((r) => r.score >= SIMILARITY_THRESHOLD).slice(0, RERANK_CANDIDATE_POOL);

  if (candidates.length === 0) {
    return "Nothing in the indexed documents is actually relevant to that query — don't guess from weak matches. Tell the student you couldn't find this in their materials.";
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
    const newSummary = data?.message?.content;
    if (!newSummary) throw new Error("Summarization returned no content");

    return { summary: newSummary, summarizedCount: summarizedCount + toFold.length };
  } catch (error) {
    console.error("Conversation compaction failed, continuing without it:", error);
    return { summary, summarizedCount };
  }
}

// Reviews a draft response that used tool results before the student sees
// it — a local, inference-time analog to the self-critique step used in
// Constitutional AI, but applied per-turn instead of baked in via training.
// Only called for tool-grounded turns, where fabrication/formatting slips
// actually happen; casual no-tool replies skip this and stream live.
// Fails open: any error here just shows the draft as-is.
async function critiqueDraft(
  secondaryTarget: { baseUrl: string; model: string },
  draft: string,
  toolResultsText: string
): Promise<string | null> {
  const rubric = `You are reviewing an AI study assistant's draft reply before it's shown to a student. Check ONLY for these specific problems:
1. Raw HTML tags (like <br>, <b>, <table>, <div>) instead of markdown formatting.
2. Facts, numbers, or claims in the draft that are NOT supported by the tool results below (invented/fabricated content).
3. Long internal-ID-looking strings (random alphanumeric IDs) shown to the student.
4. The draft fails to actually answer the student's question and just gives a vague acknowledgment instead.

If none of these apply, reply with exactly: OK
If one does apply, reply with one short sentence naming the specific problem — nothing else.`;

  try {
    const response = await callOllama(
      [
        { role: "system", content: rubric },
        {
          role: "user",
          content: `Tool results available this turn:\n${toolResultsText.slice(0, 8000) || "(none)"}\n\nDraft reply to check:\n"""${draft}"""`,
        },
      ],
      undefined,
      0.1,
      secondaryTarget
    );
    if (!response.ok) return null;

    const data = await response.json();
    const verdict = (data?.message?.content || "").trim();
    if (!verdict || verdict.toUpperCase().startsWith("OK")) return null;
    return verdict;
  } catch (error) {
    console.error("Self-critique check failed, skipping:", error);
    return null;
  }
}

// Response protocol (newline-delimited JSON, one object per line):
//   {"type":"delta","text":"..."}                                — append to the reply
//   {"type":"tool","name":"search_documents"}                    — a tool started running
//   {"type":"done","documentsRead":[...],"generatedFiles":[...],"summary":"...","summarizedCount":N}
//   {"type":"error","error":"..."}
export async function POST(request: NextRequest) {
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

  if (!process.env.OLLAMA_PRIMARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    return NextResponse.json({ error: "The AI assistant is not configured." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const primaryTarget = {
    baseUrl: process.env.OLLAMA_PRIMARY_URL,
    model: process.env.OLLAMA_MODEL || "gpt-oss:20b",
  };
  const secondaryTarget = {
    baseUrl: process.env.OLLAMA_SECONDARY_URL || process.env.OLLAMA_PRIMARY_URL || "",
    model: process.env.OLLAMA_SUMMARY_MODEL || process.env.OLLAMA_MODEL || "gpt-oss:20b",
  };

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      try {
        const { summary, summarizedCount } = await compactIfNeeded(
          messages,
          incomingSummary ?? "",
          incomingSummarizedCount ?? 0
        );

        const conversation: any[] = [
          { role: "system", content: buildSystemPrompt(context) },
          ...(summary ? [{ role: "system", content: `Summary of earlier conversation:\n${summary}` }] : []),
          ...messages.slice(summarizedCount),
        ];
        const documentsRead: string[] = [];
        const generatedFiles: { name: string; url: string }[] = [];
        const tools = [
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
        let critiqueRetried = false;
        const toolResultsThisTurn: string[] = [];

        for (let round = 0; round < MAX_TOOL_ROUNDS && !finished; round++) {
          // Once a tool has been used this turn, the next round's content is
          // buffered instead of streamed live so it can be self-critiqued
          // before the student sees it (below) — rounds before any tool use
          // stream normally for a responsive feel, since that's the
          // low fabrication-risk path.
          let buffered = "";
          const onDelta = anyToolCalled
            ? (delta: string) => {
                buffered += delta;
              }
            : (delta: string) => send({ type: "delta", text: delta });

          const { content, toolCalls, rawMessage } = await streamOllamaRound(
            conversation,
            tools,
            CHAT_TEMPERATURE,
            primaryTarget,
            onDelta
          );

          if (toolCalls && toolCalls.length > 0) {
            anyToolCalled = true;
            conversation.push(rawMessage);

            for (const toolCall of toolCalls) {
              const fnName = toolCall.function?.name;
              const args = toolCall.function?.arguments ?? {};
              send({ type: "tool", name: fnName });
              let result: string;

              if (fnName === "read_document") {
                result = await readDocument(request, context, args.courseId, args.resourceId);
                if (!result.startsWith("Error:")) {
                  const docMeta = context?.classes
                    .find((c) => c.classId === args.courseId)
                    ?.documents.find((d) => d.resourceId === args.resourceId);
                  if (docMeta) documentsRead.push(docMeta.name);
                }
              } else if (fnName === "search_documents") {
                result = await searchDocuments(context, args.query, args.courseId);
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

              toolResultsThisTurn.push(`[${fnName}] ${result}`);
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

          if (!anyToolCalled) {
            // No tools were used this turn — already streamed live above,
            // low fabrication/formatting risk, skip the critique pass.
            finished = true;
            send({ type: "done", documentsRead, generatedFiles, summary, summarizedCount });
            break;
          }

          // A tool was used this turn — self-critique the buffered draft
          // before showing it (see critiqueDraft above).
          send({ type: "tool", name: "self_check" });
          const issue = await critiqueDraft(secondaryTarget, buffered, toolResultsThisTurn.join("\n\n"));

          if (issue && !critiqueRetried) {
            critiqueRetried = true;
            conversation.push({
              role: "system",
              content: `Your previous draft had a problem: ${issue}. Revise your answer to fix this, using only the tool results already in this conversation — don't call any more tools.`,
            });
            continue;
          }

          send({ type: "delta", text: buffered });
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

          // This is a rushed, forced answer under a tool-round budget it
          // already failed to work within — arguably the highest-risk path
          // for exactly what critiqueDraft checks for, so it gets buffered
          // and critiqued too, never streamed live.
          let buffered = "";
          const { content } = await streamOllamaRound(conversation, [], CHAT_TEMPERATURE, primaryTarget, (delta) => {
            buffered += delta;
          });

          if (!content) {
            send({
              type: "error",
              error: "The assistant needed too many steps to answer. Please try rephrasing your question.",
            });
          } else {
            send({ type: "tool", name: "self_check" });
            const issue = await critiqueDraft(secondaryTarget, buffered, toolResultsThisTurn.join("\n\n"));
            if (issue) {
              buffered += `\n\n*(Heads up: this answer may be incomplete or not fully grounded in your materials — ${issue.replace(/\.$/, "")}.)*`;
            }
            send({ type: "delta", text: buffered });
            send({ type: "done", documentsRead, generatedFiles, summary, summarizedCount });
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
