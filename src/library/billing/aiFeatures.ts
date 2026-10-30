// The feature ids the admin AI pages know, split the way the Detailed analysis screen groups them.

/** Features a student's own action triggers. */
export const STUDENT_FEATURES = [
  "chat", "quiz-generation", "flashcard-generation", "practice-generation", "discover-learn-question",
  "ocr", "course-summary", "syllabus", "embeddings", "contextual-chunking",
] as const;

/** Features that run without a student asking. Any recorded feature in neither list is shown here too. */
export const BACKGROUND_FEATURES = [
  "query-clarifier", "thought-summary", "chat-summarize", "student-profile", "warm-model",
  "advising-extract-transcript", "advising-extract-curriculum", "advising-extract-concentrations",
  "advising-extract-program-info", "advising-generate-schedule", "advising-unspecified",
] as const;

/** Per-row notes for features whose request count is not comparable to the others, or that signal a bug. */
export const FEATURE_NOTES: Readonly<Record<string, string>> = {
  embeddings: "runs many times per document",
  "contextual-chunking": "runs once per chunk",
  "advising-unspecified": "a call site forgot to label itself",
};

/** One line under a drill-down page's heading, for the features that have one. */
export const FEATURE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  chat: "General chat with the AI assistant.",
  "quiz-generation": "Generates quiz questions from course content.",
  "advising-generate-schedule": "Builds a personalised schedule from advising data.",
};

export const featureDescription = (feature: string): string | null =>
  Object.hasOwn(FEATURE_DESCRIPTIONS, feature) ? FEATURE_DESCRIPTIONS[feature] : null;

export const isStudentFeature = (feature: string) => (STUDENT_FEATURES as readonly string[]).includes(feature);

const KNOWN_FEATURES: ReadonlySet<string> = new Set([...STUDENT_FEATURES, ...BACKGROUND_FEATURES]);
/** Listed above, so it has a drill-down page; the endpoint refuses detail for any other id. */
export const isKnownFeature = (feature: string) => KNOWN_FEATURES.has(feature);
