import { doc, getDoc, updateDoc, serverTimestamp, deleteField, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

// The "Core memory" tier of a small, tiered memory system — a short,
// always-loaded profile of durable facts about a student (academic/career
// goals, what teaching styles work for them), refreshed periodically rather
// than on every message. Deliberately small-form: a single evolving text
// summary, not a knowledge graph or vector store — this is the "Learner
// Model" component of a classic adaptive-tutoring-system architecture.
// recall_past_chat (searchable full history) is the "Recall" tier; raw
// Firestore chat storage is "Archival". This is the missing Core tier.
const UPDATE_EVERY_N_MESSAGES = 8;
const PROFILE_UPDATE_TIMEOUT_MS = 60000;

export interface StudentProfile {
  summary: string;
  messageCount: number;
  updatedAt?: Date;
}

export async function getStudentProfile(userId: string): Promise<StudentProfile> {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return { summary: "", messageCount: 0 };
    const data = snap.data();
    const updatedAt = data.learnerProfileUpdatedAt instanceof Timestamp ? data.learnerProfileUpdatedAt.toDate() : undefined;
    return {
      summary: typeof data.learnerProfileSummary === "string" ? data.learnerProfileSummary : "",
      messageCount: typeof data.learnerProfileMessageCount === "number" ? data.learnerProfileMessageCount : 0,
      updatedAt,
    };
  } catch (error) {
    console.error("Error loading student profile:", error);
    return { summary: "", messageCount: 0 };
  }
}

// Full removal, not just clearing the text — a student should be able to
// make the assistant "forget" them completely, matching the transparency
// pattern ChatGPT's memory settings use (view + delete your own profile).
export async function clearStudentProfile(userId: string): Promise<void> {
  await updateDoc(doc(db, "users", userId), {
    learnerProfileSummary: deleteField(),
    learnerProfileMessageCount: deleteField(),
    learnerProfileUpdatedAt: deleteField(),
  });
}

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
  recentExchange: { role: string; content: string }[]
): Promise<void> {
  const newCount = currentProfile.messageCount + 1;

  if (newCount < UPDATE_EVERY_N_MESSAGES) {
    await updateDoc(doc(db, "users", userId), { learnerProfileMessageCount: newCount }).catch((error) =>
      console.error("Error incrementing student profile counter:", error)
    );
    return;
  }

  const resetCounter = () =>
    updateDoc(doc(db, "users", userId), { learnerProfileMessageCount: 0 }).catch((error) =>
      console.error("Error resetting student profile counter:", error)
    );

  if (!process.env.OLLAMA_SECONDARY_URL || !process.env.OLLAMA_AUTH_TOKEN) {
    await resetCounter();
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_UPDATE_TIMEOUT_MS);

  try {
    const exchangeText = recentExchange.map((m) => `${m.role}: ${m.content}`).join("\n\n");

    const response = await fetch(`${process.env.OLLAMA_SECONDARY_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_SUMMARY_MODEL || "qwen3:4b",
        stream: false,
        options: { temperature: 0.2 },
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
    const newSummary = (data?.message?.content || "").trim();

    if (newSummary) {
      await updateDoc(doc(db, "users", userId), {
        learnerProfileSummary: newSummary,
        learnerProfileMessageCount: 0,
        learnerProfileUpdatedAt: serverTimestamp(),
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
