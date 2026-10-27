const PLACEHOLDER_LABEL = /^(?:question|topic|item|problem) \d+$/;
const GENERIC_PHRASES = ["chapter content", "course material", "general"] as const;

export function conceptKey(label: string): string {
  const normalized = label.toLowerCase().trim().replace(/\s+/g, " ");
  return normalized.replace(/^the /, "");
}

export function isUsableConceptLabel(label: string): boolean {
  const key = conceptKey(label);
  if (!key) return false;
  if (PLACEHOLDER_LABEL.test(key)) return false;
  return !GENERIC_PHRASES.some((phrase) => key.includes(phrase));
}
