export interface ThinkingStep {
  label: string;
  /** ms since the indicator appeared */
  at: number;
}

/** Appends a status to the step list unless it repeats the latest one. */
export function recordStep(steps: ThinkingStep[], label: string | null, at: number): ThinkingStep[] {
  if (!label) return steps;
  if (steps[steps.length - 1]?.label === label) return steps;
  return [...steps, { label, at }];
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
