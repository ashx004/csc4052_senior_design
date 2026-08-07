
// Generates MC/TF questions via Ollama for the Learn Questions feature.
// Does NOT persist anything — returns generated questions as JSON.
// The client keeps them in React state only.

import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { z } from "zod";

// --- Config ---
const OLLAMA_TIMEOUT_MS = 120_000;
const MAX_OLLAMA_ATTEMPTS = 2;

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
    })
  ).min(1),
  count: z.number().int().min(1).max(10),
});

// --- Ollama call ---
async function callOllama(prompt: string, count: number): Promise<string> {
  const baseUrl = process.env.OLLAMA_PRIMARY_URL;
  const model = process.env.OLLAMA_MODEL;

  if (!baseUrl || !model) {
    throw new Error("Ollama is not configured. Set OLLAMA_PRIMARY_URL and OLLAMA_MODEL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: buildLearnQuestionsJsonSchema(count),
        options: { temperature: 0 },
        messages: [
          {
            role: "system",
            content: `You are a university-level quiz generator. Generate exactly ${count} study questions. Mix multiple_choice and true_false types roughly equally. Each question MUST have a short explanation of why the correct answer is right. For multiple_choice: provide exactly 4 options. For true_false: provide exactly ["True", "False"] as options. The correctAnswer must be one of the options verbatim. Do not repeat concepts. Make questions educational and clear.`,
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
  // MC must have exactly 4 options, correctAnswer must be one of them
  if (q.type === "multiple_choice") {
    if (q.options.length !== 4) return false;
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
      return `Course: ${c.courseCode} — ${c.courseName}. ${topics}`;
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