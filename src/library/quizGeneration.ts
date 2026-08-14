import { randomUUID } from "crypto";
import { z } from "zod";
import { resolveModelFromKey } from "@/src/library/ollamaClient";
import { stripThinkLeak } from "@/src/library/stripThinkLeak";

// Shared between api/generate-quiz/route.ts (the standalone course-page
// flow) and api/chat/route.ts's create_quiz tool - same generation +
// validation + matching-group post-processing either way, just fed text
// from different sources (a raw PDF/txt parse there vs. the richer
// extractDocumentText behind chat's read_document tool here).

const OLLAMA_TIMEOUT_MS = 120_000;
const MAX_OLLAMA_ATTEMPTS = 2;
const MAX_MATCHING_GROUP_SIZE = 5;

const QuizResponseSchema = z.object({
  topicName: z.string().describe("Short descriptive title for this quiz"),
  questions: z.array(
    z.object({
      type: z.enum(["multiple_choice", "true_false", "matching"]),
      question: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.string(),
    })
  ),
});

type QuizResponse = z.infer<typeof QuizResponseSchema>;
type ParsedQuestion = QuizResponse["questions"][number];

export interface QuestionTypes {
  multipleChoice?: boolean;
  trueFalse?: boolean;
  matching?: boolean;
}

export interface QuizResult {
  topicName: string;
  questions: (ParsedQuestion & { id: string; matchingGroupId?: string })[];
}

function buildQuizJsonSchema(questionCount: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      topicName: { type: "string" },
      questions: {
        type: "array",
        minItems: questionCount,
        maxItems: questionCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["multiple_choice", "true_false", "matching"] },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correctAnswer: { type: "string" },
          },
          required: ["type", "question", "options", "correctAnswer"],
        },
      },
    },
    required: ["topicName", "questions"],
  };
}

function buildQuizPrompt(extractedText: string, questionCount: number, types: QuestionTypes): string {
  const enabledTypes: string[] = [];
  if (types.multipleChoice) enabledTypes.push("multiple_choice");
  if (types.trueFalse) enabledTypes.push("true_false");
  if (types.matching) enabledTypes.push("matching");

  const typeBlocks: string[] = [];
  if (types.multipleChoice) {
    typeBlocks.push(`For every "multiple_choice" question:
- Include exactly 4 options.
- All 4 options must be distinct — never repeat the same option text.
- correctAnswer must exactly match one option.`);
  }
  if (types.trueFalse) {
    typeBlocks.push(`For every "true_false" question:
- Use options exactly ["True", "False"] in that order.
- correctAnswer must be exactly "True" or "False".`);
  }
  if (types.matching) {
    typeBlocks.push(`For every "matching" question:
- question is a short term or concept.
- correctAnswer is that term's matching definition.
- options may be an empty array — the server builds the option pool.
- Terms and definitions must be unique across all matching questions.
- Base it only on the supplied document.`);
  }

  const typeInstructions =
    enabledTypes.length > 1
      ? `Generate a reasonable mix of ${enabledTypes.map((t) => `"${t}"`).join(", ")} questions totaling ${questionCount}. An exact even split is not required.\n\n${typeBlocks.join("\n\n")}`
      : `Every question must have type "${enabledTypes[0]}".\n\n${typeBlocks.join("\n\n")}`;

  return `
You are an expert academic tutor creating a quiz for a college student.

Based ONLY on the document content below, generate exactly ${questionCount} quiz questions.

Create a short, descriptive topicName containing approximately 3 to 6 words.

${typeInstructions}

Rules:
- Every question must be answerable using only the supplied document.
- Do not use outside knowledge.
- Do not invent facts.
- correctAnswer must be verbatim identical to one entry in options.
- Questions must be clear and unambiguous.
- Cover different important concepts throughout the document.
- Do not repeat the same question or concept.
- Use simple language.
- Return only the JSON object required by the supplied schema.
- Do not include markdown or explanatory text outside the JSON.

--- DOCUMENT CONTENT ---
${extractedText}
`.trim();
}

