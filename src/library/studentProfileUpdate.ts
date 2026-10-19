// The AI half of the student profile (studentProfile.ts has the reads,
// which the profile page uses in the browser). Kept apart so the browser
// bundle never pulls in the AI client and its billing.
import { firestoreUpdate } from "./firestoreRest";
import { resolveOllamaBaseUrl, secondaryContextOption } from "./ollamaClient";
import { stripThinkLeak } from "./stripThinkLeak";
import { aiFetch } from "@/src/library/ai/aiFetch";
import type { StudentProfile } from "./studentProfile";

const UPDATE_EVERY_N_MESSAGES = 8;
const PROFILE_UPDATE_TIMEOUT_MS = 60000;

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
  idToken: string
): Promise<void> {
  const newCount = currentProfile.messageCount + 1;

  if (newCount < UPDATE_EVERY_N_MESSAGES) {
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
    const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_SECONDARY_URL, process.env.OLLAMA_SECONDARY_FALLBACK_URL);

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
              "You maintain a brief, evolving profile of a student to help a study assistant personalize its teaching. Given the student's existing profile (if any) and a recent excerpt of their conversation, produce an UPDATED profile: 2-4 sentences covering their apparent academic/career goals and what teaching style seems to work well for them (e.g. prefers examples, visual explanations, step-by-step breakdowns, concise answers, hands-on practice). Preserve existing facts unless the new excerpt actually contradicts them — don't drop something true just because this excerpt didn't repeat it. Only include things reasonably inferable from the conversation, never invent details. Stay strictly academic/learning-focused — never record personal life details unrelated to their studies. If nothing new or relevant was learned this time, return the existing profile unchanged. Reply with ONLY the updated profile text, nothing else — no preamble, no labels.",
          },
          {
            role: "user",
            content: `Existing profile:\n${currentProfile.summary || "(none yet)"}\n\nRecent conversation excerpt:\n${exchangeText}`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Profile update request failed (${response.status})`);

    const data = await response.json();
    const newSummary = stripThinkLeak(data?.message?.content || "").trim();

    if (newSummary) {
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
