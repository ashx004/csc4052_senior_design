const LOOKAHEAD_DAYS = 14;

export function getStudyPlanDateRange(now = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + LOOKAHEAD_DAYS);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
