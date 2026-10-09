import type { NextRequest } from "next/server";
import { resolveOllamaBaseUrl, resolveModelFromKey, mainModelContextOption } from "./ollamaClient";
import { thinkField } from "./thinkMode";
import { stripThinkLeak } from "./stripThinkLeak";
import { SYLLABUS_SYSTEM_PROMPT, parseSyllabusResponse, type SyllabusInfo } from "./syllabusInfo";
import { getDocumentText } from "./documentTextCache";

// A syllabus is a few pages; this keeps a pathological upload (a whole
// textbook mis-selected) from blowing the model's context.
const MAX_SYLLABUS_CHARS = 24_000;
const OLLAMA_TIMEOUT_MS = 120_000;

export async function extractSyllabusInfo(
  request: NextRequest,
  file: { url: string; fileType: string },
  course: { classCode?: string; className?: string; term?: string }
): Promise<SyllabusInfo> {
  const text = (await getDocumentText(request, file.url, file.fileType)).trim();
  if (!text) throw new Error("No readable text was found in that file.");

  const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL!, process.env.OLLAMA_PRIMARY_FALLBACK_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
        "X-Catalyst-Feature": "syllabus",
      },
      body: JSON.stringify({
        model: resolveModelFromKey(),
        messages: [
          { role: "system", content: SYLLABUS_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Course: ${course.classCode ?? ""} ${course.className ?? ""} (${course.term ?? ""})\n\nSYLLABUS:\n${text.slice(0, MAX_SYLLABUS_CHARS)}`,
          },
        ],
        stream: false,
        format: "json",
        ...thinkField("course-summary"),
        options: { temperature: 0.1, ...mainModelContextOption() },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The AI service is unavailable right now (${response.status}).`);
    const data = await response.json();
    return parseSyllabusResponse(stripThinkLeak(data?.message?.content ?? ""));
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Reading the syllabus took too long. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
