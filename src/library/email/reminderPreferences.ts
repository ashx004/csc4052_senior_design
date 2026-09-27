import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

export const DEFAULT_EMAIL_REMINDER_OFFSETS_MINUTES = [24 * 60] as const;

export type EmailReminderPreferences = {
  enabled: boolean;
  offsetsMinutes: number[];
  timeZone: string;
};

export function defaultEmailReminderPreferences(timeZone: string): EmailReminderPreferences {
  return {
    enabled: false,
    offsetsMinutes: [...DEFAULT_EMAIL_REMINDER_OFFSETS_MINUTES],
    timeZone,
  };
}

export function normalizeReminderOffsets(offsets: readonly number[] | undefined): number[] {
  const candidates = offsets?.length ? offsets : DEFAULT_EMAIL_REMINDER_OFFSETS_MINUTES;
  return [...new Set(candidates)]
    .filter((offset) => Number.isInteger(offset) && offset > 0 && offset <= 30 * 24 * 60)
    .sort((left, right) => right - left);
}

function preferencesRef(db: Firestore, uid: string) {
  return doc(db, "users", uid, "settings", "emailReminders");
}

/** Missing preferences intentionally mean email reminders are off. */
export async function getEmailReminderPreferences(
  db: Firestore,
  uid: string,
  fallbackTimeZone: string,
): Promise<EmailReminderPreferences> {
  const fallback = defaultEmailReminderPreferences(fallbackTimeZone);
  const snapshot = await getDoc(preferencesRef(db, uid));
  if (!snapshot.exists()) return fallback;

  const data = snapshot.data();
  return {
    enabled: data.enabled === true,
    offsetsMinutes: normalizeReminderOffsets(
      Array.isArray(data.offsetsMinutes) ? data.offsetsMinutes : fallback.offsetsMinutes,
    ),
    timeZone: typeof data.timeZone === "string" && data.timeZone.trim()
      ? data.timeZone
      : fallback.timeZone,
  };
}

export async function saveEmailReminderPreferences(
  db: Firestore,
  uid: string,
  preferences: EmailReminderPreferences,
): Promise<void> {
  await setDoc(preferencesRef(db, uid), {
    enabled: preferences.enabled,
    offsetsMinutes: normalizeReminderOffsets(preferences.offsetsMinutes),
    timeZone: preferences.timeZone,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
