export function studyPlanPath(uid: string, date: string): string {
  return `users/${uid}/studyPlans/${date}`;
}

export function studyTasksCollection(uid: string): string {
  return `users/${uid}/studyTasks`;
}

export function studyTaskPath(uid: string, taskId: string): string {
  return `users/${uid}/studyTasks/${taskId}`;
}

export function studySessionsCollection(uid: string): string {
  return `users/${uid}/studySessions`;
}

export function studySessionPath(uid: string, sessionId: string): string {
  return `users/${uid}/studySessions/${sessionId}`;
}

export function masterySignalsCollection(uid: string): string {
  return `users/${uid}/masterySignals`;
}

export function masterySignalPath(uid: string, signalId: string): string {
  return `users/${uid}/masterySignals/${signalId}`;
}

export function studyNotificationsCollection(uid: string): string {
  return `users/${uid}/studyNotifications`;
}

export function notificationPrefsPath(uid: string): string {
  return `users/${uid}/settings/studyNotifications`;
}

export function cardEngagementPath(
  uid: string,
  courseId: string,
  setId: string,
  cardIndex: string
): string {
  return `users/${uid}/enrollment/${courseId}/flashcardSets/${setId}/cardEngagement/${cardIndex}`;
}
