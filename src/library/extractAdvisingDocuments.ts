//import { GoogleGenAI } from "@google/genai";
// import { z } from "zod";
import {
  advisingExtractionSchema,
  AdvisingExtraction,
} from "@/src/library/advisingSchemas";

// prompt im sending gemini about the pdfs //

const EXTRACTION_PROMPT = 
`You are extracting structured university advising information
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

const TRANSCIPT_PROMPT = 
`For every course attempt, extract:
- course code
- course title
- term and year
- attempted credit hours
- earned credit hours, when shown
- grade
- course status
- transfer indicator, when shown
- repeat indicator, when shown

Ignore:
- academic standing
- probation
- honors
- cumulative standing statements

Do not combine repeated attempts.
Do not invent missing values.
Return valid JSON only.`

const CURRICULUM_PROMPT = 
`Extract:
- program name
- degree name
- catalog year
- total degree credits
- every required course
- prerequisites
- corequisites
- choose-from-list requirements
- every explicitly listed course option
- how many courses or credits must be selected
- open elective requirements
- all concentrations
- concentration descriptions
- concentration required courses
- concentration choice groups
- concentration prerequisites
- concentration total credits

Do not invent course options that are not shown.
Return valid JSON only.`

export async function extractAdvisingDocuments(
  transcriptBuffer: Buffer, 
  curriculumBuffer: Buffer
) {
  const transcriptText = await extractTextFromPdf(transcriptBuffer);
  const curriculumText = await extractTextFromPdf(curriculumBuffer);
  const transcriptResult = await extractTranscriptWithOllama(transcriptText);
  const curriculumResult = await extractCurriculumWithOllama(curriculumText);

  return advisingExtractionSchema.parse({
    transcript: transcriptResult,
    curriculum: curriculumResult,
    warnings: [ ...transcriptResult.warnings, ...curriculumResult.warnings,
    ],
  });
}