async function callOllama(prompt: string, questionCount: number, baseUrl: string, modelKey: string | undefined) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: resolveModelFromKey(modelKey),
        messages: [
          {
            role: "system",
            content:
              "You generate academic quizzes from supplied documents. Respond with ONLY valid JSON matching the provided schema. Do not include markdown, explanations, or text outside the JSON object.",
          },
          { role: "user", content: prompt },
        ],
        stream: false,
        think: false,
        format: buildQuizJsonSchema(questionCount),
        options: { temperature: 0 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${responseText || response.statusText}`);
    }

    return (await response.json()) as { message?: { content?: string } };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateQuizWithRetry(
  prompt: string,
  questionCount: number,
  baseUrl: string,
  modelKey: string | undefined
): Promise<QuizResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_OLLAMA_ATTEMPTS; attempt += 1) {
    try {
      const data = await callOllama(prompt, questionCount, baseUrl, modelKey);
      const rawContent = data.message?.content;
      if (!rawContent) throw new Error("Ollama returned an empty message.");

      const content = stripThinkLeak(rawContent);
      return QuizResponseSchema.parse(JSON.parse(content));
    } catch (error) {
      lastError = error;
      console.error(`Quiz Ollama attempt ${attempt} failed:`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Quiz generation failed after two attempts.");
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Validates/normalizes the model's raw output: drops multiple_choice/
// true_false questions with malformed options, and for matching questions
// dedupes terms/definitions and builds a shared shuffled option pool per
// group of at most MAX_MATCHING_GROUP_SIZE (matching questions don't carry
// their own options from the model).
function validateAndNormalize(parsed: QuizResponse): QuizResult["questions"] {
  const validStandard = parsed.questions.filter((question) => {
    if (question.type === "matching") return false;
    if (!question.options.includes(question.correctAnswer)) {
      console.warn("Dropping quiz question: correctAnswer not found in options", question);
      return false;
    }
    if (question.type === "multiple_choice" && question.options.length !== 4) {
      console.warn("Dropping quiz question: multiple_choice does not have exactly 4 options", question);
      return false;
    }
    if (question.type === "multiple_choice" && new Set(question.options).size !== question.options.length) {
      console.warn("Dropping quiz question: multiple_choice has duplicate options", question);
      return false;
    }
    if (question.type === "true_false" && !(question.options.length === 2 && question.options[0] === "True" && question.options[1] === "False")) {
      console.warn('Dropping quiz question: true_false options are not exactly ["True", "False"]', question);
      return false;
    }
    return true;
  });

  const matchingRaw = parsed.questions.filter((q) => q.type === "matching");
  const seenTerms = new Set<string>();
  const seenDefinitions = new Set<string>();
  const dedupedMatching = matchingRaw.filter((q) => {
    if (!q.question || !q.correctAnswer) return false;
    if (seenTerms.has(q.question) || seenDefinitions.has(q.correctAnswer)) {
      console.warn("Dropping duplicate matching term/definition", q);
      return false;
    }
    seenTerms.add(q.question);
    seenDefinitions.add(q.correctAnswer);
    return true;
  });

  const validMatching: (ParsedQuestion & { matchingGroupId: string })[] = [];
  for (let i = 0; i < dedupedMatching.length; i += MAX_MATCHING_GROUP_SIZE) {
    const group = dedupedMatching.slice(i, i + MAX_MATCHING_GROUP_SIZE);
    const groupId = randomUUID();
    const sharedOptions = shuffle(group.map((q) => q.correctAnswer));
    for (const q of group) {
      validMatching.push({ type: q.type, question: q.question, correctAnswer: q.correctAnswer, options: sharedOptions, matchingGroupId: groupId });
    }
  }

  return [...validStandard, ...validMatching].map((question) => ({ id: randomUUID(), ...question }));
}

export async function generateQuizWithValidation(
  extractedText: string,
  questionCount: number,
  questionTypes: QuestionTypes,
  baseUrl: string,
  modelKey: string | undefined
): Promise<QuizResult> {
  const prompt = buildQuizPrompt(extractedText, questionCount, questionTypes);
  const parsed = await generateQuizWithRetry(prompt, questionCount, baseUrl, modelKey);
  const questions = validateAndNormalize(parsed);

  if (questions.length < 1) {
    throw new Error("Failed to generate a valid quiz.");
  }

  return { topicName: parsed.topicName, questions };
}
