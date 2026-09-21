"use client";

import { useState } from "react";
import { X, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import TimeStep from "./TimeStep";
import GoalStep from "./GoalStep";
import CourseStep from "./CourseStep";
import PreferenceStep from "./PreferenceStep";
import type {
  SetupConfig,
  AvailableTime,
  StudyGoal,
  ActivityPreference,
} from "@/src/library/studyPlan/types";

interface SetupModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (config: SetupConfig) => Promise<void>;
  title?: string;
  submitLabel?: string;
}

export default function SetupModal({
  open,
  onClose,
  onSubmit,
  title = "Create your study plan",
  submitLabel = "Generate plan",
}: SetupModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [time, setTime] = useState<AvailableTime | undefined>();
  const [goal, setGoal] = useState<StudyGoal | undefined>();
  const [courseId, setCourseId] = useState<string | null | undefined>(undefined);
  const [preference, setPreference] = useState<ActivityPreference | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canProceed =
    (step === 1 && time !== undefined) ||
    (step === 2 && goal !== undefined) ||
    (step === 3 && courseId !== undefined) ||
    (step === 4 && preference !== undefined);

  const handleNext = async () => {
    if (step < 4) {
      setStep((step + 1) as 1 | 2 | 3 | 4);
      return;
    }

    if (!time || !goal || courseId === undefined || !preference) return;

    setIsGenerating(true);
    setError(null);
    try {
      await onSubmit({
        availableMinutes: time,
        goal,
        courseId,
        activityPreference: preference,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Your data is safe."
      );
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3 | 4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/35 p-4">
      <div className="relative w-full max-w-[500px] rounded-[20px] bg-beige-light p-6 shadow-[0_18px_50px_rgba(26,26,48,.08)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-secondary hover:bg-gray-input hover:text-navy"
          aria-label="Close study plan setup"
        >
          <X size={20} />
        </button>

        <h2 className="mb-5 text-xl font-bold tracking-[-0.04em] text-navy">
          {title}
        </h2>

        <div className="mb-6 flex gap-1">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s <= step ? "bg-navy" : "bg-gray-light"
              }`}
            />
          ))}
        </div>

        {step === 1 && <TimeStep selected={time} onSelect={setTime} />}
        {step === 2 && <GoalStep selected={goal} onSelect={setGoal} />}
        {step === 3 && <CourseStep selected={courseId} onSelect={setCourseId} />}
        {step === 4 && (
          <PreferenceStep selected={preference} onSelect={setPreference} />
        )}

        {error && (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        )}

        <div className="mt-6 flex justify-between">
          {step > 1 ? (
            <button
              onClick={handleBack}
            className="flex items-center gap-1 text-sm text-gray-secondary hover:text-navy"
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleNext}
            disabled={!canProceed || isGenerating}
            className="flex items-center gap-1.5 rounded-[10px] bg-navy px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : step === 4 ? (
              submitLabel
            ) : (
              <>
                Next <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
