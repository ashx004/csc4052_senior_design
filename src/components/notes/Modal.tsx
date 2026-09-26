"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({
  title,
  onClose,
  children,
  busy = false,
  width = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full ${width} overflow-y-auto rounded-2xl bg-bg-container p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text-main">{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-1.5 text-text-muted hover:bg-bg-warm disabled:opacity-40">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
