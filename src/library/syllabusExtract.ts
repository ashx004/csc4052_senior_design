import type { NextRequest } from "next/server";
import { resolveOllamaBaseUrl, resolveModelFromKey, mainModelContextOption } from "./ollamaClient";
import { stripThinkLeak } from "./stripThinkLeak";
import { SYLLABUS_SYSTEM_PROMPT, parseSyllabusResponse, type SyllabusInfo } from "./syllabusInfo";
import { getDocumentText } from "./documentTextCache";
import { aiFetch } from "@/src/library/ai/aiFetch";

// A syllabus is a few pages; this keeps a pathological upload (a whole
// textbook mis-selected) from blowing the model's context.
const MAX_SYLLABUS_CHARS = 24_000;

/**
 * Fits a long syllabus in the limit by keeping both ends. The front holds the
 * instructor, office hours and grading; the schedule with the exam dates is
 * usually at the back, so cutting only the tail off would lose the dates.
 */
export function fitSyllabusText(text: string, max = MAX_SYLLABUS_CHARS): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n[... middle of the syllabus omitted ...]\n\n${text.slice(-tail)}`;
}
const OLLAMA_TIMEOUT_MS = 120_000;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Whether the syllabus text prints this ISO date's month and day ("Oct. 23",
 * "October 23rd", "10/23"). Dates the model wrote without a printed source
 * are not real, so they are not shown. Non-ISO dates ("Week 5") are kept as written.
 */
export function dateAppearsInSource(isoDate: string, text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return true;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const dayPattern = `0?${day}(?!\\d)`;
  const monthName = MONTHS[month - 1];
  // "Oct 23", "October 23rd", and day first: "23 Oct", "Fri, 23 Oct", "23rd of October".
  const named = new RegExp(`\\b${monthName}[a-z]*\\.?\\s+${dayPattern}`, "i");
  const dayFirst = new RegExp(`(?<!\\d)0?${day}(st|nd|rd|th)?\\s+(of\\s+)?${monthName}[a-z]*\\b`, "i");
  const numeric = new RegExp(`(?<!\\d)0?${month}\\/0?${day}(?!\\d)`);
  return named.test(text) || dayFirst.test(text) || numeric.test(text);
}

const DATED_TEXT = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

/**
 * Reads the syllabus. The model sometimes returns no dates for a document that
 * plainly has them (one run in five on a 7-date schedule). Ask once more in
 * that case, rather than showing an empty schedule as if it were complete.
 */
export async function extractSyllabusInfo(
  request: NextRequest,
  file: { url: string; fileType: string },
  course: { classCode?: string; className?: string; term?: string }
): Promise<SyllabusInfo> {
  const first = await extractSyllabusInfoOnce(request, file, course);
  if (first.dates.length > 0) return first;
  const text = await getDocumentText(request, file.url, file.fileType);
  if (!DATED_TEXT.test(text)) return first;
  console.warn("[syllabus] no dates came back for a document that prints dates; asking again");
  return extractSyllabusInfoOnce(request, file, course);
}

async function extractSyllabusInfoOnce(
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
    const response = await aiFetch(`${baseUrl}/api/chat`, {
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
            content: `Course: ${course.classCode ?? ""} ${course.className ?? ""} (${course.term ?? ""})\nToday's date: ${new Date().toISOString().slice(0, 10)}\n\nSYLLABUS:\n${fitSyllabusText(text)}`,
          },
        ],
        stream: false,
        format: "json",
        // Pulling fields out of a document needs no reasoning. Left on, the
        // course-summary setting made the model reason through the whole
        // syllabus first: most of a 2,600-token reply and ~45 s per import.
        think: false,
        options: { temperature: 0.1, ...mainModelContextOption() },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The AI service is unavailable right now (${response.status}).`);
    const data = await response.json();
    const parsed = parseSyllabusResponse(stripThinkLeak(data?.message?.content ?? ""));
    // A date the syllabus never prints (the model guessed one) is dropped rather than shown.
    const confirmed = parsed.dates.filter((entry) => dateAppearsInSource(entry.date, text));
    // Counted, so the student is told a date was left out instead of it vanishing silently.
    const info: SyllabusInfo = { ...parsed, dates: confirmed, unconfirmedDates: parsed.dates.length - confirmed.length };
    if (info.unconfirmedDates) {
      console.warn(`[syllabus] dropped ${info.unconfirmedDates} date(s) not found in the document`);
    }
    // parseSyllabusResponse returns blanks when the reply isn't usable JSON. Say
    // so, rather than showing an empty form that looks like a successful read.
    const found = Object.entries(info).some(([key, value]) => (key === "dates" ? (value as unknown[]).length > 0 : Boolean(value)));
    if (!found) {
      console.warn(`[syllabus] reply had no usable fields (${String(data?.message?.content ?? "").length} chars)`);
      throw new Error("Couldn't pick out any course details from that file. Try another file, or add them by hand.");
    }
    return info;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Reading the syllabus took too long. Please try again.", { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
