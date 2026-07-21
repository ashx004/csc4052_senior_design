import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const QuizResponseSchema = z.object({
  topicName: z.string().describe('Short descriptive title for this quiz'),
  questions: z.array(
    z.object({
      type: z.enum(['multiple_choice', 'true_false']).describe('Question type'),
      question: z.string().describe('The question text'),
      options: z
        .array(z.string())
        .describe('For multiple_choice: exactly 4 options. For true_false: exactly ["True","False"]'),
      correctAnswer: z.string().describe('Must exactly match one entry in options'),
    })
  ),
});

interface QuestionTypes {
  multipleChoice?: boolean;
  trueFalse?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { docUrl, docName, questionCount, questionTypes } = await request.json();

    if (!docUrl) {
      return NextResponse.json({ error: 'Document URL is required' }, { status: 400 });
    }

    if (typeof questionCount !== 'number' || questionCount < 1 || questionCount > 20) {
      return NextResponse.json(
        { error: 'Question count must be between 1 and 20.' },
        { status: 400 }
      );
    }

    const types: QuestionTypes = questionTypes || {};
    if (!types.multipleChoice && !types.trueFalse) {
      return NextResponse.json(
        { error: 'Select at least one question type.' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // 1. Fetch the document from internal MinIO proxy
    const host = request.headers.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const fullUrl = `${protocol}://${host}${docUrl}`;

    const fileResponse = await fetch(fullUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
    }

    // 2. Extract text from the document
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    let extractedText = '';
    const fileName = docName || '';
    const extension = fileName.split('.').pop()?.toLowerCase();

    if (extension === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse.js');
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
    } else if (['txt', 'md', 'csv'].includes(extension || '')) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      return NextResponse.json(
        { error: `File type .${extension} is not supported yet. Please use PDF or text files.` },
        { status: 400 }
      );
    }

    // Truncate if too long
    const maxChars = 50000;
    if (extractedText.length > maxChars) {
      extractedText = extractedText.substring(0, maxChars);
    }

    if (extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract enough text from this document to generate a quiz.' },
        { status: 400 }
      );
    }

    // 3. Build the prompt — clear, specific instructions
    let typeInstructions: string;
    if (types.multipleChoice && types.trueFalse) {
      typeInstructions = `Use a mix of question types, split roughly evenly between "multiple_choice" and "true_false". Every multiple_choice question must have exactly 4 answer options. Every true_false question must have options exactly ["True", "False"], in that order.`;
    } else if (types.multipleChoice) {
      typeInstructions = `Every question must be of type "multiple_choice" with exactly 4 answer options.`;
    } else {
      typeInstructions = `Every question must be of type "true_false" with options exactly ["True", "False"], in that order.`;
    }

    const prompt = `You are an expert academic tutor creating a quiz for a college student.

Based ONLY on the following document content, generate exactly ${questionCount} quiz questions that test understanding of the most important concepts. Also come up with a short, descriptive topic name (3-6 words) summarizing what this quiz covers.

${typeInstructions}

Rules:
- Every question must be answerable using ONLY the information in the provided document — do NOT use outside knowledge or invent facts
- correctAnswer must be verbatim identical to one of the entries in options
- Questions should be clear, unambiguous, and cover different concepts across the document, not just the beginning
- Do NOT repeat the same question or concept twice
- Use simple language that a student can quickly understand

--- DOCUMENT CONTENT ---
${extractedText}`;

    // 4. Call Gemini with structured output
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: z.toJSONSchema(QuizResponseSchema),
        temperature: 0.4,
      },
    });

    const parsed = QuizResponseSchema.parse(JSON.parse(response.text ?? '{}'));

    // 5. Post-generation validation — drop any question that violates the contract
    const validQuestions = parsed.questions.filter((question) => {
      if (!question.options.includes(question.correctAnswer)) {
        console.warn('Dropping quiz question: correctAnswer not found in options', question);
        return false;
      }
      if (question.type === 'multiple_choice' && question.options.length !== 4) {
        console.warn('Dropping quiz question: multiple_choice does not have exactly 4 options', question);
        return false;
      }
      if (
        question.type === 'true_false' &&
        !(question.options.length === 2 && question.options[0] === 'True' && question.options[1] === 'False')
      ) {
        console.warn('Dropping quiz question: true_false options are not exactly ["True", "False"]', question);
        return false;
      }
      return true;
    });

    if (validQuestions.length < 1) {
      return NextResponse.json(
        { error: 'Failed to generate a valid quiz. Please try again.' },
        { status: 500 }
      );
    }

    // 6. Assign stable ids
    const questionsWithIds = validQuestions.map((question) => ({
      id: randomUUID(),
      ...question,
    }));

    return NextResponse.json({ topicName: parsed.topicName, questions: questionsWithIds });
  } catch (error) {
    console.error('Quiz generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate quiz. Please try again.' },
      { status: 500 }
    );
  }
}
