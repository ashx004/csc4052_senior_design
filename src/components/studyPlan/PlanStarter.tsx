"use client";

import { Sparkles } from "lucide-react";
import { planStarterHref, type PlanStarterChoice } from "@/src/library/studyPlan/planStarter";

interface PlanStarterProps {
  choice: PlanStarterChoice;
  onGo: (href: string) => void;
}

const COPY: Record<PlanStarterChoice["kind"], { title: string; body: string; button: string }> = {
  enroll: {
    title: "Add your first class",
    body: "Join a class so Catalyst can build a study plan for you.",
    button: "Find a class",
  },
  upload: {
    title: "Upload a document to begin",
    body: "Add your notes or slides, and Catalyst will plan your study time from them.",
    button: "Upload a document",
  },
  quiz: {
    title: "Start with a quiz on your newest document",
    body: "A short quiz shows what you already know, so tomorrow's plan can focus on your weak spots.",
    button: "Start quiz",
  },
};

export default function PlanStarter({ choice, onGo }: PlanStarterProps) {
  const copy = COPY[choice.kind];
  return (
    <div className="rounded-2xl border border-dashed border-border-light bg-bg-container p-8 text-center">
      <Sparkles size={32} className="mx-auto mb-3 text-primary" />
      <h3 className="text-lg font-semibold text-text-main">{copy.title}</h3>
      <p className="mt-1 text-sm text-text-muted">
        {choice.kind === "quiz" ? `${copy.body} (${choice.documentName})` : copy.body}
      </p>
      <button
        type="button"
        onClick={() => onGo(planStarterHref(choice))}
        className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        {copy.button}
      </button>
    </div>
  );
}
