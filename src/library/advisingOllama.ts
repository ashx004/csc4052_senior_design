import { resolveOllamaBaseUrl } from "@/src/library/ollamaClient";

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

Rules:

- Include every course attempt.
- Do not combine repeated attempts.
- Ignore academic standing.
- Do not include Good Standing or similar standing information.
- Preserve course codes exactly as they appear.
- Preserve course titles.
- If information is missing, use null.
- IP means in-progress.
- Do not invent anything.

Return this exact structure:

{
  "studentName": string | null,
  "major": string | null,
  "concentration": string | null,
  "courses": [
    {
      "courseCode": string,
      "courseTitle": string,
      "term": string,
      "creditHours": number | null,
      "grade": string | null,
      "status": string
    }
  ]
}
      `,
    },

    {
      role: "user",
      content: transcriptText,
    },
  ];

  return callAdvisingOllama(messages);
}



export async function extractCurriculumWithOllama(
  curriculumText: string
): Promise<string> {
  const messages = [
    {
      role: "system",
      content: ` /no_think
You are extracting structured degree curriculum information.

Return ONLY valid JSON.

Extract:

- programName
- catalogYear
- totalDegreeCredits
- requiredCourses
- choiceRequirements
- openElectives
- concentrations

For required courses, include:

- courseCode
- courseTitle
- creditHours
- prerequisites

For choice requirements, include:

- requirementName
- numberRequired
- creditsRequired
- courseOptions

For every course option, include:

- courseCode
- courseTitle
- creditHours
- prerequisites

If the curriculum says something like:

"Two of the following"

store all of the listed options and set numberRequired to 2.

If the curriculum gives a category but does not list exact courses,
such as "CSC Directed Elective", do NOT invent classes.

Instead store:

{
  "requirementName": "CSC Directed Elective",
  "courseOptions": [],
  "optionsExplicitlyListed": false
}

Also extract every concentration.

For each concentration, include:

- concentrationName
- totalCredits
- requiredCourses
- choiceRequirements

Preserve prerequisites exactly as shown.

Do not invent any course or prerequisite that is not in the document.

Return this structure:

{
  "programName": string | null,
  "catalogYear": string | null,
  "totalDegreeCredits": number | null,

  "requiredCourses": [],

  "choiceRequirements": [],

  "openElectives": [],

  "concentrations": []
}
      `,
    },

    {
      role: "user",
      content: curriculumText,
    },
  ];

  return callAdvisingOllama(messages);
}
