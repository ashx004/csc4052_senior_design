// The chat can change data other pages are showing (a calendar event added,
// a Confirm card deleting one). Pages that cache their data listen for this
// and quietly refetch, so the change appears without a reload.
export const DATA_CHANGED_EVENT = "catalyst:data-changed";

export function notifyDataChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}
