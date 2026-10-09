export function nextAddIntent(
  querySuggestionId: string | null,
  handledSuggestionId: string | null,
): { shouldAdd: boolean; handledSuggestionId: string | null } {
  if (!querySuggestionId) {
    return { shouldAdd: false, handledSuggestionId };
  }
  if (querySuggestionId === handledSuggestionId) {
    return { shouldAdd: false, handledSuggestionId };
  }
  return { shouldAdd: true, handledSuggestionId: querySuggestionId };
}
