import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { verifyRequestAuth } from '@/src/library/verifyAuth';
import { resolveInternalUrl, fetchInternal } from '@/src/library/pdfExtract';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { docUrl, docName, previousQuestions } = await request.json();

    if (!docUrl) {
      return NextResponse.json({ error: 'Document URL is required' }, { status: 400 });
    }
    if (!docUrl.startsWith(`/api/download?key=users%2F${auth.uid}%2F`) && !docUrl.startsWith(`/api/download?key=users/${auth.uid}/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // 1. Fetch the document from internal MinIO proxy
    const fullUrl = resolveInternalUrl(request, docUrl);

    const fileResponse = await fetchInternal(fullUrl);
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

Based ONLY on the following document content, generate exactly 10 flashcards that cover the most important key concepts.

Rules:
- Each question should test understanding of one specific concept
- Answers should be concise (1-2 sentences maximum)
- Questions should be clear and unambiguous
- Cover different topics across the document, not just the beginning
- Use simple language that a student can quickly understand
- Do NOT use information outside of this document`;

    if (previousQuestions && previousQuestions.length > 0) {
      prompt += `\n\nIMPORTANT: Do NOT repeat any of these previously generated questions:\n${previousQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}`;
      prompt += `\n\nGenerate 10 NEW and DIFFERENT flashcards covering other concepts from the document.`;
    }

    prompt += `\n\n--- DOCUMENT CONTENT ---\n${extractedText}`;

    // 4. Call Gemini with structured output (Kaggle Day 1: structured output)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              question: {
                type: SchemaType.STRING,
                description: 'A clear, concise question about a key concept from the document',
              },
              answer: {
                type: SchemaType.STRING,
                description: 'A brief, accurate answer in 1-2 sentences',
              },
            },
            required: ['question', 'answer'],
          },
        },
        temperature: 0.7,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const flashcards = JSON.parse(response.text());

    return NextResponse.json({ flashcards });
  } catch (error) {
    console.error('Flashcard generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate flashcards. Please try again.' },
      { status: 500 }
    );
  }
}