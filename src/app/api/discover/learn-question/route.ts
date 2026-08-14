
// Generates MC/TF questions via Ollama for the Learn Questions feature.
// Does NOT persist anything — returns generated questions as JSON.
// The client keeps them in React state only.

import { NextRequest, NextResponse } from "next/server";
import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { z } from "zod";

// --- Config ---
const OLLAMA_TIMEOUT_MS = 120_000;
const MAX_OLLAMA_ATTEMPTS = 2;

// Same GPU/LLM-cost-bearing rationale as api/chat and api/embed-document's
// own rate limits (see rateLimit.ts) — this route makes an identical kind
// of Ollama call (with its own 2-attempt retry on top) and had no limit at
// all until 2026-08-14's bug sweep.
const LEARN_QUESTION_RATE_LIMIT_WINDOW_MS = 60_000;
const LEARN_QUESTION_RATE_LIMIT_MAX = 10; // per user per window

// --- Zod schema for validating Ollama's response ---
const GeneratedQuestionSchema = z.object({
  type: z.enum(["multiple_choice", "true_false"]),
  question: z.string().min(5),
  options: z.array(z.string()).min(2).max(4),
  correctAnswer: z.string().min(1),
  explanation: z.string().optional().default(""),
});

const GeneratedQuestionsResponseSchema = z.object({
  questions: z.array(GeneratedQuestionSchema),
});

// --- JSON schema sent to Ollama's `format` field for structured output ---
function buildLearnQuestionsJsonSchema(count: number) {
  return {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          required: ["type", "question", "options", "correctAnswer", "explanation"],
          properties: {
            type: {
              type: "string",
              enum: ["multiple_choice", "true_false"],
            },
            question: { type: "string" },
            options: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 4,
            },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
          },
        },
      },
    },
  };
}

// --- Request body schema ---
const RequestBodySchema = z.object({
  courses: z.array(
    z.object({
      courseCode: z.string(),
      courseName: z.string(),
      existingTopics: z.array(z.string()).optional().default([]),
      // Optional — when present, the model is told to base questions
      // specifically on this flashcard content instead of just the course
      // name/topics. Used by the Blocks game's flashcard-to-MC/TF pipeline;
      // absent (undefined) for every existing Learn Questions call site, so
      // this is a purely additive change.
      cardsToTest: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
    })
  ).min(1),
  count: z.number().int().min(1).max(10),
});

// --- Ollama call ---
// Must send Bearer auth and resolve LAN/public URL the same way as
// generate-quiz / chat — the Caddy proxy in front of Ollama rejects
// unauthenticated requests with 502 Bad Gateway.
async function callOllama(prompt: string, count: number): Promise<string> {
  const configuredUrl = process.env.OLLAMA_PRIMARY_URL;
  const token = process.env.OLLAMA_AUTH_TOKEN;
  const model = process.env.OLLAMA_MODEL_QUALITY;

  if (!configuredUrl || !token || !model) {
    throw new Error(
      "Ollama is not configured. Set OLLAMA_PRIMARY_URL, OLLAMA_AUTH_TOKEN, and OLLAMA_MODEL_QUALITY."
    );
  }

  const baseUrl = await resolveOllamaBaseUrl(
    configuredUrl,
    process.env.OLLAMA_PRIMARY_FALLBACK_URL
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: buildLearnQuestionsJsonSchema(count),
        options: { temperature: 0 },
        messages: [
          {
            role: "system",
            content: `You are a university-level quiz generator. Generate exactly ${count} study questions. Mix multiple_choice and true_false types roughly equally. Each question MUST have a short explanation of why the correct answer is right. For multiple_choice: provide exactly 4 distinct options (never duplicate option text). For true_false: provide exactly ["True", "False"] as options. The correctAnswer must be one of the options verbatim. Do not repeat concepts. Make questions educational and clear.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama returned ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

// --- Semantic post-filter (matches existing quiz generation pattern) ---
function isValidQuestion(q: z.infer<typeof GeneratedQuestionSchema>): boolean {
  // MC must have exactly 4 distinct options, correctAnswer must be one of them
  if (q.type === "multiple_choice") {
    if (q.options.length !== 4) return false;
    if (new Set(q.options).size !== q.options.length) return false;
    if (!q.options.includes(q.correctAnswer)) return false;
  }
  // TF must have exactly ["True", "False"]
  if (q.type === "true_false") {
    if (
      q.options.length !== 2 ||
      q.options[0] !== "True" ||
      q.options[1] !== "False"
    )
      return false;
    if (q.correctAnswer !== "True" && q.correctAnswer !== "False") return false;
  }
  return true;
}

// --- Route handler ---
export async function POST(req: NextRequest) {
  // Auth check
  const auth = await verifyRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(auth.uid, LEARN_QUESTION_RATE_LIMIT_WINDOW_MS, LEARN_QUESTION_RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many questions being generated at once — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  // Parse and validate body
  let body: z.infer<typeof RequestBodySchema>;
  try {
    const raw = await req.json();
    body = RequestBodySchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Build prompt from course info
  const courseDescriptions = body.courses
    .map((c) => {
      const topics =
        c.existingTopics.length > 0
          ? `Topics already covered: ${c.existingTopics.join(", ")}.`
          : "";
      const cardsNote =
        c.cardsToTest && c.cardsToTest.length > 0
          ? ` Base the questions specifically on this flashcard content: ${c.cardsToTest
              .map((card) => `"${card.question}" → "${card.answer}"`)
              .join("; ")}.`
          : "";
      return `Course: ${c.courseCode} — ${c.courseName}. ${topics}${cardsNote}`;
    })
    .join("\n");

  const prompt = `Generate ${body.count} practice questions for a college student studying these courses:\n\n${courseDescriptions}\n\nDistribute questions roughly equally across the courses. Avoid repeating topics that are already covered. Each question should test understanding, not just recall.`;

  // Call Ollama with retry
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_OLLAMA_ATTEMPTS; attempt++) {
    try {
      const raw = await callOllama(prompt, body.count);
      const parsed = JSON.parse(raw);
      const validated = GeneratedQuestionsResponseSchema.parse(parsed);

      // Semantic filter
      const valid = validated.questions.filter(isValidQuestion);

      if (valid.length === 0) {
        lastError = new Error("All generated questions failed validation");
        continue;
      }

      // Add IDs
      const withIds = valid.map((q, i) => ({
        ...q,
        id: `gen-${Date.now()}-${i}`,
      }));

      return NextResponse.json({ questions: withIds });
    } catch (err: any) {
      lastError = err;
    }
  }

  // Both attempts failed — return what we can
  console.error("Learn Questions generation failed:", lastError?.message);
  return NextResponse.json(
    { error: "Failed to generate questions. Try again later.", questions: [] },
    { status: 502 }
  );
}