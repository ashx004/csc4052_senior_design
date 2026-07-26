import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  fetchInternal,
  resolveInternalUrl,
} from '@/src/library/pdfExtract';
import { verifyRequestAuth } from '@/src/library/verifyAuth';

const OLLAMA_TIMEOUT_MS = 120_000;
const MAX_OLLAMA_ATTEMPTS = 2;

const QuizResponseSchema = z.object({
  topicName: z
    .string()
    .describe('Short descriptive title for this quiz'),
  questions: z.array(
    z.object({
      type: z.enum(['multiple_choice', 'true_false']),
      question: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.string(),
    })
  ),
});

type QuizResponse = z.infer<typeof QuizResponseSchema>;

interface QuestionTypes {
  multipleChoice?: boolean;
  trueFalse?: boolean;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

function buildQuizJsonSchema(questionCount: number) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      topicName: {
        type: 'string',
      },
      questions: {
        type: 'array',
        minItems: questionCount,
        maxItems: questionCount,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: {
              type: 'string',
              enum: ['multiple_choice', 'true_false'],
            },
            question: {
              type: 'string',
            },
            options: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            correctAnswer: {
              type: 'string',
            },
          },
          required: [
            'type',
            'question',
            'options',
            'correctAnswer',
          ],
        },
      },
    },
    required: ['topicName', 'questions'],
  };
}

