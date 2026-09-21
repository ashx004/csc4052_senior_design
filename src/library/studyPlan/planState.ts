interface PlanSummary {
  state?: string;
  totalTasks?: number;
  taskIds?: string[];
}

interface PlanTaskSummary {
  id: string;
  status: string;
  totalActiveMinutes?: number;
}

export function getPlanAggregateUpdates(
  plan: PlanSummary,
  tasks: PlanTaskSummary[],
  changedTaskId: string,
  changedStatus: string,
  additionalActiveMinutes = 0
) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const nextTasks = (plan.taskIds ?? [])
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is PlanTaskSummary => Boolean(task))
    .map((task) =>
      task.id === changedTaskId
        ? {
            ...task,
            status: changedStatus,
            totalActiveMinutes:
              (task.totalActiveMinutes ?? 0) + additionalActiveMinutes,
          }
        : task
    );

  const completedCount = nextTasks.filter((task) => task.status === "completed").length;
  const skippedCount = nextTasks.filter((task) => task.status === "skipped").length;
  const hasRemainingWork = nextTasks.some(
    (task) => task.status === "recommended" || task.status === "in_progress"
  );

  return {
    state: hasRemainingWork ? "active" : "completed",
    completedCount,
    skippedCount,
    totalActiveMinutes: nextTasks.reduce(
      (sum, task) => sum + (task.totalActiveMinutes ?? 0),
      0
    ),
  } as const;
}

/** A plan with no persisted tasks is not actionable and should be regenerated. */
export function hasUsablePlan(plan: PlanSummary | null | undefined): boolean {
  if (!plan) return false;
  const taskCount = plan.totalTasks ?? plan.taskIds?.length ?? 0;
  return taskCount > 0;
}
