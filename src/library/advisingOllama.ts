import { z } from "zod";
import { resolveOllamaBaseUrl, resolveModelFromKey } from "@/src/library/ollamaClient";
import {
  transcriptExtractionSchema,
  curriculumExtractionSchema,
  curriculumRequirementSchema,
  concentrationSchema,
  generatedAdvisingScheduleSchema,
} from "@/src/library/advisingSchemas";

// Reply shapes for the curriculum calls, which each return one slice of
// curriculumExtractionSchema (they're merged in extractCurriculumWithOllama).
const programInfoReplySchema = curriculumExtractionSchema.pick({
  programName: true,
  degreeName: true,
  catalogYear: true,
  totalDegreeCredits: true,
  warnings: true,
});
const requirementsReplySchema = z.object({
  requirements: z.array(curriculumRequirementSchema),
  warnings: z.array(z.string()),
});
const concentrationsReplySchema = z.object({
  concentrations: z.array(concentrationSchema),
  warnings: z.array(z.string()),
});

// tapout at 5 mins
const OLLAMA_TIMEOUT_MS = Number(process.env.ADVISING_OLLAMA_TIMEOUT_MS) || 300000;

// Which model advising uses. One place to change it. Set OLLAMA_MODEL_ADVISING in
// .env to override without touching code.
const ADVISING_MODEL =
  process.env.OLLAMA_MODEL_ADVISING || resolveModelFromKey("museGlimmer");

// Context window. Ollama silently TRUNCATES input that does not fit, so it must
// cover prompt + transcript/curriculum text + the model's JSON reply (and any
// thinking tokens). Always sent - leaving it out falls back to Ollama's much
// smaller default window.
const ADVISING_NUM_CTX = Number(process.env.ADVISING_NUM_CTX) || 32768;

// Rough token estimate (~3.5 chars per token for English + JSON). Only used to
// budget the reply, so it errs on the high side.
function estimateTokens(messages: { content: string }[]): number {
  const chars = messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.ceil(chars / 3.5);
}

// Room left in the window after the input. num_predict above this can never
// be used - the reply would just hit the end of the window mid-JSON.
const MIN_REPLY_TOKENS = 2048;

// gpt-oss takes "low" | "medium" | "high". Other thinking models take true/false.
// Models WITHOUT thinking support reject the field, so "omit" sends nothing.
// ADVISING_THINK_MODE: "off" (send false - thinking disabled, fastest)
//                      "on"  (send true)
//                      "levels" (gpt-oss: low/medium/high)
//                      "omit" (default: send nothing, model decides)
function thinkPayload(level: "low" | "medium" | "high"): string | boolean | undefined {
  const mode = process.env.ADVISING_THINK_MODE ?? "omit";
  if (mode === "levels") return level;
  if (mode === "on") return true;
  if (mode === "off") return false;
  return undefined;
}


// The 30-minute outbound-fetch headers timeout (covering both individual
// Ollama calls and /api/advising-jobs/worker's server-to-server call) is set
// process-wide in src/instrumentation.ts, not here - see that file for why.


  // Returns just the JSON object from a model reply: handles ```json fences,
  // prose before/after, and braces inside strings.
  function stripJsonCodeFences(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced ? fenced[1] : text).trim();

    const start = candidate.indexOf("{");
    if (start === -1) { return candidate; }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (inString) {
        if (escaped) { escaped = false; }
        else if (ch === "\\") { escaped = true; }
        else if (ch === '"') { inString = false; }
        continue;
      }
      if (ch === '"') { inString = true; }
      else if (ch === "{") { depth++; }
      else if (ch === "}") {
        depth--;
        if (depth === 0) { return candidate.slice(start, i + 1); }
      }
    }
    return candidate; // unbalanced (truncated) - let JSON.parse report it
  }












type OllamaCallOptions = {
  think?: "low" | "medium" | "high";
  // Upper bound on the reply. The real limit is whatever room the input
  // leaves in ADVISING_NUM_CTX - see below.
  numPredict?: number;
  // Zod schema the reply must match. Sent to Ollama as `format`, which
  // constrains generation to that JSON shape (same as quiz/flashcards).
  schema?: z.ZodType;
};

// Failures that say nothing about the request itself - the Cloudflare tunnel
// timing out or erroring (502/503/504/524), or the connection dropping
// mid-stream. Worth another attempt; everything else (too-large input, auth,
// a truncated reply) would just fail the same way again.
class TransientOllamaError extends Error {}

// The input alone leaves too little of ADVISING_NUM_CTX for a reply. The
// curriculum steps catch this and fall back to page chunks.
class ContextTooLargeError extends Error {}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [5_000, 15_000];

