"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Speech-to-text for the AI chat inputs, via the browser's built-in Web
// Speech API (SpeechRecognition) - the listening half of tts.ts's
// read-aloud, with the same trade-off: free and no backend. Chrome, Edge and
// Safari only (Firefox has no implementation, so callers show the mic
// disabled there), and Chrome transcribes on Google's servers, so audio
// leaves the device in that browser.

// Minimal typing for the parts used here - the DOM lib doesn't ship
// SpeechRecognition types, and Chrome/Safari expose it webkit-prefixed.
type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }>>;
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionConstructor = new () => Recognition;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// What the input should show mid-dictation: whatever was typed before the
// mic started, then everything spoken since (final and still-changing
// words alike, so text appears as you talk).
export function composeDictation(base: string, spoken: string, maxLength?: number): string {
  const before = base.trim();
  const said = spoken.replace(/\s+/g, " ").trim();
  const text = before && said ? `${before} ${said}` : before || said;
  return maxLength ? text.slice(0, maxLength) : text;
}

// null = nothing worth telling the student ("aborted" is our own stop()).
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser's site settings, then try again.";
    case "audio-capture":
      return "No microphone was found.";
    case "no-speech":
      return "Didn't catch anything. Tap the mic and try again.";
    case "network":
      return "Voice input needs an internet connection.";
    case "aborted":
      return null;
    default:
      return "Voice input stopped unexpectedly. Try again.";
  }
}

/** Dictation into a controlled text input: pass its current value and
 *  setter. While listening, the input shows `text-at-start + speech`. */
export function useSpeechToText({
  text,
  onText,
  maxLength,
}: {
  text: string;
  onText: (next: string) => void;
  maxLength?: number;
}) {
  // false until mounted, so server and first client render agree.
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  // Cleared the moment stop() is called: results that are still in flight
  // are ignored, so sending (which clears the input) can't be followed by
  // the last few words reappearing in the empty box.
  const activeRef = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(getRecognitionConstructor() !== null);
    return () => {
      activeRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition || activeRef.current) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    const base = textRef.current;

    recognition.onresult = (event) => {
      if (!activeRef.current) return;
      let spoken = "";
      for (let i = 0; i < event.results.length; i++) spoken += ` ${event.results[i][0].transcript}`;
      onTextRef.current(composeDictation(base, spoken, maxLength));
    };
    recognition.onerror = (event) => {
      const message = speechErrorMessage(event.error);
      if (message) setError(message);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      activeRef.current = false;
      setListening(false);
    };

    recognitionRef.current = recognition;
    activeRef.current = true;
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      activeRef.current = false;
      setError("Couldn't start voice input. Try again.");
    }
  }, [maxLength]);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, error, start, stop, toggle };
}

export type SpeechToText = ReturnType<typeof useSpeechToText>;
