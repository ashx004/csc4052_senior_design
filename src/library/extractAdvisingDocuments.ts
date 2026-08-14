import { advisingExtractionSchema, } from "@/src/library/advisingSchemas";
import { extractPdfTextFromUrl } from "@/src/library/pdfExtract";
import { extractTranscriptWithOllama, extractCurriculumWithOllama, } from "@/src/library/advisingOllama";

export async function extractAdvisingDocuments(
  transcriptUrl: string,
  curriculumUrl: string
) {
  const transcriptText = await extractPdfTextFromUrl(transcriptUrl);
  const curriculumText = await extractPdfTextFromUrl(curriculumUrl);
  const transcriptResponse = await extractTranscriptWithOllama(transcriptText);
  const curriculumResponse = await extractCurriculumWithOllama(curriculumText);
  const transcriptResult = JSON.parse(transcriptResponse);
  const curriculumResult = JSON.parse(curriculumResponse);

  return advisingExtractionSchema.parse({
    transcript: transcriptResult,
    curriculum: curriculumResult,
    warnings: [
      ...(Array.isArray(transcriptResult.warnings)
        ? transcriptResult.warnings
        : []),

      ...(Array.isArray(curriculumResult.warnings)
        ? curriculumResult.warnings
        : []),
    ],
  });
}