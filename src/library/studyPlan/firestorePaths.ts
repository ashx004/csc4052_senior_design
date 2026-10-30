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

function slashFreeKey(parts: readonly string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join("|");
}

export function documentMasteryCollection(uid: string): string {
  return `users/${uid}/documentMastery`;
}

export function documentMasteryPath(uid: string, documentId: string): string {
  return `${documentMasteryCollection(uid)}/${documentId}`;
}

export function documentMasteryId(courseId: string, sourceDocKey: string): string {
  return slashFreeKey([courseId, sourceDocKey]);
}

export function conceptWeakSpotsCollection(uid: string): string {
  return `users/${uid}/conceptWeakSpots`;
}

export function conceptWeakSpotPath(uid: string, id: string): string {
  return `${conceptWeakSpotsCollection(uid)}/${id}`;
}

export function conceptWeakSpotId(courseId: string, conceptKey: string): string {
  return slashFreeKey([courseId, conceptKey]);
}

export function conceptSessionsCollection(uid: string): string {
  return `users/${uid}/conceptSessions`;
}

export function conceptSessionPath(uid: string, id: string): string {
  return `${conceptSessionsCollection(uid)}/${id}`;
}

export function conceptMasteryCollection(uid: string): string {
  return `users/${uid}/conceptMastery`;
}

export function conceptMasteryPath(uid: string, id: string): string {
  return `${conceptMasteryCollection(uid)}/${id}`;
}

export function conceptMasteryId(courseId: string, conceptKey: string): string {
  return slashFreeKey([courseId, conceptKey]);
}

export function conceptSessionId(courseId: string, sessionId: string, conceptKey: string): string {
  return slashFreeKey([courseId, sessionId, conceptKey]);
}

export function learningSuggestionsCollection(uid: string): string {
  return `users/${uid}/learningSuggestions`;
}

export function learningSuggestionPath(uid: string, suggestionId: string): string {
  return `${learningSuggestionsCollection(uid)}/${suggestionId}`;
}

// Legacy: learningSuggestions is superseded by conceptWeakSpots; old documents are abandoned, not migrated.
export function learningSuggestionId(courseId: string, quizId: string): string {
  return slashFreeKey([courseId, quizId]);
}

export function learningActivityEventsCollection(uid: string): string {
  return `users/${uid}/learningActivityEvents`;
}

export function learningActivityEventPath(uid: string, eventId: string): string {
  return `${learningActivityEventsCollection(uid)}/${eventId}`;
}

export function learningActivityEventId(type: string, sourceTaskId: string): string {
  return slashFreeKey([type, sourceTaskId]);
}

export function pendingQuizAttemptsCollection(uid: string): string {
  return `users/${uid}/pendingQuizAttempts`;
}

export function pendingQuizAttemptPath(uid: string, attemptId: string): string {
  return `${pendingQuizAttemptsCollection(uid)}/${attemptId}`;
}

export function quizSetsCollection(uid: string, courseId: string): string {
  return `users/${uid}/enrollment/${courseId}/quizSets`;
}

export function quizSetPath(uid: string, courseId: string, quizId: string): string {
  return `${quizSetsCollection(uid, courseId)}/${quizId}`;
}

export function quizAttemptsCollection(
  uid: string,
  courseId: string,
  quizId: string
): string {
  return `${quizSetPath(uid, courseId, quizId)}/attempts`;
}

export function quizAttemptPath(
  uid: string,
  courseId: string,
  quizId: string,
  attemptId: string
): string {
  return `${quizAttemptsCollection(uid, courseId, quizId)}/${attemptId}`;
}