async function callOllama(
  prompt: string,
  questionCount: number
): Promise<OllamaChatResponse> {
  const ollamaUrl = process.env.OLLAMA_PRIMARY_URL;
  const ollamaToken = process.env.OLLAMA_AUTH_TOKEN;
  const ollamaModel = process.env.OLLAMA_MODEL;

  if (!ollamaUrl || !ollamaToken || !ollamaModel) {
    throw new Error(
      'Ollama is not configured. Check OLLAMA_PRIMARY_URL, OLLAMA_AUTH_TOKEN, and OLLAMA_MODEL.'
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    OLLAMA_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${ollamaUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ollamaToken}`,
        },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [
            {
              role: 'system',
              content:
                'You generate academic quizzes from supplied documents. Respond with ONLY valid JSON matching the provided schema. Do not include markdown, explanations, or text outside the JSON object.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          stream: false,
          format: buildQuizJsonSchema(questionCount),
          options: {
            temperature: 0,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const responseText = await response.text();

      throw new Error(
        `Ollama request failed (${response.status}): ${
          responseText || response.statusText
        }`
      );
    }

    return (await response.json()) as OllamaChatResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateQuizWithRetry(
  prompt: string,
  questionCount: number
): Promise<QuizResponse> {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_OLLAMA_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const data = await callOllama(prompt, questionCount);
      const content = data.message?.content;

      if (!content) {
        throw new Error(
          'Ollama returned an empty message.'
        );
      }

      const parsedJson: unknown = JSON.parse(content);

      return QuizResponseSchema.parse(parsedJson);
    } catch (error) {
      lastError = error;

      console.error(
        `Quiz Ollama attempt ${attempt} failed:`,
        error
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Quiz generation failed after two attempts.');
}

function getDocumentKey(docUrl: string): string | null {
  try {
    const parsedUrl = new URL(docUrl, 'http://internal');
    return parsedUrl.searchParams.get('key');
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    /*
     * Authenticate this API route before allowing it to use the
     * internal download bypass.
     */
    const auth = await verifyRequestAuth(request);

    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const {
      docUrl,
      docName,
      questionCount,
      questionTypes,
    } = await request.json();

    if (typeof docUrl !== 'string' || !docUrl) {
      return NextResponse.json(
        { error: 'Document URL is required' },
        { status: 400 }
      );
    }

    if (
      typeof questionCount !== 'number' ||
      questionCount < 1 ||
      questionCount > 20
    ) {
      return NextResponse.json(
        {
          error:
            'Question count must be between 1 and 20.',
        },
        { status: 400 }
      );
    }

    const types: QuestionTypes = questionTypes || {};

    if (!types.multipleChoice && !types.trueFalse) {
      return NextResponse.json(
        {
          error: 'Select at least one question type.',
        },
        { status: 400 }
      );
    }

    /*
     * Verify that the requested MinIO object belongs to the
     * authenticated user before using the internal secret.
     */
    const documentKey = getDocumentKey(docUrl);

    if (
      !documentKey ||
      !documentKey.startsWith(`users/${auth.uid}/`)
    ) {
      return NextResponse.json(
        {
          error:
            'You do not have permission to use this document.',
        },
        { status: 403 }
      );
    }

    /*
     * Download through Catalyst's authenticated internal-fetch
     * helper. A bare fetch() would return 401.
     */
    const fullUrl = resolveInternalUrl(request, docUrl);
    const fileResponse = await fetchInternal(fullUrl);

    if (!fileResponse.ok) {
      console.error(
        `Failed to download quiz document: ${fileResponse.status} ${fileResponse.statusText}`
      );

      return NextResponse.json(
        {
          error: `Failed to download document (${fileResponse.status})`,
        },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(
      await fileResponse.arrayBuffer()
    );

    let extractedText = '';
    const fileName =
      typeof docName === 'string' ? docName : '';
    const extension = fileName
      .split('.')
      .pop()
      ?.toLowerCase();

    if (extension === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require(
        'pdf-parse/lib/pdf-parse.js'
      );

      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
    } else if (
      ['txt', 'md', 'csv'].includes(extension || '')
    ) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      return NextResponse.json(
        {
          error: `File type .${extension} is not supported yet. Please use PDF or text files.`,
        },
        { status: 400 }
      );
    }

    const maxChars = 50_000;

    if (extractedText.length > maxChars) {
      extractedText = extractedText.substring(
        0,
        maxChars
      );
    }

    if (extractedText.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            'Could not extract enough text from this document to generate a quiz.',
        },
        { status: 400 }
      );
    }

    let typeInstructions: string;

    if (types.multipleChoice && types.trueFalse) {
      typeInstructions = `
Use a roughly even mix of "multiple_choice" and "true_false" questions.

For every "multiple_choice" question:
- Include exactly 4 options.
- correctAnswer must exactly match one option.

For every "true_false" question:
- Use options exactly ["True", "False"] in that order.
- correctAnswer must be exactly "True" or "False".`;
    } else if (types.multipleChoice) {
      typeInstructions = `
Every question must have type "multiple_choice".
Every question must include exactly 4 options.
correctAnswer must exactly match one option.`;
    } else {
      typeInstructions = `
Every question must have type "true_false".
Every question must use options exactly ["True", "False"] in that order.
correctAnswer must be exactly "True" or "False".`;
    }

    const prompt = `
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

    let parsed: QuizResponse;

    try {
      parsed = await generateQuizWithRetry(
        prompt,
        questionCount
      );
    } catch (error) {
      console.error(
        'Quiz generation failed after retries:',
        error
      );

      return NextResponse.json(
        {
          error:
            'The assistant returned an unexpected response. Please try again.',
        },
        { status: 502 }
      );
    }

    /*
     * Preserve the existing post-generation checks.
     */
    const validQuestions = parsed.questions.filter(
      (question) => {
        if (
          !question.options.includes(
            question.correctAnswer
          )
        ) {
          console.warn(
            'Dropping quiz question: correctAnswer not found in options',
            question
          );
          return false;
        }

        if (
          question.type === 'multiple_choice' &&
          question.options.length !== 4
        ) {
          console.warn(
            'Dropping quiz question: multiple_choice does not have exactly 4 options',
            question
          );
          return false;
        }

        if (
          question.type === 'true_false' &&
          !(
            question.options.length === 2 &&
            question.options[0] === 'True' &&
            question.options[1] === 'False'
          )
        ) {
          console.warn(
            'Dropping quiz question: true_false options are not exactly ["True", "False"]',
            question
          );
          return false;
        }

        return true;
      }
    );

    if (validQuestions.length < 1) {
      return NextResponse.json(
        {
          error:
            'Failed to generate a valid quiz. Please try again.',
        },
        { status: 502 }
      );
    }

    const questionsWithIds = validQuestions.map(
      (question) => ({
        id: randomUUID(),
        ...question,
      })
    );

    return NextResponse.json({
      topicName: parsed.topicName,
      questions: questionsWithIds,
    });
  } catch (error) {
    console.error('Quiz generation error:', error);

    return NextResponse.json(
      {
        error:
          'Failed to generate quiz. Please try again.',
      },
      { status: 500 }
    );
  }
}