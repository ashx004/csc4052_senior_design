interface PlanSummary {
  state?: string;
  totalTasks?: number;
  taskIds?: string[];
}

/** A plan with no persisted tasks is not actionable and should be regenerated. */
export function hasUsablePlan(plan: PlanSummary | null | undefined): boolean {
  if (!plan) return false;
  const taskCount = plan.totalTasks ?? plan.taskIds?.length ?? 0;
  return taskCount > 0;
}
