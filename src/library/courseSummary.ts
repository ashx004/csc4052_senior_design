import { NextRequest } from "next/server";
import { getIdToken, firestoreGet, firestoreListCollection, firestoreUpdate } from "./firestoreRest";
import { resolveInternalUrl } from "./pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "./documentExtract";
import { resolveOllamaBaseUrl } from "./ollamaClient";
import { stripThinkLeak } from "./stripThinkLeak";

// Bounds on how much document text feeds one summary call — this only needs
// enough material to characterize what the course covers, not the full
// corpus (unlike search/read, which need real document detail). Kept well
// under the model's context window regardless of how many documents a
// student has uploaded.
const MAX_DOCS_FOR_SUMMARY = 8;
const MAX_CHARS_PER_DOC = 3000;
const OLLAMA_TIMEOUT_MS = 60000;

async function callOllamaForSummary(prompt: string): Promise<string> {
  const baseUrl = await resolveOllamaBaseUrl(
    process.env.OLLAMA_PRIMARY_URL!,
    process.env.OLLAMA_PRIMARY_FALLBACK_URL
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        // Fast model — this is a background housekeeping task, not
        // something a student is waiting on, so there's no reason to pay
        // quality mode's latency/leak-buffering cost for it.
        model: process.env.OLLAMA_MODEL_FAST || process.env.OLLAMA_MODEL || "gpt-oss:20b",
        messages: [
          {
            role: "system",
            content:
              "You summarize a college course's uploaded materials for the student who's taking it. Write 2-4 plain sentences describing what the course actually covers, based only on the material given. No headings, no markdown, no preamble like \"This course covers\" repeated — just the summary itself.",
          },
          { role: "user", content: prompt },
        ],
        stream: false,
        think: false,
        options: { temperature: 0.3 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status})`);
    }

    const data = await response.json();
    return stripThinkLeak(data?.message?.content ?? "").trim();
  } finally {
    clearTimeout(timeout);
  }
}

// Regenerates and persists a short AI summary of a course based on its
// currently-uploaded documents. Fire-and-forget by design (see call site in
// api/embed-document/route.ts) — a failure here must never surface as an
// upload error to the student, so every error path just logs and returns.
export async function generateCourseSummary(
  request: NextRequest,
  userId: string,
  courseId: string
): Promise<void> {
  try {
    const idToken = getIdToken(request);
    if (!idToken) return;

    const enrollment = await firestoreGet(idToken, `users/${userId}/enrollment`, courseId);
    if (!enrollment) return;

    const resourceDocs = await firestoreListCollection(
      idToken,
      `users/${userId}/enrollment/${courseId}/resources`
    );
    const supportedDocs = resourceDocs
      .map((d) => d.data)
      .filter((d) => typeof d.fileType === "string" && SUPPORTED_DOCUMENT_TYPES.includes(d.fileType))
      .slice(0, MAX_DOCS_FOR_SUMMARY);

    if (supportedDocs.length === 0) {
      // No summarizable material (yet) — clear out any stale summary from
      // before the student removed their last document, rather than
      // leaving it describing content that's no longer there.
      await firestoreUpdate(idToken, `users/${userId}/enrollment`, courseId, {
        courseSummary: "",
        courseSummaryUpdatedAt: new Date(),
      });
      return;
    }

    const docExcerpts: string[] = [];
    for (const resource of supportedDocs) {
      const name = typeof resource.name === "string" ? resource.name : "";
      const url = typeof resource.url === "string" ? resource.url : "";
      const fileType = resource.fileType as string;
      try {
        const fullUrl = resolveInternalUrl(request, url);
        let text = await extractDocumentText(fullUrl, fileType);
        if (!text) continue;
        if (text.length > MAX_CHARS_PER_DOC) text = text.slice(0, MAX_CHARS_PER_DOC);
        docExcerpts.push(`--- "${name}" ---\n${text}`);
      } catch (error) {
        console.error(`Course summary: failed to extract "${name}":`, error);
      }
    }

    if (docExcerpts.length === 0) return;

    const prompt = `Course: ${enrollment.classCode || ""} — ${enrollment.className || ""}\n\n${docExcerpts.join("\n\n")}`;
    const summary = await callOllamaForSummary(prompt);
    if (!summary) return;

    await firestoreUpdate(idToken, `users/${userId}/enrollment`, courseId, {
      courseSummary: summary,
      courseSummaryUpdatedAt: new Date(),
    });
  } catch (error) {
    console.error(`Course summary generation failed for course ${courseId}:`, error);
  }
}
