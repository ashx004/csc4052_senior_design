"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";

interface ActionToastProps {
  message: string | null;
  onDone: () => void;
}

export default function ActionToast({ message, onDone }: ActionToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white shadow-lg animate-in slide-in-from-bottom-2"
    >
      <Check size={16} aria-hidden />
      {message}
    </div>
  );
}
