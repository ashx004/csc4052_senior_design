// The student's chat speed: trade answer quality for speed and credit.
// Stored per browser; sent with each chat request (chatRequest.ts `speed`)
// and applied server-side by cloudModels.ts's speedOverride.

export type ChatSpeed = "fast" | "balanced" | "thorough";

export const CHAT_SPEEDS: { id: ChatSpeed; label: string; description: string; typicalUsd: number }[] = [
  { id: "fast", label: "Fast", description: "Quickest and cheapest. Good for quick questions; weaker at multi-step tasks like scheduling.", typicalUsd: 0.001 },
  { id: "balanced", label: "Balanced", description: "Thinks when a question needs it. Best for most studying.", typicalUsd: 0.002 },
  { id: "thorough", label: "Thorough", description: "Always thinks it through. Slower and costs more; for hard problems and proofs.", typicalUsd: 0.006 },
];

const KEY = "chat-speed";
export const CHAT_SPEED_EVENT = "catalyst:chat-speed";

export function getChatSpeed(): ChatSpeed {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return stored === "fast" || stored === "thorough" ? stored : "balanced";
  } catch {
    return "balanced";
  }
}

export function setChatSpeed(speed: ChatSpeed): void {
  try {
    localStorage.setItem(KEY, speed);
  } catch {
    // Private mode: the choice lasts until the page reloads.
  }
  window.dispatchEvent(new CustomEvent<ChatSpeed>(CHAT_SPEED_EVENT, { detail: speed }));
}

export function parseChatSpeed(word: string): ChatSpeed | null {
  const w = word.trim().toLowerCase();
  if (w === "fast" || w === "quick") return "fast";
  if (w === "balanced" || w === "normal" || w === "default") return "balanced";
  if (w === "thorough" || w === "smart" || w === "deep") return "thorough";
  return null;
}
