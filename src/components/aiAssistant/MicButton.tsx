"use client";

import { Mic } from "lucide-react";
import type { SpeechToText } from "@/src/library/useSpeechToText";

/** Mic toggle for the AI chat inputs. Pulses red while listening; disabled
 *  with an explanation where the browser has no speech recognition.
 *  `className` (size, always applied) and `idleClassName` (colors when not
 *  listening) let it match each input bar. */
export default function MicButton({
  stt,
  className = "h-9 w-9",
  idleClassName = "text-primary hover:bg-bg-warm",
  iconSize = 18,
  disabled = false,
}: {
  stt: SpeechToText;
  className?: string;
  idleClassName?: string;
  iconSize?: number;
  disabled?: boolean;
}) {
  const unsupported = !stt.supported;
  return (
    <button
      type="button"
      onClick={stt.toggle}
      disabled={unsupported || disabled}
      title={
        unsupported
          ? "Voice input isn't supported in this browser"
          : stt.listening
            ? "Stop listening"
            : "Voice input"
      }
      aria-label={stt.listening ? "Stop voice input" : "Start voice input"}
      aria-pressed={stt.listening}
      className={`flex shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${className} ${
        stt.listening ? "animate-pulse bg-alert-error text-text-inverse" : idleClassName
      }`}
    >
      <Mic size={iconSize} strokeWidth={2} />
    </button>
  );
}
