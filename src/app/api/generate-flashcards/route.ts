import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const FlashcardResponseSchema = z.object({
  topicName: z
    .string()
    .describe('A short, descriptive name (3-6 words) summarizing what this set of flashcards covers'),
  questions: z.array(
    z.object({
      question: z.string().describe('A clear, concise question about a key concept from the document'),
      answer: z.string().describe('A brief, accurate answer in 1-2 sentences'),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    const { docUrl, docName, previousQuestions } = await request.json();

    if (!docUrl) {
      return NextResponse.json({ error: 'Document URL is required' }, { status: 400 });
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
        { error: 'Could not extract enough text from this document to generate flashcards.' },
        { status: 400 }
      );
    }

    // 3. Build the prompt — clear, specific instructions (Kaggle Day 1: prompt engineering)
    let prompt = `You are an expert academic tutor helping a college student study.

Based ONLY on the following document content, generate exactly 10 flashcards that cover the most important key concepts. Also come up with a short, descriptive topic name (3-6 words) summarizing what this set of flashcards covers, e.g. "Evolution and Natural Selection" or "Boolean Logic Fundamentals".

Rules:
- Each question should test understanding of one specific concept
- Answers should be concise (1-2 sentences maximum)
- Questions should be clear and unambiguous
- Cover different topics across the document, not just the beginning
- Use simple language that a student can quickly understand
- Do NOT use information outside of this document
- The topic name should reflect the overall subject of the document, not a single flashcard`;

    if (previousQuestions && previousQuestions.length > 0) {
      prompt += `\n\nIMPORTANT: Do NOT repeat any of these previously generated questions:\n${previousQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`;
      prompt += `\n\nGenerate 10 NEW and DIFFERENT flashcards covering other concepts from the document.`;
    }

    prompt += `\n\n--- DOCUMENT CONTENT ---\n${extractedText}`;

    // 4. Call Gemini with structured output 
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: z.toJSONSchema(FlashcardResponseSchema),
        temperature: 0.7,
      },
    });

    const parsed = FlashcardResponseSchema.parse(JSON.parse(response.text ?? '{}'));

    return NextResponse.json({ topicName: parsed.topicName, questions: parsed.questions });
  } catch (error) {
    console.error('Flashcard generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate flashcards. Please try again.' },
      { status: 500 }
    );
  }
}