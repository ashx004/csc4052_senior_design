"use client";

import type { ReactNode } from "react";
import type { DailyPlan, PlanViewMode } from "@/src/library/studyPlan/types";
import PlanHeader from "./PlanHeader";
import ViewSwitcher from "./Views/ViewSwitcher";

interface PlanSectionProps {
  plan: DailyPlan;
  remainingMinutes: number;
  canStartNext: boolean;
  viewMode: PlanViewMode;
  onViewModeChange: (mode: PlanViewMode) => void;
  onAddTask: () => void;
  onStartNextTask: () => void;
  onClearPlan: () => void;
  /** The active plan view (list, board, or schedule). */
  children: ReactNode;
  /** Right-hand context column, e.g. the focus mode card. */
  sidebar: ReactNode;
}

export default function PlanSection({
  plan,
  remainingMinutes,
  canStartNext,
  viewMode,
  onViewModeChange,
  onAddTask,
  onStartNextTask,
  onClearPlan,
  children,
  sidebar,
}: PlanSectionProps) {
  return (
    <section>
      <PlanHeader
        plan={plan}
        remainingMinutes={remainingMinutes}
        canStartNext={canStartNext}
        onAddTask={onAddTask}
        onStartNextTask={onStartNextTask}
        onClearPlan={onClearPlan}
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-navy">Plan workspace</h3>
        <ViewSwitcher current={viewMode} onChange={onViewModeChange} />
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0">{children}</div>
        <div>{sidebar}</div>
      </div>
    </section>
  );
}
