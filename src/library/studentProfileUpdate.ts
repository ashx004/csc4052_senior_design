// The AI half of the student profile (studentProfile.ts has the reads,
// which the profile page uses in the browser). Kept apart so the browser
// bundle never pulls in the AI client and its billing.
import { firestoreUpdate } from "./firestoreRest";
import { resolveOllamaBaseUrl, secondaryContextOption } from "./ollamaClient";
import { stripThinkLeak } from "./stripThinkLeak";
import { aiFetch } from "@/src/library/ai/aiFetch";
import { isCloudBackend } from "@/src/library/ai/cloudModels";
import type { StudentProfile } from "./studentProfile";

// A new account gets its first profile after a few messages, so the profile
// page has something real to show during a first session. After that, every 8.
const FIRST_UPDATE_AFTER_MESSAGES = 3;
const UPDATE_EVERY_N_MESSAGES = 8;
const PROFILE_UPDATE_TIMEOUT_MS = 60000;
const MAX_PROFILE_CHARS = 1200;

// Fire-and-forget: the caller must NOT await this on the request path — a
// student should never wait extra time for their profile to update. Every
// call increments the message counter; once it crosses the threshold, a
// small model on the secondary box distills an updated profile from the
// existing one plus a recent conversation excerpt, then resets the counter.
// Fails open at every step: a failed update just resets the counter to try
// fresh in another N messages rather than retrying immediately (a repeat
// hammering pattern already burned this app once tonight — not doing that
// again for a background feature nobody's waiting on).
export async function maybeUpdateStudentProfile(
  userId: string,
  currentProfile: StudentProfile,
  recentExchange: { role: string; content: string }[],
  idToken: string,
  courseLabels: string[] = []
): Promise<void> {
  const newCount = currentProfile.messageCount + 1;
  const threshold = currentProfile.summary ? UPDATE_EVERY_N_MESSAGES : FIRST_UPDATE_AFTER_MESSAGES;

  if (newCount < threshold) {
    await firestoreUpdate(idToken, "users", userId, { learnerProfileMessageCount: newCount });
    return;
  }

  const resetCounter = () =>
    firestoreUpdate(idToken, "users", userId, { learnerProfileMessageCount: 0 });

  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN || !process.env.OLLAMA_SUMMARY_MODEL) {
    await resetCounter();
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_UPDATE_TIMEOUT_MS);

  try {
    const exchangeText = recentExchange.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    // Cloud mode: aiFetch ignores the base URL, so probing the secondary box
    // (unreachable from production) would only add timeouts before every update.
    const baseUrl = isCloudBackend()
      ? process.env.OLLAMA_SECONDARY_URL!
      : await resolveOllamaBaseUrl(process.env.OLLAMA_SECONDARY_URL, process.env.OLLAMA_SECONDARY_FALLBACK_URL);

    const response = await aiFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
        "X-Catalyst-Feature": "student-profile",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_SUMMARY_MODEL,
        stream: false,
        // Explicit, costs nothing; stripThinkLeak below stays as the safety
        // net for any model swapped into OLLAMA_SUMMARY_MODEL that ignores it.
        think: false,
        options: { temperature: 0.2, ...secondaryContextOption() },
        messages: [
          {
            role: "system",
            content:
              "You keep a short, specific profile of a university student so a study assistant can teach them better. Write an UPDATED profile as at most 5 short bullet points, each concrete and drawn from the conversation:\n" +
              "- Courses and work they mention (course names, assignments, exams, deadlines, projects).\n" +
              "- Topics they say they struggle with, by name (for example \"AGI vs ASI\", \"the alignment problem\"). Add every new one the student states.\n" +
              "- Topics they say they understand well.\n" +
              "- Academic goals they state (a grade, passing an exam, a career path), and any exam or deadline they name.\n" +
              "- How they say they learn best, in their own words (for example \"I learn best with short examples\"). A request such as \"quiz me\" or \"explain this\" is a request, not a learning preference: leave it out.\n" +
              "Rules: keep every fact from the existing profile unless the excerpt contradicts it; add the new ones. Use only what the student said; never invent. Leave out anything not about their studies. If the excerpt adds nothing useful, return the existing profile unchanged. If there is no useful information at all, reply with exactly NONE. Reply with only the bullets (or NONE), no preamble.",
          },
          {
            role: "user",
            content: `Courses on the student's account: ${courseLabels.length ? courseLabels.join("; ") : "(none listed)"}\n\nExisting profile:\n${currentProfile.summary || "(none yet)"}\n\nRecent conversation excerpt:\n${exchangeText}`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Profile update request failed (${response.status})`);

    const data = await response.json();
    const newSummary = stripThinkLeak(data?.message?.content || "").trim().slice(0, MAX_PROFILE_CHARS);

    if (newSummary && newSummary !== "NONE") {
      await firestoreUpdate(idToken, "users", userId, {
        learnerProfileSummary: newSummary,
        learnerProfileMessageCount: 0,
        learnerProfileUpdatedAt: new Date(),
      });
    } else {
      await resetCounter();
    }
  } catch (error) {
    console.error("Student profile update failed, will retry after another interval:", error);
    await resetCounter();
  } finally {
    clearTimeout(timeout);
  }
}
