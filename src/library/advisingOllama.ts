import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";

// tapout at 5 mins
const OLLAMA_TIMEOUT_MS = 300000;

async function callAdvisingOllama(
  messages: { role: string; content: string }[]
): Promise<string> {
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

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },

      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "gpt-oss:20b",

        messages,
        stream: false,
        think: false,
        format: "json",

        options: { temperature: 0, num_predict: 8000, },
      }),

      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Ollama request failed (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    console.log("OLLAMA MODEL:", data?.model);
    console.log("OLLAMA DONE REASON:", data?.done_reason);
    console.log("OLLAMA OUTPUT TOKENS:", data?.eval_count);
    console.log(
    "OLLAMA THINKING LENGTH:",
    data?.message?.thinking?.length ?? 0
    );
    console.log(
    "OLLAMA CONTENT LENGTH:",
    data?.message?.content?.length ?? 0
    );

    const content = data?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
    throw new Error("Ollama returned an empty response.");
    }

    return content.trim();

  } finally {
    clearTimeout(timeout);
  }
}













export async function extractTranscriptWithOllama(
  transcriptText: string
): Promise<string> {
  const messages = [
    {
      role: "system",
      content: ` /no_think
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


      `,
    },

    {
      role: "user",
      content: transcriptText,
    },
  ];

  return callAdvisingOllama(messages);
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
        ? concentration.requirements
            .filter(
              (
                requirement
              ): requirement is RawRequirement =>
                typeof requirement === "object" &&
                requirement !== null
            )
            .map(normalizeRequirement)
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

async function extractConcentrationsWithOllama(
  curriculumText: string
): Promise<string> {

  return callAdvisingOllama([
    {
      role: "system",
      content: ` /no_think

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

    {
      role: "user",
      content: curriculumText,
    },
  ]);
}



/*
  Extract only general program information.
*/

async function extractProgramInfoWithOllama(
  curriculumText: string
): Promise<string> {

  return callAdvisingOllama([
    {
      role: "system",
      content: ` /no_think

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

        {
          role: "user",
          content: curriculumText,
        },
      ]);
    }



    /*
      Extract only the main degree requirements.
    */
    async function extractMainCurriculumWithOllama(
      curriculumText: string
    ): Promise<string> {

      return callAdvisingOllama([
        {
          role: "system",
          content: ` /no_think

    Return ONLY valid JSON.

    Extract ALL general degree requirements from the ENTIRE curriculum text.
    Do NOT extract concentration-specific requirements.

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

    Return ONLY valid JSON.
          

      `,
    },

    {
      role: "user",
      content: curriculumText,
    },
  ]);
}


/*
  Run the three smaller curriculum extractions,
  normalize them, then combine them.
*/

export async function extractCurriculumWithOllama(
  curriculumText: string
): Promise<string> {

  console.log(
    "STARTING PROGRAM INFO EXTRACTION"
  );

  const programInfoResponse =
    await extractProgramInfoWithOllama(
      curriculumText
    );

  console.log(
    "PROGRAM INFO EXTRACTION FINISHED"
  );


  console.log(
    "STARTING MAIN REQUIREMENTS EXTRACTION"
  );

  const mainResponse =
    await extractMainCurriculumWithOllama(
      curriculumText
    );

  console.log(
    "MAIN REQUIREMENTS EXTRACTION FINISHED"
  );


  console.log(
    "STARTING CONCENTRATION EXTRACTION"
  );

  const concentrationResponse =
    await extractConcentrationsWithOllama(
      curriculumText
    );

  console.log(
    "CONCENTRATION EXTRACTION FINISHED"
  );


  const programInfo =
    JSON.parse(programInfoResponse);

  const mainData =
    JSON.parse(mainResponse);

  const concentrationData =
    JSON.parse(concentrationResponse);


  const requirements =
    Array.isArray(mainData.requirements)
      ? mainData.requirements
          .filter(
            (
              requirement: unknown
            ): requirement is RawRequirement =>
              typeof requirement === "object" &&
              requirement !== null
          )
          .map(normalizeRequirement)
      : [];


  const concentrations =
    Array.isArray(
      concentrationData.concentrations
    )
      ? concentrationData.concentrations
          .filter(
            (
              concentration: unknown
            ): concentration is RawConcentration =>
              typeof concentration === "object" &&
              concentration !== null
          )
          .map(normalizeConcentration)
      : [];


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
    {
      role: "system",

      content: ` /no_think

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

16. Balance courses reasonably between academic terms.

17. Do not place every remaining course into one term merely because they are all offered.

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

    {
      role: "user",

      content: JSON.stringify(
        input,
        null,
        2
      ),
    },
  ];

  return callAdvisingOllama(messages);
}