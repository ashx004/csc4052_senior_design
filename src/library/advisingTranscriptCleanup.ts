// Advising-only PDF text cleanup. Deliberately NOT part of pdfExtract.ts's
// extractPdfTextFromUrl, since that function is shared by every part of the
// app that reads PDFs (e.g. the AI assistant's general document reader via
// documentExtract.ts) — those callers need the PDF's full, unmodified text.
// This cleanup is specific to the advising transcript-extraction flow: it
// strips PII the Ollama model doesn't need (and which previously triggered
// a refusal) and removes per-term summary-stat noise that was getting
// merged onto course rows in some transcript layouts.

export function redactTranscriptPII(text: string): string {
  return text
    // remove birthdate entirely, not needed for course extraction
    .replace(/Born On:\s*[\d\-Xx]+/g, "")
    // "ID: " lines followed by a student ID
    .replace(/^ID:\s*.*/gm, "ID: [redacted]");
}

export function stripTranscriptSummaryNoise(text: string): string {
  return text
    // Per-term summary stats ("Current 10.00 10.00 10.00 40.00 4.000",
    // "Cumulative 40.00 40.00 40.00 133.00 3.325") can get merged onto
    // the same line as a course row when the stats table sits at nearly
    // the same vertical position as the course table in this transcript's
    // layout. None of this aggregate data is needed for course
    // extraction, so strip it from end of line.
    .replace(/\s+(Current|Cumulative)\s+[\d.\s]+$/gm, "")
    // "Standing: Good Standing" can be similarly merged onto a course row.
    .replace(/\s+Standing:\s*.*$/gm, "");
}

export function cleanTranscriptTextForOllama(text: string): string {
  return stripTranscriptSummaryNoise(redactTranscriptPII(text));
}