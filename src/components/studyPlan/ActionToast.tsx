"use client";

import { useEffect } from "react";
import { AlertCircle, Check } from "lucide-react";

export type ActionToastVariant = "success" | "error";

interface ActionToastProps {
  message: string | null;
  onDone: () => void;
  /** Errors must not look like confirmations, so they get the alert icon and colour. */
  variant?: ActionToastVariant;
}

export default function ActionToast({ message, onDone, variant = "success" }: ActionToastProps) {
  const isError = variant === "error";

  useEffect(() => {
    if (!message) return;
    // A failure says what went wrong and what to do about it, so it needs longer to read.
    const timer = setTimeout(onDone, isError ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [message, onDone, isError]);

  if (!message) return null;

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg animate-in slide-in-from-bottom-2 ${
        isError ? "bg-red-600" : "bg-navy"
      }`}
    >
      {isError ? <AlertCircle size={16} aria-hidden /> : <Check size={16} aria-hidden />}
      {message}
    </div>
  );
}
