"use client";

import type { StudyTask } from "@/src/library/studyPlan/types";
import TaskCard from "../TaskCard/TaskCard";
import { Plus } from "lucide-react";

interface BoardViewProps {
  tasks: (StudyTask & { id: string })[];
  onStart: (taskId: string) => void;
  onSkip: (taskId: string) => void;
  onReschedule: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onPause: () => void;
  onComplete: (taskId: string) => void;
  onAddTask: () => void;
}

export default function BoardView({
  tasks,
  onStart,
  onSkip,
  onReschedule,
  onDelete,
  onPause,
  onComplete,
  onAddTask,
}: BoardViewProps) {
  const toDo = tasks.filter((t) => t.status === "recommended");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");

  const columns = [
    { title: "To Do", tasks: toDo, showAdd: true },
    { title: "In Progress", tasks: inProgress, showAdd: false },
    { title: "Completed", tasks: completed, showAdd: false },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {columns.map((col) => (
        <div key={col.title} className="min-w-0 overflow-hidden rounded-[14px] bg-gray-input p-2.5">
          <h3 className="mb-3 flex items-center justify-between px-1 text-[11px] font-extrabold uppercase tracking-wide text-navy">
            {col.title}{" "}
            <span className="text-xs font-normal">({col.tasks.length})</span>
          </h3>
          <div className="space-y-3">
            {col.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStart={() => onStart(task.id)}
                onSkip={() => onSkip(task.id)}
                onReschedule={() => onReschedule(task.id)}
                onDelete={
                  task.source === "manual" ? () => onDelete(task.id) : undefined
                }
                onPause={task.status === "in_progress" ? onPause : undefined}
                onComplete={
                  task.status === "in_progress"
                    ? () => onComplete(task.id)
                    : undefined
                }
              />
            ))}
            {col.showAdd && (
              <button
                type="button"
                onClick={onAddTask}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brown-label py-3 text-sm text-brown-label hover:border-navy hover:text-navy"
              >
                <Plus size={16} /> Add task
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
