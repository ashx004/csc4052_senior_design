"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
  question: string;
  /** Plain paragraphs - kept as a string[] rather than one block of text so
   *  a multi-step answer (e.g. "if X, try Y; if that doesn't work, Z") reads
   *  as separate lines instead of one dense wall of text. */
  answer: string[];
}

/** One category's worth of Q&A as a single-open accordion - keeps a long
 *  FAQ scannable instead of dumping every answer on screen at once, and
 *  matches the disclosure pattern most help centers use (Notion, GitHub
 *  Docs, Intercom's own help widget) rather than a flat list of headings. */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-border-light rounded-xl border border-border-light bg-bg-container">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition hover:bg-bg-warm"
            >
              <span className="text-sm font-medium text-text-main">{item.question}</span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className="grid overflow-hidden transition-all duration-200 ease-in-out"
              style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
            >
              <div className="min-h-0">
                <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-text-muted">
                  {item.answer.map((paragraph, j) => (
                    <p key={j}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
