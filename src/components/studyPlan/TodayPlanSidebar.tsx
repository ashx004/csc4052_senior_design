"use client";

import { ArrowRight, Check } from "lucide-react";
import type { StudyTask } from "@/src/library/studyPlan/types";

interface TodayPlanSidebarProps {
  tasks: (StudyTask & { id: string })[];
  onViewFullPlan: () => void;
}

export default function TodayPlanSidebar({
  tasks,
  onViewFullPlan,
}: TodayPlanSidebarProps) {
  const visible = tasks.slice(0, 3);
  const completed = visible.filter((t) => t.status === "completed");
  const totalMinutes = visible.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const doneMinutes = completed.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const progress = totalMinutes > 0 ? (doneMinutes / totalMinutes) * 100 : 0;

  return (
    <section className="rounded-2xl border border-gray-light bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-navy">Today&apos;s plan</h3>
        <button
          type="button"
          onClick={onViewFullPlan}
          className="flex items-center gap-1 text-xs font-medium text-brown-label underline underline-offset-4 transition-colors hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          View full plan
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-gray-secondary">
          No tasks yet. Start a study plan and Catalyst will suggest what to work
          on first.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {visible.map((task) => {
              const isDone = task.status === "completed";
              return (
                <li
                  key={task.id}
                  className="flex items-start gap-3 rounded-xl bg-beige-light p-3"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                      isDone
                        ? "border-navy bg-navy text-white"
                        : "border-gray-light bg-white"
                    }`}
                  >
                    {isDone && <Check size={12} strokeWidth={3} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold text-navy ${
                        isDone ? "line-through decoration-gray-secondary" : ""
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-secondary">
                      {task.courseName}
                      {task.reason ? ` · ${task.reason}` : ""}
                      {isDone ? " · Done" : ""}
                    </p>
                  </div>

                  <span className="flex-shrink-0 text-xs font-medium tabular-nums text-brown-label">
                    {task.estimatedMinutes} min
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-gray-light"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Today's plan progress"
            >
              <div
                className="h-full rounded-full bg-brown-label transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-secondary">
              <span>
                {completed.length} of {visible.length} tasks complete
              </span>
              <span className="tabular-nums">
                {doneMinutes} / {totalMinutes} min
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
