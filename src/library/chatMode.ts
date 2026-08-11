// Two user-facing AI chat speed/quality modes, mapped to different Ollama
// models via env vars (OLLAMA_MODEL_FAST / OLLAMA_MODEL_QUALITY - see
// src/app/api/chat/route.ts). "fast" keeps a smaller model always resident
// on the primary GPU box alongside the vision model - zero cold-boot swaps,
// ever, even for OCR. "quality" uses a larger model for noticeably better
// and (on this hardware) actually faster chat responses, at the cost of a
// cold-boot swap whenever OCR/vision is needed afterward, since the two
// don't fit in VRAM together. Stored client-side only (same pattern as
// theme/coffee in theme.ts) and sent explicitly with every chat request -
// the server has no independent copy of this preference, it just trusts
// whatever the client sends per-request.
export type ChatMode = "fast" | "quality";

const MODE_KEY = "chat-mode";

export function getStoredChatMode(): ChatMode {
  if (typeof localStorage === "undefined") return "fast";
  const stored = localStorage.getItem(MODE_KEY);
  return stored === "quality" ? "quality" : "fast";
}

export function setStoredChatMode(mode: ChatMode): void {
  localStorage.setItem(MODE_KEY, mode);
}
