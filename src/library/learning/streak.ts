import {
  localDateKey,
  mondayOf,
  weekDateKeys,
} from "@/src/library/studyPlan/weeklyRuler";

/** How many previous local days the streak query reads. A longer streak is
 *  reported as this length, which keeps the Firestore read cheap. */
export const STREAK_LOOKBACK_DAYS = 60;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type StreakDay = {
  date: string;
  weekday: string;
  studied: boolean;
  isToday: boolean;
  isFuture: boolean;
};

export type StudyStreak = {
  count: number;
  studiedDateKeys: Set<string>;
  week: StreakDay[];
};

export function computeStudyStreak(
  studiedDateKeys: Iterable<string>,
  now: Date,
): StudyStreak {
  const studied = new Set(studiedDateKeys);
  const todayKey = localDateKey(now);

  // A streak ending yesterday is still alive today.
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!studied.has(todayKey)) cursor.setDate(cursor.getDate() - 1);

  let count = 0;
  while (studied.has(localDateKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const week = weekDateKeys(mondayOf(now)).map((date, i) => ({
    date,
    weekday: WEEKDAYS[i],
    studied: studied.has(date),
    isToday: date === todayKey,
    isFuture: date > todayKey,
  }));

  return { count, studiedDateKeys: studied, week };
}

export function emptyStudyStreak(now: Date): StudyStreak {
  return computeStudyStreak([], now);
}
