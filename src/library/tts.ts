// Text-to-speech for assistant chat messages, via the browser's built-in
// Web Speech API (SpeechSynthesis) — free, no backend, no added latency.
// Deliberately not a cloud TTS provider: this app already self-hosts its
// only paid-adjacent AI infra (Ollama), and browser voices are good enough
// for "read this message aloud," which is the actual ask. See the voice
// picker note in VOICE_STORAGE_KEY's usage in Settings for why this never
// promises specific labeled genders — the underlying API can't back that up.

const VOICE_STORAGE_KEY = "catalyst:ttsVoiceURI";

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getStoredVoiceURI(): string | null {
  try {
    return localStorage.getItem(VOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredVoiceURI(voiceURI: string): void {
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, voiceURI);
  } catch {
    // Best-effort — worst case the voice choice doesn't persist.
  }
}

// speechSynthesis.getVoices() returns an empty array until the browser has
// actually loaded its voice list, which happens asynchronously (Chrome
// fires 'voiceschanged' once ready; Safari sometimes has them immediately).
// Callers should call this once and again on 'voiceschanged' rather than
// trusting a single synchronous call.
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis.getVoices();
}

function resolvePreferredVoice(): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices();
  if (voices.length === 0) return null;
  const storedURI = getStoredVoiceURI();
  return voices.find((v) => v.voiceURI === storedURI) ?? voices.find((v) => v.default) ?? voices[0];
}

// Strips markdown/LaTeX syntax down to plain readable text before speaking —
// without this, the assistant would literally say "asterisk asterisk" for
// bold text and read raw URLs character by character. Not exhaustive, just
// enough that a typical response (headings, lists, links, code, bold/italic,
// inline math) reads naturally instead of reading its own formatting.
export function stripMarkdownForSpeech(markdown: string): string {
  let text = markdown;
  text = text.replace(/```[\s\S]*?```/g, ""); // fenced code blocks — noise when spoken
  text = text.replace(/`([^`]+)`/g, "$1"); // inline code — keep content
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ""); // images
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links — keep visible text
  text = text.replace(/^#{1,6}\s+/gm, ""); // headings
  text = text.replace(/^>\s?/gm, ""); // blockquotes
  text = text.replace(/^[-*+]\s+/gm, ""); // bullet lists
  text = text.replace(/^\d+\.\s+/gm, ""); // numbered lists
  text = text.replace(/\*\*\*|\*\*|\*|___|__|_/g, ""); // bold/italic markers
  text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, ""); // horizontal rules
  text = text.replace(/\$\$?([^$]+)\$\$?/g, "$1"); // LaTeX delimiters — keep content
  text = text.replace(/\|/g, " "); // table pipes
  return text.replace(/\n{2,}/g, ". ").replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Cancels any in-progress utterance and speaks fresh — a chat only ever
 *  has one thing playing at a time, so switching messages should interrupt,
 *  not queue behind whatever was already reading. */
export function speak(markdown: string, onEnd: () => void): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(markdown));
  const voice = resolvePreferredVoice();
  if (voice) utterance.voice = voice;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}
