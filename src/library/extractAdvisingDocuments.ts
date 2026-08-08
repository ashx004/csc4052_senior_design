//import { GoogleGenAI } from "@google/genai";
// import { z } from "zod";
import {
  advisingExtractionSchema,
  AdvisingExtraction,
} from "@/src/library/advisingSchemas";

// prompt im sending gemini about the pdfs //

const EXTRACTION_PROMPT = `
You are extracting structured university advising information
from two PDF documents.

DOCUMENT ORDER:
1. The first PDF is the student's transcript.
2. The second PDF is the student's curriculum sheet.

TRANSCRIPT INSTRUCTIONS:
- Extract every course attempt shown on the transcript.
- Include the course code, title, term, credits, grade, and
  course-level status.
- Include completed, failed, repeated, withdrawn, transferred,
  and in-progress courses.
- Do not extract academic standing, probation standing,
  honors standing, or similar standing information.
- Preserve course codes and titles as printed.
- Do not combine repeated attempts into one course.
- Do not invent missing values.
- Use null for information that is not displayed.

CURRICULUM INSTRUCTIONS:
- Extract every requirement needed for degree completion.
- Preserve prerequisites and corequisites explicitly shown.
- Separate specific required courses from choice groups.
- For a choice requirement, include every eligible course
  explicitly listed in the document.
- Record how many courses or credits must be selected.
- If a requirement does not list specific eligible courses,
  leave courseOptions empty and set optionsExplicitlyListed
  to false.
- Do not invent possible electives from outside knowledge.
- Extract every concentration, specialization, or track.
- For each concentration, extract its required courses,
  choice groups, prerequisites, and total credits.
- A course may appear in both the general curriculum and a
  concentration when the document displays it in both places.

ACCURACY:
- Use only information visible in the supplied PDFs.
- Put unclear, unreadable, contradictory, or incomplete
  information in warnings.
- sourceText should be a short supporting excerpt, not a
  whole page.
`;

export async function extractAdvisingDocuments(
  transcriptBuffer: Buffer,
  curriculumBuffer: Buffer
): Promise<AdvisingExtraction> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from the server environment.");
  }

  // const ai = new GoogleGenAI({ apiKey });

  /* const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",

    contents: [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: transcriptBuffer.toString("base64"),
        },
      },
      {
        inlineData: {
          mimeType: "application/pdf",
          data: curriculumBuffer.toString("base64"),
        },
      },
      { text: EXTRACTION_PROMPT, },
    ],

    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(advisingExtractionSchema),
    },
  }); */

  if (!response.text) {
    throw new Error("Gemini did not return extracted advising information.");
  }

  const parsedJson: unknown = JSON.parse(response.text);

  return advisingExtractionSchema.parse(parsedJson);
}