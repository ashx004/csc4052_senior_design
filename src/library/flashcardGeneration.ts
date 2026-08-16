import { z } from "zod";
import { resolveModelFromKey } from "@/src/library/ollamaClient";
import { stripThinkLeak, extractFirstJsonObject } from "@/src/library/stripThinkLeak";

// Shared between api/generate-flashcards/route.ts (the standalone
// course-page flow) and api/chat/route.ts's create_flashcards tool - the
// same generation logic either way, just fed text from different sources
// (a raw PDF/txt parse there vs. the richer extractDocumentText behind
// chat's read_document tool here, which additionally supports docx/xlsx/
// image OCR).

export const FlashcardResponseSchema = z.object({
  topicName: z
    .string()
    .describe("A short, descriptive name (3-6 words) summarizing what this set of flashcards covers"),
  questions: z.array(
    z.object({
      question: z.string().describe("A clear, concise question about a key concept from the document"),
      answer: z.string().describe("A brief, accurate answer in 1-2 sentences"),
    })
  ),
});

export type FlashcardResult = z.infer<typeof FlashcardResponseSchema>;

const FLASHCARD_JSON_SCHEMA = {
  type: "object",
  properties: {
    topicName: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
        required: ["question", "answer"],
      },
    },
  },
  required: ["topicName", "questions"],
};

const OLLAMA_TIMEOUT_MS = 120000; // same as chat/route.ts — first request after idle can take a while to cold-load

function buildFlashcardMessages(extractedText: string, previousQuestions?: string[]) {
  let userPrompt = `You are an expert academic tutor helping a college student study.

Based ONLY on the following document content, generate exactly 10 flashcards that cover the most important key concepts. Also come up with a short, descriptive topic name (3-6 words) summarizing what this set of flashcards covers, e.g. "Evolution and Natural Selection" or "Boolean Logic Fundamentals".

Rules:
- Each question should test understanding of one specific concept
- Answers should be concise (1-2 sentences maximum)
- Questions should be clear and unambiguous
- Cover different topics across the document, not just the beginning
- Use simple language that a student can quickly understand
- Do NOT use information outside of this document
- The topic name should reflect the overall subject of the document, not a single flashcard
- Return ONLY valid JSON matching the required schema — no commentary, no markdown fences`;

  if (previousQuestions && previousQuestions.length > 0) {
    userPrompt += `\n\nIMPORTANT: Do NOT repeat any of these previously generated questions:\n${previousQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}`;
    userPrompt += `\n\nGenerate 10 NEW and DIFFERENT flashcards covering other concepts from the document.`;
  }

  userPrompt += `\n\n--- DOCUMENT CONTENT ---\n${extractedText}`;

  return [
    {
      role: "system",
      content:
        "You generate study flashcards from academic documents. Always respond with ONLY valid JSON matching the provided schema — no prose, no markdown code fences, nothing outside the JSON object.",
    },
    { role: "user", content: userPrompt },
  ];
}

async function callOllamaForFlashcards(messages: unknown[], baseUrl: string, modelKey: string | undefined): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    return await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: resolveModelFromKey(modelKey),
        messages,
        stream: false,
        think: false,
        format: FLASHCARD_JSON_SCHEMA,
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Calls Ollama and validates the result against the flashcard schema,
// retrying once if the model's output isn't valid/parseable JSON — a small
// model can occasionally wrap the JSON in prose or drop a field even with
// `format` set.
export async function generateFlashcardsWithRetry(
  extractedText: string,
  baseUrl: string,
  modelKey: string | undefined,
  previousQuestions?: string[]
): Promise<FlashcardResult> {
  const messages = buildFlashcardMessages(extractedText, previousQuestions);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await callOllamaForFlashcards(messages, baseUrl, modelKey);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = stripThinkLeak(data?.message?.content ?? "");
      return FlashcardResponseSchema.parse(JSON.parse(extractFirstJsonObject(content)));
    } catch (error) {
      lastError = error;
      console.error(`Flashcard generation attempt ${attempt} failed:`, error);
    }
  }

  throw lastError;
}