async function callAdvisingOllama(
  messages: { role: string; content: string }[],
  options: OllamaCallOptions = {}
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await callAdvisingOllamaOnce(messages, options);
    } catch (error) {
      if (!(error instanceof TransientOllamaError) || attempt >= MAX_ATTEMPTS) {
        throw error;
      }
      const delay = RETRY_DELAYS_MS[attempt - 1];
      console.warn(`Ollama attempt ${attempt}/${MAX_ATTEMPTS} failed (${error.message}); retrying in ${delay / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function callAdvisingOllamaOnce(
  messages: { role: string; content: string }[],
  options: OllamaCallOptions
): Promise<string> {
  const think = options.think ?? "low";

  const inputTokens = estimateTokens(messages);
  const roomForReply = ADVISING_NUM_CTX - inputTokens;
  if (roomForReply < MIN_REPLY_TOKENS) {
    throw new ContextTooLargeError(
      `This document is too large for the AI's context window (~${inputTokens} tokens of input, ${ADVISING_NUM_CTX} available). Try raising ADVISING_NUM_CTX or uploading a shorter document.`
    );
  }
  const numPredict = Math.min(options.numPredict ?? roomForReply, roomForReply);
  const format = options.schema ? z.toJSONSchema(options.schema) : undefined;

  if (!process.env.OLLAMA_PRIMARY_URL) {
    throw new Error("OLLAMA_PRIMARY_URL is not configured."); }

  if (!process.env.OLLAMA_AUTH_TOKEN) {
    throw new Error("OLLAMA_AUTH_TOKEN is not configured."); }

  const baseUrl = await resolveOllamaBaseUrl(
    process.env.OLLAMA_PRIMARY_URL,
    process.env.OLLAMA_PRIMARY_FALLBACK_URL );

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, OLLAMA_TIMEOUT_MS);

  // A network-level failure (DNS, reset, tunnel hiccup) is transient; our own
  // timeout firing is not - another attempt would just wait just as long.
  const toTransient = (error: unknown): unknown =>
    controller.signal.aborted || error instanceof TransientOllamaError || !(error instanceof TypeError)
      ? error
      : new TransientOllamaError(`connection failed: ${error.message}`);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: ADVISING_MODEL,
        messages,
        stream: true,
        ...(thinkPayload(think) === undefined ? {} : { think: thinkPayload(think) }),
        ...(format ? { format } : {}),
        options: {
          temperature: 0,
          num_predict: numPredict,
          num_ctx: ADVISING_NUM_CTX,
        },
      }),
      signal: controller.signal,
    }).catch((error) => { throw toTransient(error); });

    if (!response.ok || !response.body) {
      const errorText = await response.text();

      // 502/503/504/524 come from the proxy in front of Ollama (e.g. Cloudflare's
      // 100-second limit while the model is still loading), and their body is a
      // full HTML error page that would otherwise be shown to the student.
      if ([502, 503, 504, 524].includes(response.status)) {
        throw new TransientOllamaError(
          "The AI server took too long to start responding (the connection timed out). The model may still be loading. Please wait a minute and try again."
        );
      }

      const looksLikeHtml = /<\s*(!doctype|html)/i.test(errorText);
      throw new Error(
        `Ollama request failed (${response.status}): ${looksLikeHtml ? "(HTML error page omitted)" : errorText.slice(0, 300)}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullContent = "";
    let buffer = "";
    let finalPayload: any = null;

    const handleLine = (line: string) => {
      if (!line.trim()) return;

      const parsed = JSON.parse(line); // each line is a JSON object when streaming

      // Ollama reports failures that happen after streaming starts (e.g. the
      // model crashing or running out of memory) as an {"error"} line.
      if (parsed.error) {
        throw new Error(`Ollama error: ${parsed.error}`);
      }

      if (parsed.message?.content) {
        fullContent += parsed.message.content;
      }

      if (parsed.done) {
        finalPayload = parsed;
      }
    };

    while (true) {
      const { done, value } = await reader.read().catch((error) => { throw toTransient(error); });

      if (done) { break; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep any partial line for next chunk
      lines.forEach(handleLine);
    }  // end of while loop

    handleLine(buffer + decoder.decode()); // final line may arrive without a trailing newline

    // The stream ended without Ollama's closing {"done": true} line, so the
    // connection dropped partway through the reply.
    if (!finalPayload) {
      throw new TransientOllamaError("the connection closed before the reply finished");
    }

       const tokensPerSecond = finalPayload?.eval_duration
         ? (finalPayload.eval_count / (finalPayload.eval_duration / 1e9)).toFixed(1)
         : "?";
       console.log(`Ollama ${finalPayload?.model}: done=${finalPayload?.done_reason}, tokens=${finalPayload?.eval_count}, ${tokensPerSecond} tok/s`);

       // "length" means the model was cut off (output limit or context window),
       // so the JSON is incomplete. Fail clearly instead of a confusing parse error.
       if (finalPayload?.done_reason === "length") {
         throw new Error(
           "Ollama stopped early (output or context limit reached), so the result is incomplete. Try raising ADVISING_NUM_CTX."
         );
       }

       if (!fullContent.trim()) {
         throw new Error("Ollama returned an empty response.");
       }

       return stripJsonCodeFences(fullContent);

     } finally { clearTimeout(timeout); }
   }











export async function extractTranscriptWithOllama(
  transcriptText: string
): Promise<string> {
  const messages = [
    {
      role: "system",
      content: `
You are extracting structured academic transcript information.

Return ONLY valid JSON.

For every course attempt, extract:
- courseCode
- courseTitle
- term
- creditHours
- grade
- status

Status must be one of:
- completed
- in-progress
- withdrawn
- failed
- transfer
- unknown

Status rules:
- "IP" -> "in-progress"
- "W" -> "withdrawn"
- "F" -> "failed"
- "D" -> "failed"
- "A" -> "completed"
- "B" -> "completed"
- "C" -> "completed"
- "P" -> "completed"

If the grade cannot be confidently determined, use:
- grade: null
- status: "unknown"

Never guess a grade.

Rules:

- Include every course attempt AND every identifiable accepted transfer course.
  The "courses" array must include:
  - courses taken at the current university
  - in-progress courses
  - failed or withdrawn attempts
  - repeated attempts
  - accepted transfer courses
  - accepted dual-enrollment courses shown on the transcript
- Do not combine repeated attempts.
- Ignore academic standing.
- Do not include Good Standing or similar standing information.
- Preserve course codes exactly as they appear.
- Preserve course titles.
- If information is missing, use null.
- IP means in-progress.
- Do not invent anything.
- The letter "R" may appear next to a grade to indicate that the course was repeated.
- "R" is NOT a grade.
- If a row contains something like "D R", the grade is "D".
- If a row contains something like "B R", the grade is "B".
- Do not return "R" as the course grade.
- Treat each attempt separately.
- Determine the status of each attempt from its actual grade.
- D or F means failed.
- A, B, C, or P means completed.
- IP means in-progress.

IMPORTANT UNREADABLE TRANSFER ROW RULE:

If the transfer coursework section contains rows showing credit hours,
grade, and quality points, but NO course code or course title is
present for that row, do NOT skip it silently and do NOT invent a
course code or title for it.

Instead, add exactly one warning to the warnings array in this exact
format:

"UNREADABLE_TRANSFER_ROWS: <count> rows totaling <sum> credit hours could not be matched to a course code or title."

Count every such row and sum their credit hours exactly as shown in
the transcript. Do not create course objects for these rows.

If there are no unreadable transfer rows, do not add this warning.

IMPORTANT TRANSFER CREDIT RULES:

Do NOT invent individual transfer courses.

Only create a course object with status "transfer" when the transcript
explicitly shows an identifiable individual transfer course row containing
a real course code.

If the transcript only shows:
- transfer totals
- transfer hours
- institution names
- summary credit
- originating institution totals
- accepted transfer credit totals

and does NOT explicitly show individual course codes, DO NOT create
individual transfer course objects.

Never infer transfer course codes from:
- degree requirements
- courses taken at the current university
- another section of the transcript
- outside knowledge
- similar-looking rows

A course taken at the current university must not be duplicated as a
transfer course unless the transcript explicitly lists a separate,
identifiable transfer-course row for that course.

If no individual transfer courses are explicitly identifiable, simply
omit transfer courses from the "courses" array.

Do not guess what courses were transferred.
Do not manufacture course codes, grades, titles, or credit hours for
transfer coursework.


IMPORTANT:

Extract course information exactly as it appears on the transcript.

Do not infer or correct transcript information using outside knowledge.
Only use the transcript text provided in the user message.

The transcript is the only source of truth for a student's course grade/status.

If a transcript grade is "IP":
- preserve the grade exactly as "IP"
- set status to "in-progress"

Never convert "IP" to "P".
Never mark a course with grade "IP" as completed.

IMPORTANT JSON KEY RULES:

Use these exact JSON field names:
- studentName
- major
- concentration
- catalogYear
- courses
- warnings
- courseCode
- courseTitle
- term
- creditHours
- grade
- status

Do not translate, rename, abbreviate, or replace any JSON key.
Use "courseTitle" exactly.
Never use non-English field names.

Return this exact structure:

{
  "studentName": string | null,
  "major": string | null,
  "concentration": string | null,
  "catalogYear": string | null,
  "courses": [
    {
      "courseCode": string,
      "courseTitle": string | null,
      "term": string | null,
      "creditHours": number | null,
      "grade": string | null,
      "status": string
    }
  ],
  "warnings": string[]
}

- Extract catalogYear only if explicitly shown on the transcript.
- If catalogYear is not shown, return null.
- Always return a warnings array.
- If there are no warnings, return [].

IMPORTANT COURSE CODE RULE:

Course numbers may legitimately contain either 3 digits or 4 digits.

Do NOT assume that a 4-digit course number is a 3-digit course number
with the credit hours accidentally attached.

Examples of valid course codes may include:

CSC 220
CSC 4052
CSC 4061
CSC 4913

Preserve the complete course code exactly as it appears in the transcript.

The transcript may contain older 3-digit course codes and newer 4-digit
course codes because course numbering systems can change over time.

Do not shorten, normalize, or modify a 4-digit course code simply because
the final digit matches the number of credit hours.

Use the transcript row structure to identify the course code, course title,
grade, and credit hours as separate fields.

For example:

CSC 4052 SENIOR CAPSTONE I IP 2.00

must be extracted as:

courseCode: "CSC 4052"
courseTitle: "SENIOR CAPSTONE I"
grade: "IP"
creditHours: 2
status: "in-progress"

And:

CSC 4061 SENIOR CAPSTONE II IP 1.00

must be extracted as:

courseCode: "CSC 4061"
courseTitle: "SENIOR CAPSTONE II"
grade: "IP"
creditHours: 1
status: "in-progress"

Do not change:

CSC 4052 -> CSC 405

Do not change:

CSC 4061 -> CSC 406


IMPORTANT ROMAN NUMERAL AND IP RULE:

Roman numerals such as I, II, III, IV, etc. may be part of a course title.

The grade "IP" appears after the full course title.

Do not confuse the Roman numeral at the end of a course title with the
grade "IP".

For example:

SENIOR CAPSTONE I IP

means:

courseTitle: "SENIOR CAPSTONE I"
grade: "IP"

And:

SENIOR CAPSTONE II IP

means:

courseTitle: "SENIOR CAPSTONE II"
grade: "IP"

Never increment or alter Roman numerals in course titles.

Do not convert:

"SENIOR CAPSTONE I" -> "SENIOR CAPSTONE II"

Do not convert:

"SENIOR CAPSTONE II" -> "SENIOR CAPSTONE III"

If the row contains grade "IP":
- preserve grade as "IP"
- set status to "in-progress"
- never convert "IP" to "P"
- never mark the course completed


IMPORTANT TABLE COLUMN ALIGNMENT RULE:

Curriculum PDFs may contain multiple academic terms as side-by-side columns.

When extracted to plain text, rows from adjacent columns may appear on the
same line.

Do not shift a course title from one course code to a neighboring course code.

A title belongs only to the course entry in the same table cell/column.

If a course code is present but its title cannot be confidently associated
with that code from the extracted text, use:

courseTitle: null

rather than borrowing the title from the next course.

Never increment Roman numerals in course titles because neighboring columns
contain later courses.

For example, do not turn a sequence equivalent to:

COURSE A
COURSE B "Capstone I"
COURSE C "Capstone II"

into:

COURSE A "Capstone I"
COURSE B "Capstone II"
COURSE C "Capstone III"

IMPORTANT WRAPPED COURSE TITLE RULE:

Course titles that are too long to fit on one line may wrap onto the
next line in the extracted text. A wrapped title produces a short line
by itself that contains ONLY leftover title text — no course code, no
grade, no credit hours, no quality points.

If a line contains only text with no course code, no grade, and no
numeric columns, and the immediately preceding line's title appears to
end mid-phrase (for example ending in "&", "AND", "OR", "OF", "FOR",
"TO", "IN", or another word that clearly does not end a title), treat
that line as the continuation of the previous course's title. Append
it to the previous title with a single space.

Example:

DATA MODEL SELECTION &
VALIDATION

must be extracted as a single course with:

courseTitle: "DATA MODEL SELECTION & VALIDATION"

Do NOT drop the wrapped continuation line.
Do NOT treat the wrapped continuation line as a separate course.
Do NOT truncate the title at the line break.

This same wrapping can happen to any course title, not only specific
examples shown here. Always check whether a short trailing line is a
continuation of the previous course's title before deciding it is
something else.

IMPORTANT: DO NOT SILENTLY OMIT ANY COURSE ROW.

Every row in the course table that has a course code, grade, and credit
hours MUST appear in the output courses array — even if it looks
similar to another course already extracted, even if two terms in a
row have very similar course codes or titles, and even in long
transcripts with many terms.

Before finalizing your output, count the number of course rows in the
input text and confirm your courses array has the same number of
entries. If your count is lower, go back through the text and find the
row(s) you missed.


      `,
    },

    {
      role: "user",
      content: transcriptText,
    },
  ];

  return callAdvisingOllama(messages, { think: "medium", schema: transcriptExtractionSchema });
}


























type RawRequirement = Record<string, unknown>;
type RawCourseOption = Record<string, unknown>;
type RawConcentration = Record<string, unknown>;


/*
  Makes sure Ollama always returns the exact fields
  required by advisingSchemas.ts.
*/

function normalizeCourseOption(
  option: RawCourseOption
) {
  return {
    courseCode:
      typeof option.courseCode === "string"
        ? option.courseCode
        : "",

    courseTitle:
      typeof option.courseTitle === "string"
        ? option.courseTitle
        : null,

    creditHours:
      typeof option.creditHours === "number"
        ? option.creditHours
        : null,

    minimumGrade:
      typeof option.minimumGrade === "string"
        ? option.minimumGrade
        : null,

    prerequisites:
      Array.isArray(option.prerequisites)
        ? option.prerequisites.filter(
            (value): value is string =>
              typeof value === "string"
          )
        : [],

    corequisites:
      Array.isArray(option.corequisites)
        ? option.corequisites.filter(
            (value): value is string =>
              typeof value === "string"
          )
        : [],
  };
}


function normalizeRequirement(
  requirement: RawRequirement
) {
  const allowedTypes = [
    "specific-course",
    "choose-from-list",
    "open-elective",
    "credit-requirement",
    "other",
  ] as const;

  let requirementType =
    typeof requirement.requirementType === "string" &&
    allowedTypes.includes(
      requirement.requirementType as
        (typeof allowedTypes)[number]
    )
      ? requirement.requirementType
      : "other";

  if (
    Array.isArray(requirement.courseOptions) &&
    requirement.courseOptions.length > 1
  ) {
    requirementType = "choose-from-list";
  }


  const rawEligibilityRules =
    typeof requirement.eligibilityRules === "object" &&
    requirement.eligibilityRules !== null

      ? requirement.eligibilityRules as Record<
          string,
          unknown
        >

      : null;


    const eligibilityRules =
      rawEligibilityRules

        ? {
            allowedCourseCodes:
              Array.isArray(
                rawEligibilityRules
                  .allowedCourseCodes
              )
                ? rawEligibilityRules
                    .allowedCourseCodes
                    .filter(
                      (value): value is string =>
                        typeof value === "string"
                    )
                : [],


            allowedSubjectPrefixes:
              Array.isArray(
                rawEligibilityRules
                  .allowedSubjectPrefixes
              )
                ? rawEligibilityRules
                    .allowedSubjectPrefixes
                    .filter(
                      (value): value is string =>
                        typeof value === "string"
                    )
                : [],


            minimumCourseLevel:
              typeof rawEligibilityRules
                .minimumCourseLevel === "number"

                ? rawEligibilityRules
                    .minimumCourseLevel

                : null,


            maximumCourseLevel:
              typeof rawEligibilityRules
                .maximumCourseLevel === "number"

                ? rawEligibilityRules
                    .maximumCourseLevel

                : null,


            excludedCourseCodes:
              Array.isArray(
                rawEligibilityRules
                  .excludedCourseCodes
              )
                ? rawEligibilityRules
                    .excludedCourseCodes
                    .filter(
                      (value): value is string =>
                        typeof value === "string"
                    )
                : [],


            sourceText:
              typeof rawEligibilityRules
                .sourceText === "string"

                ? rawEligibilityRules
                    .sourceText

                : null,
          }

        : null;

  return {
    requirementId:
      typeof requirement.requirementId === "string"
        ? requirement.requirementId
        : "unknown-requirement",

    requirementName:
      typeof requirement.requirementName === "string"
        ? requirement.requirementName
        : "Unknown Requirement",

    description:
      typeof requirement.description === "string"
        ? requirement.description
        : "",

    requirementType,

    numberRequired:
      typeof requirement.numberRequired === "number"
        ? requirement.numberRequired
        : null,

    creditsRequired:
      typeof requirement.creditsRequired === "number"
        ? requirement.creditsRequired
        : null,

    courseCode:
      typeof requirement.courseCode === "string"
        ? requirement.courseCode
        : null,

    courseTitle:
      typeof requirement.courseTitle === "string"
        ? requirement.courseTitle
        : null,

    minimumGrade:
      typeof requirement.minimumGrade === "string"
        ? requirement.minimumGrade
        : null,

    prerequisites:
      Array.isArray(requirement.prerequisites)
        ? requirement.prerequisites.filter(
            (value): value is string =>
              typeof value === "string"
          )
        : [],

    corequisites:
      Array.isArray(requirement.corequisites)
        ? requirement.corequisites.filter(
            (value): value is string =>
              typeof value === "string"
          )
        : [],

    courseOptions:
      Array.isArray(requirement.courseOptions)
        ? requirement.courseOptions
            .filter(
              (option): option is RawCourseOption =>
                typeof option === "object" &&
                option !== null
            )
            .map(normalizeCourseOption)
        : [],

    optionsExplicitlyListed:
      typeof requirement.optionsExplicitlyListed ===
      "boolean"
        ? requirement.optionsExplicitlyListed
        : Array.isArray(requirement.courseOptions) &&
          requirement.courseOptions.length > 0,

    eligibilityRules,

    sourceText:
      typeof requirement.sourceText === "string"
        ? requirement.sourceText
        : "",
  };
}


type NormalizedRequirement = ReturnType<typeof normalizeRequirement>;

/*
  Curriculum tables often write an alternative on its own line under the
  course it replaces:

    CSC 450  Computer Networks        3
      or 475 Artificial Intelligence

  The model tends to turn that "or 475" line into a SEPARATE required course
  (confirmed on the CS curriculum's Cloud Computing concentration), so a
  student who took CSC 450 still showed CSC 475 as remaining. Its sourceText
  keeps the leading "or", so merge any such row into the row above it as one
  choose-from-list requirement.
*/
function mergeOrContinuationRequirements(
  requirements: NormalizedRequirement[]
): NormalizedRequirement[] {

  const merged: NormalizedRequirement[] = [];

  const asOptions = (requirement: NormalizedRequirement, fallbackCredits: number | null) =>
    requirement.courseOptions.length > 0
      ? requirement.courseOptions
      : requirement.courseCode
        ? [{
            courseCode: requirement.courseCode,
            courseTitle: requirement.courseTitle,
            creditHours: requirement.creditsRequired ?? fallbackCredits,
            minimumGrade: requirement.minimumGrade,
            prerequisites: requirement.prerequisites,
            corequisites: requirement.corequisites,
          }]
        : [];

  for (const requirement of requirements) {
    const previous = merged[merged.length - 1];
    const isOrRow = /^\s*or\b/i.test(requirement.sourceText);

    if (!previous || !isOrRow || asOptions(requirement, null).length === 0) {
      merged.push(requirement);
      continue;
    }

    const credits = previous.creditsRequired;
    merged[merged.length - 1] = {
      ...previous,
      requirementType: "choose-from-list",
      requirementName: `${previous.requirementName} or ${requirement.requirementName}`,
      courseCode: null,
      courseTitle: null,
      numberRequired: previous.numberRequired ?? 1,
      courseOptions: [...asOptions(previous, credits), ...asOptions(requirement, credits)],
      optionsExplicitlyListed: true,
      prerequisites: [],
      corequisites: [],
      sourceText: `${previous.sourceText}\n${requirement.sourceText}`,
    };
  }

  return merged;
}


function normalizeConcentration(
  concentration: RawConcentration
) {
  return {
    concentrationName:
      typeof concentration.concentrationName === "string"
        ? concentration.concentrationName
        : "Unknown Concentration",

    description:
      typeof concentration.description === "string"
        ? concentration.description
        : "",

    totalCredits:
      typeof concentration.totalCredits === "number"
        ? concentration.totalCredits
        : null,

    requirements:
      Array.isArray(concentration.requirements)
        ? mergeOrContinuationRequirements(
            concentration.requirements
              .filter(
                (
                  requirement
                ): requirement is RawRequirement =>
                  typeof requirement === "object" &&
                  requirement !== null
              )
              .map(normalizeRequirement)
          )
        : [],

    sourceText:
      typeof concentration.sourceText === "string"
        ? concentration.sourceText
        : "",
  };
}



/*
  Extract only concentrations.
*/

async function extractConcentrationsFromTextWithOllama(
  curriculumText: string
): Promise<string> {

  return callAdvisingOllama([
    { role: "system", content: `

      You are extracting ONLY concentration, track,
      specialization, or emphasis requirements from a
      university curriculum.

      Do NOT extract the general program requirements.

      Return ONLY valid JSON.

      Return exactly:

      {
        "concentrations": [
          {
            "concentrationName": string,
            "description": string,
            "totalCredits": number | null,

            "requirements": [
              {
                "requirementId": string,
                "requirementName": string,
                "description": string,

                "requirementType":
                  "specific-course" |
                  "choose-from-list" |
                  "open-elective" |
                  "credit-requirement" |
                  "other",

                "numberRequired": number | null,
                "creditsRequired": number | null,

                "courseCode": string | null,
                "courseTitle": string | null,
                "minimumGrade": string | null,

                "prerequisites": string[],
                "corequisites": string[],

                "courseOptions": [
                  {
                    "courseCode": string,
                    "courseTitle": string | null,
                    "creditHours": number | null,
                    "minimumGrade": string | null,
                    "prerequisites": string[],
                    "corequisites": string[]
                  }
                ],

                "optionsExplicitlyListed": boolean,
                "eligibilityRules": {
                "allowedCourseCodes": string[],
                "allowedSubjectPrefixes": string[],
                "minimumCourseLevel": number | null,
                "maximumCourseLevel": number | null,
                "excludedCourseCodes": string[],
                "sourceText": string | null
              },
                "sourceText": string
              }
            ],

            "sourceText": string
          }
        ],

        "warnings": string[]
      }


      RULES:

      - Extract every clearly identified concentration.
      - Each concentration must use requirements.
      - Do not use requiredCourses.
      - Do not use choiceRequirements.
      - If courses are connected by "or", create ONE
        choose-from-list requirement.
      - Do not treat alternatives as separately required courses.
      - A line that STARTS with "or" is an alternative to the course on
        the line directly above it, not a new requirement. For example:
          CSC 450 Computer Networks 3
          or 475 Artificial Intelligence
        is ONE choose-from-list requirement with courseOptions
        CSC 450 and CSC 475 (numberRequired 1).
      - Do not invent courses.
      - Do not invent prerequisites.
      - Do not invent corequisites.
      - Do not use outside knowledge.
      - For elective or flexible requirements, extract eligibilityRules only when the curriculum explicitly states the rule.
      - Never infer approved subjects, departments, or courses.
      - Never create approved-course lists from general knowledge.
      - If exact courses are explicitly listed, put them in allowedCourseCodes.
      - If a subject prefix is explicitly stated, put it in allowedSubjectPrefixes.
      - If a course level is explicitly stated, put it in minimumCourseLevel and/or maximumCourseLevel.
      - If exclusions are explicitly stated, put them in excludedCourseCodes.
      - If no eligibility rule is given, use empty arrays and null values.

      EVERY requirement MUST contain:
      - requirementId
      - requirementName
      - description
      - requirementType
      - numberRequired
      - creditsRequired
      - courseCode
      - courseTitle
      - minimumGrade
      - prerequisites
      - corequisites
      - courseOptions
      - optionsExplicitlyListed
      - sourceText

      If minimumGrade is not shown:
      "minimumGrade": null

      If courseCode is not applicable:
      "courseCode": null

      If courseTitle is not applicable:
      "courseTitle": null

      If there are no prerequisites:
      "prerequisites": []

      If there are no corequisites:
      "corequisites": []

      If there are no course options:
      "courseOptions": []

      If options are not explicitly listed:
      "optionsExplicitlyListed": false

      Every courseOptions item MUST contain:
      - courseCode
      - courseTitle
      - creditHours
      - minimumGrade
      - prerequisites
      - corequisites

      Return ONLY valid JSON.
      `,
    },

    { role: "user", content: curriculumText },
  ],
    { think: "medium", schema: concentrationsReplySchema },
);
}



/*
  Extract only general program information.
*/

async function extractProgramInfoFromTextWithOllama(
  curriculumText: string
): Promise<string> {

  return callAdvisingOllama([
    {
      role: "system",
      content: `

    Return ONLY valid JSON.

    Extract ONLY:

    {
      "programName": string | null,
      "degreeName": string | null,
      "catalogYear": string | null,
      "totalDegreeCredits": number | null,
      "warnings": string[]
    }

    Do not extract requirements.
    Do not extract concentrations.
    Do not invent anything.
          `,
        },

        { role: "user", content: curriculumText, },
      ], { schema: programInfoReplySchema });
    }



    // Cloudflare's 524 fires on time-to-first-byte, not total request
    // duration - a large curriculum document makes the model "think" for a
    // long time before it emits anything, and THAT silent stretch is what
    // trips the tunnel's ~100s cap (confirmed live 2026-09-22 on a large
    // HIIM curriculum). Splitting into smaller page-grouped pieces keeps
    // each individual call's up-front thinking time lower. Chunks overlap
    // by one page so a requirement row split across a page boundary isn't
    // silently lost to one chunk or the other.
    const CURRICULUM_CHUNK_TARGET_CHARS = 6000;
    const CURRICULUM_CHUNK_OVERLAP_PAGES = 1;

    function splitCurriculumIntoChunks(curriculumText: string): string[] {
      const pages = curriculumText.split(/(?=--- PAGE \d+ ---)/g).filter((page) => page.trim());
      if (pages.length <= 1) return [curriculumText];

      const chunks: string[] = [];
      let current: string[] = [];
      let currentLength = 0;

      for (let i = 0; i < pages.length; i++) {
        current.push(pages[i]);
        currentLength += pages[i].length;

        const isLast = i === pages.length - 1;
        if (currentLength >= CURRICULUM_CHUNK_TARGET_CHARS || isLast) {
          chunks.push(current.join("\n\n"));
          current = !isLast ? current.slice(-CURRICULUM_CHUNK_OVERLAP_PAGES) : [];
          currentLength = current.reduce((sum, page) => sum + page.length, 0);
        }
      }

      return chunks;
    }

    // The one-page overlap between chunks means a requirement sitting on
    // that shared page gets extracted twice. Two independent calls won't
    // agree on a requirementId, but they will (should) quote the exact same
    // sourceText from the curriculum - use that as the dedupe key.
    function dedupeRequirementsBySourceText(requirements: RawRequirement[]): RawRequirement[] {
      const seen = new Set<string>();
      const deduped: RawRequirement[] = [];
      for (const requirement of requirements) {
        const key =
          typeof requirement.sourceText === "string" && requirement.sourceText.trim()
            ? requirement.sourceText.trim()
            : JSON.stringify(requirement);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(requirement);
      }
      return deduped;
    }

    /*
      Program info (name, degree, catalog year, total credits) is normally
      read from the whole curriculum in one call. If the document is too big
      for the context window, the first chunk (the title page, where that
      information sits) is the best single substitute.
    */
    async function extractProgramInfoWithOllama(
      curriculumText: string
    ): Promise<string> {
      try {
        return await extractProgramInfoFromTextWithOllama(curriculumText);
      } catch (error) {
        if (!(error instanceof ContextTooLargeError)) throw error;
        console.log("PROGRAM INFO EXTRACTION: document too large, using first chunk");
        return extractProgramInfoFromTextWithOllama(splitCurriculumIntoChunks(curriculumText)[0]);
      }
    }

    /*
      Concentrations are normally extracted from the whole curriculum in one
      call, because a concentration's courses can span several pages. If the
      document is too big for the context window, extract per chunk instead
      and merge concentrations that share a name across chunks.
    */
    async function extractConcentrationsWithOllama(
      curriculumText: string
    ): Promise<string> {
      try {
        return await extractConcentrationsFromTextWithOllama(curriculumText);
      } catch (error) {
        if (!(error instanceof ContextTooLargeError)) throw error;
      }

      const chunks = splitCurriculumIntoChunks(curriculumText);
      const byName = new Map<string, RawConcentration & { requirements: RawRequirement[] }>();
      const allWarnings: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        console.log(`CONCENTRATION EXTRACTION (document too large): chunk ${i + 1}/${chunks.length}`);

        const parsed = JSON.parse(await extractConcentrationsFromTextWithOllama(chunks[i]));
        if (Array.isArray(parsed.warnings)) allWarnings.push(...parsed.warnings);

        for (const concentration of Array.isArray(parsed.concentrations) ? parsed.concentrations : []) {
          const key = String(concentration.concentrationName ?? "").trim().toLowerCase();
          const existing = byName.get(key);
          if (!existing) {
            byName.set(key, { ...concentration, requirements: [...(concentration.requirements ?? [])] });
            continue;
          }
          existing.requirements.push(...(concentration.requirements ?? []));
          existing.description ||= concentration.description;
          existing.totalCredits ??= concentration.totalCredits;
        }
      }

      return JSON.stringify({
        concentrations: [...byName.values()].map((concentration) => ({
          ...concentration,
          requirements: dedupeRequirementsBySourceText(concentration.requirements),
        })),
        warnings: allWarnings,
      });
    }

    /*
      Extract only the main degree requirements. Runs one Ollama call per
      curriculum chunk (see splitCurriculumIntoChunks above) instead of one
      call over the whole document, then merges the results.
    */
    async function extractMainCurriculumWithOllama(
      curriculumText: string
    ): Promise<string> {

      const chunks = splitCurriculumIntoChunks(curriculumText);
      const allRequirements: RawRequirement[] = [];
      const allWarnings: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        console.log(`MAIN REQUIREMENTS EXTRACTION: chunk ${i + 1}/${chunks.length}`);

        const response = await extractMainCurriculumChunkWithOllama(chunks[i]);
        const parsed = JSON.parse(response);

        if (Array.isArray(parsed.requirements)) allRequirements.push(...parsed.requirements);
        if (Array.isArray(parsed.warnings)) allWarnings.push(...parsed.warnings);
      }

      return JSON.stringify({
        requirements: dedupeRequirementsBySourceText(allRequirements),
        warnings: allWarnings,
      });
    }

    async function extractMainCurriculumChunkWithOllama(
      curriculumText: string
    ): Promise<string> {

      return callAdvisingOllama([
        { role: "system", content: `

    Return ONLY valid JSON.

    Extract every general degree requirement described in the curriculum
    text below. This may be only part of a larger curriculum document (it
    could start or end mid-section) - extract only what is explicitly shown
    in this excerpt. Do not comment on, guess at, or flag content that might
    appear before or after this excerpt.
    Do NOT extract concentration-specific requirements.


    CLARIFICATION ON "DO NOT EXTRACT CONCENTRATION-SPECIFIC REQUIREMENTS":

    This exclusion applies ONLY to requirements listed under an explicitly
    labeled optional track/concentration/specialization/emphasis section —
    i.e., a section the curriculum itself names as a concentration, track,
    specialization, or emphasis, usually presented as one choice among
    several alternative concentration options.

    This exclusion does NOT apply to a program's own core major
    requirements, even when every course shares the same subject prefix
    (e.g., a Health Informatics program whose required courses are all
    prefixed "HIIM", or a Nursing program whose required courses are all
    prefixed "NURS"). A subject prefix matching the program's own name is
    NOT evidence that a course belongs to an optional concentration — it is
    normal for a major's core required courses to share the major's own
    subject code.

    If the curriculum text does not explicitly present multiple named
    concentration/track options for the student to choose between, treat
    ALL listed courses — regardless of subject prefix — as general degree
    requirements to extract.

    Return:

    {
      "requirements": [
        {
          "requirementId": string,
          "requirementName": string,
          "description": string,

          "requirementType":
            "specific-course" |
            "choose-from-list" |
            "open-elective" |
            "credit-requirement" |
            "other",

          "numberRequired": number | null,
          "creditsRequired": number | null,

          "courseCode": string | null,
          "courseTitle": string | null,
          "minimumGrade": string | null,

          "prerequisites": string[],
          "corequisites": string[],

          "courseOptions": [
            {
              "courseCode": string,
              "courseTitle": string | null,
              "creditHours": number | null,
              "minimumGrade": string | null,
              "prerequisites": string[],
              "corequisites": string[]
            }
          ],

          "optionsExplicitlyListed": boolean,

          "eligibilityRules": {
            "allowedCourseCodes": string[],
            "allowedSubjectPrefixes": string[],
            "minimumCourseLevel": number | null,
            "maximumCourseLevel": number | null,
            "excludedCourseCodes": string[],
            "sourceText": string | null
          },

          "sourceText": string
        }
      ],

      "warnings": string[]
    }

    Rules:

    - Scan the ENTIRE curriculum and extract every general requirement.
    - A single required course = "specific-course".
    - Explicit alternatives such as A or B = ONE "choose-from-list".
    - A line that STARTS with "or" (e.g. "or 475 Artificial Intelligence")
      is an alternative to the course on the line directly above it - put
      both in ONE "choose-from-list", never a separate requirement.
    - An elective without exact choices = "open-elective".
    - Credit-hour-only requirements = "credit-requirement".
    - GPA, standing, permission, and similar rules = "other".
    - If the same elective appears multiple times, combine it and set numberRequired and creditsRequired correctly.
    - Never invent courses, prerequisites, corequisites, titles, or elective rules.
    - Preserve course codes exactly as shown.
    - Course code, title, credits, and prerequisites must come from the same row.
    - If a title cannot be confidently matched to a course code, use null.
    - For flexible/elective requirements, fill eligibilityRules only from rules explicitly stated in the curriculum.
    - If no eligibility rule is stated, use empty arrays and null values.
    - Use null for missing nullable values and [] for missing arrays.
    - Never omit required fields.
    - Do not use outside knowledge.

    IMPORTANT: DO NOT BORROW A TITLE FROM AN ADJACENT COURSE ROW.

    This rule applies to EVERY subject area in the curriculum — not just one
    department. Any subject's course table can have this layout problem.

    Some curriculum tables list several course codes on the same line before
    their titles appear, e.g.:

    CSC 403 * 3 CSC 405 * Senior Capstone I 2 CSC 406 Senior Capstone II 1

    or equally:

    ENGL 200 * 3 ENGL 210 Intro to British Literature 3 ENGL 211 Intro to American Literature 3

    or:

    MATH 100 3 MATH 241 Calculus I 3 MATH 242 Calculus II 3

    In this pattern, each course code is followed by its OWN credit hours
    (and possibly a footnote marker like "*"), and only SOME of the codes on
    the line have an actual title attached before the next course code
    begins. Do NOT assume a title belongs to the earliest course code on the
    line — a title always belongs to the course code immediately preceding
    it, never an earlier code on the same row, regardless of subject.

    If a course code is followed directly by a number (credit hours) or a
    footnote marker with no title text in between, its courseTitle MUST be
    null. Do not borrow the next course's title to fill the gap, no matter
    which subject area it belongs to.

    This applies uniformly across ALL subjects in the curriculum: math,
    English, science, business, engineering, education, or any other
    department — the same row-parsing rule holds regardless of what the
    course codes look like.

    Example: in the CSC line above, CSC 403 has courseTitle: null (only a
    credit-hour value follows it), CSC 405 has courseTitle: "Senior Capstone
    I", and CSC 406 has courseTitle: "Senior Capstone II" — each title stays
    attached to the exact code that precedes it, not the one before that.

    IMPORTANT: PREREQUISITES MUST BE ACTUAL COURSE CODES ONLY.

    The prerequisites array must contain ONLY real course codes in
    SUBJECT + NUMBER format (e.g. "CSC 132", "MATH 240").

    NEVER put timing/policy restrictions (e.g. "must be taken within
    first year of enrollment") into the prerequisites array.

    Each array element is ONE required prerequisite:
    - Courses that are ALL required ("and", commas) are separate elements.
    - Courses that are ALTERNATIVES ("or") stay together in ONE element,
      joined with " or ".

    Example: "CSC 132 or CYEN 132, MATH 240" becomes
    prerequisites: ["CSC 132 or CYEN 132", "MATH 240"]
    Example: "CSC 220, MATH 311" becomes
    prerequisites: ["CSC 220", "MATH 311"]

    If a note describes a timing rule, eligibility restriction, or any
    other non-course requirement, do NOT put it in prerequisites at all —
    put that wording in the requirement's description or sourceText field
    instead, where it belongs.

    Return ONLY valid JSON.
          
      `,
    },
        { role: "user", content: curriculumText, }, ], 
        { think: "medium", schema: requirementsReplySchema });
}


/*
  Curriculum tables flatten badly: side-by-side columns run together, and
  the model drops rows. Confirmed on the CS curriculum: CSC 430 ("430 CSC 220
  3 R 6") was never extracted, and FYE 100 only appears in the checklist's
  PREREQUISITE column next to COMM 101, so it never became a requirement even
  though the program requires it (1 credit, freshman year).

  The same curriculum's term-by-term plan lists every course cleanly as
  "CODE Title credits" ("FYE 100 Freshman Year Experience 1"). Any course
  written that way that isn't already a requirement, choice option or
  concentration course is added as a required course. The title must contain
  lowercase letters, which filters out all-caps table noise ("GPA 262",
  "HOURS 120") and prerequisite lists ("MATH 112 or 240").
*/
const PLAN_COURSE_LINE =
  /\b([A-Z]{2,5}) (\d{3,4})\s+([A-Z][A-Za-z.&,'\/-]*(?: [A-Za-z.&,'\/-]+)*?)\s+(\d)(?=\s|$)/g;

function recoverPlanCoursesMissingFromRequirements(
  curriculumText: string,
  requirements: NormalizedRequirement[],
  concentrations: ReturnType<typeof normalizeConcentration>[]
): NormalizedRequirement[] {

  const key = (code: string) => code.replace(/\s+/g, "").toUpperCase();
  const covered = new Set<string>();

  for (const requirement of [...requirements, ...concentrations.flatMap((c) => c.requirements)]) {
    for (const code of [
      requirement.courseCode,
      ...requirement.courseOptions.map((option) => option.courseCode),
      ...(requirement.eligibilityRules?.allowedCourseCodes ?? []),
    ]) {
      if (code) covered.add(key(code));
    }
  }

  const recovered = new Map<string, NormalizedRequirement>();

  for (const [line, subject, number, title, credits] of curriculumText.matchAll(PLAN_COURSE_LINE)) {
    const courseCode = `${subject} ${number}`;
    if (!/[a-z]/.test(title) || covered.has(key(courseCode)) || recovered.has(key(courseCode))) continue;

    recovered.set(key(courseCode), normalizeRequirement({
      requirementId: `plan-${key(courseCode).toLowerCase()}`,
      requirementName: `${courseCode} ${title}`,
      description: "Listed in the curriculum's term-by-term plan.",
      requirementType: "specific-course",
      numberRequired: 1,
      creditsRequired: Number(credits),
      courseCode,
      courseTitle: title,
      sourceText: line.trim(),
    }));
  }

  if (recovered.size > 0) {
    console.log(`PLAN COURSES ADDED AS REQUIREMENTS: ${[...recovered.values()].map((r) => r.courseCode).join(", ")}`);
  }
  return [...recovered.values()];
}


/*
  Run the three smaller curriculum extractions,
  normalize them, then combine them.
*/

export async function extractCurriculumWithOllama(
  curriculumText: string
): Promise<string> {

  console.log("STARTING PROGRAM INFO EXTRACTION");

  const programInfoResponse =
    await extractProgramInfoWithOllama(
      curriculumText
    );

  console.log("STARTING MAIN REQUIREMENTS EXTRACTION");

  const mainResponse =
    await extractMainCurriculumWithOllama(
      curriculumText
    );

  console.log("STARTING CONCENTRATION EXTRACTION");

  const concentrationResponse =
    await extractConcentrationsWithOllama(
      curriculumText
    );


  const programInfo = JSON.parse(programInfoResponse);

  const mainData = JSON.parse(mainResponse);

  const concentrationData = JSON.parse(concentrationResponse);


  const requirements =
    Array.isArray(mainData.requirements)
      ? mergeOrContinuationRequirements(
          mainData.requirements
            .filter(
              (
                requirement: unknown
              ): requirement is RawRequirement =>
                typeof requirement === "object" && requirement !== null
            )
            .map(normalizeRequirement)
        )
      : [];


  const concentrations =
    Array.isArray(concentrationData.concentrations)
      ? concentrationData.concentrations
          .filter(
            (
              concentration: unknown
            ): concentration is RawConcentration =>
              typeof concentration === "object" && concentration !== null
          )
          .map(normalizeConcentration)
      : [];


  requirements.push(
    ...recoverPlanCoursesMissingFromRequirements(curriculumText, requirements, concentrations)
  );


  const combined = {
    programName:
      typeof programInfo.programName === "string"
        ? programInfo.programName
        : null,

    degreeName:
      typeof programInfo.degreeName === "string"
        ? programInfo.degreeName
        : null,

    catalogYear:
      typeof programInfo.catalogYear === "string"
        ? programInfo.catalogYear
        : null,

    totalDegreeCredits:
      typeof programInfo.totalDegreeCredits === "number"
        ? programInfo.totalDegreeCredits
        : null,

    requirements,

    concentrations,

    warnings: [
      ...(Array.isArray(programInfo.warnings)
        ? programInfo.warnings.filter(
            (warning: unknown): warning is string =>
              typeof warning === "string"
          )
        : []),

      ...(Array.isArray(mainData.warnings)
        ? mainData.warnings.filter(
            (warning: unknown): warning is string =>
              typeof warning === "string"
          )
        : []),

      ...(Array.isArray(
        concentrationData.warnings
      )
        ? concentrationData.warnings.filter(
            (warning: unknown): warning is string =>
              typeof warning === "string"
          )
        : []),
    ],
  };


  return JSON.stringify(combined);
}


/////////////////////////////////////////////////////


type ScheduleGenerationInput = {
  transcriptCourses: unknown[];
  remainingRequirements: unknown[];
  futureTerms: unknown[];
  courseAvailability: unknown;
};

export async function generateScheduleWithOllama(
  input: ScheduleGenerationInput
): Promise<string> {

  const messages = [
    { role: "system", content: `

You are generating a suggested university academic schedule.

You will receive STRUCTURED JSON created by the advising system.

The information supplied to you is the source of truth.

DO NOT use outside knowledge.

DO NOT invent courses.

DO NOT invent prerequisites.

DO NOT invent course offerings.

DO NOT change course codes.

DO NOT treat in-progress courses as completed courses that need to be taken again.

Your job is ONLY to organize the student's REMAINING requirements into future academic terms.

IMPORTANT RULES:

1. Never schedule a course that has already been completed.

2. Never schedule a course that is currently in-progress.

3. Only schedule courses that are represented by the supplied remainingRequirements.

4. A course may only be scheduled in a term when courseAvailability explicitly says:
   "offered": true

5. Never schedule a course in a term where offered is false.

6. Never invent availability.

7. Respect prerequisites listed inside the requirements and course options.

8. A prerequisite should normally be completed before the dependent course.

9. Respect corequisites. A corequisite may be scheduled in the same term.

10. For a "specific-course" requirement:
    schedule the specified courseCode.

11. For a "choose-from-list" requirement:
    select only from courseOptions supplied for that requirement.

12. Respect numberRequired for choose-from-list requirements.

13. For open-elective or credit requirements:
    select a specific course ONLY when the supplied requirement contains explicit eligible course information and that course appears in courseAvailability.

14. If there is not enough information to safely choose a course for an elective or broad requirement:
    DO NOT invent one.
    Put an explanation in warnings instead.

15. Prefer completing the degree in the earliest reasonable number of terms.

16. CREDIT LIMIT: a student may take at most 12 credit hours in one term.
    13 is allowed only occasionally, and only when it avoids adding an extra
    term. Never exceed 13. Add up creditHours for every course in a term
    before finalizing it.

17. Fill each term up to 12 credit hours before starting the next term,
    but only with courses that are offered in that term.

18. Only use future terms contained in futureTerms.

19. Every scheduled course must have a corresponding remaining degree requirement.

20. Use the exact course code supplied by the advising data.


COURSE AVAILABILITY IS AN ABSOLUTE RULE.

The courseAvailability object is organized by course code.

For each course, inspect its list of terms.

You MAY schedule a course ONLY in an entry where:

"offered": true

You MUST NEVER schedule a course in an entry where:

"offered": false

Example:

"CSC 493": [
  {
    "term": "Fall",
    "year": 2026,
    "offered": false
  },
  {
    "term": "Winter",
    "year": 2027,
    "offered": true
  }
]

In this example:

CSC 493 MUST NOT be scheduled in Fall 2026.

CSC 493 MAY be scheduled in Winter 2027.

Before returning your JSON, verify every scheduled course against
courseAvailability.

If no future term has offered=true for a course, DO NOT schedule it.
Put that course in warnings instead.


IMPORTANT 3-DIGIT / 4-DIGIT COURSE RULE:

The curriculum and course offering system may use different versions of course numbers.

For example:

CSC 493
and
CSC 4933

may refer to equivalent curriculum/catalog versions.

Do not create a new course merely because these formatting systems differ.

Use the course code contained in the supplied scheduling information.

RETURN ONLY VALID JSON.

Use exactly this structure:

{
  "terms": [
    {
      "term": "Fall",
      "year": 2026,
      "courses": [
        {
          "courseCode": "CSC 450",
          "courseTitle": "Course title or null",
          "creditHours": 3,
          "requirementId": "matching requirement id or null"
        }
      ]
    }
  ],

  "warnings": []
}

Do not include markdown.

Do not include explanations outside of the JSON.

If a requirement cannot safely be scheduled, leave it out of the terms array
and explain why in warnings.
`,
    },
    { role: "user",
      content: JSON.stringify(input) },
  ];

  return callAdvisingOllama(messages, { think: "medium", schema: generatedAdvisingScheduleSchema });
}
