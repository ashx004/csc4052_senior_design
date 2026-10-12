export const MAX_STUDY_SOURCES = 10;
export const SOURCE_LATENCY_WARNING_AT = 6;

export interface SourceOption {
  id: string;
  title: string;
  kind: 'document' | 'note';
  resourceId?: string;
  status: 'ready' | 'indexing' | 'unavailable';
  reason?: string;
}

interface ResourceInput {
  id: string;
  name: string;
  indexStatus?: string;
}

interface NoteInput {
  id: string;
  title: string;
  kind: string;
  courseId: string | null;
  resourceId?: string;
}

/** Maps the resource index statuses this app actually writes. */
function documentStatus(indexStatus?: string): Pick<SourceOption, 'status' | 'reason'> {
  if (indexStatus === 'failed') {
    return { status: 'unavailable', reason: 'This document could not be prepared for study.' };
  }
  if (indexStatus === 'queued' || indexStatus === 'processing') {
    return { status: 'indexing' };
  }
  // "complete", or missing on older uploads that stay searchable.
  return { status: 'ready' };
}

export function normalizeSourceOptions(
  resources: ResourceInput[],
  notes: NoteInput[],
  courseId: string,
): SourceOption[] {
  const documents: SourceOption[] = resources.map((resource) => ({
    id: resource.id,
    title: resource.name || 'Untitled document',
    kind: 'document',
    resourceId: resource.id,
    ...documentStatus(resource.indexStatus),
  }));
  const documentIds = new Set(documents.map((document) => document.id));
  const courseNotes = notes.filter((note) => note.courseId === courseId);
  const noteOptions: SourceOption[] = [];
  for (const note of courseNotes) {
    if (note.kind === 'document' && note.resourceId && documentIds.has(note.resourceId)) continue;
    noteOptions.push({
      id: note.id,
      title: note.title || 'Untitled note',
      kind: 'note',
      resourceId: note.resourceId,
      status: 'ready',
    });
  }
  return [...documents, ...noteOptions];
}

export function filterSourceOptions(options: SourceOption[], query: string): SourceOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.title.toLowerCase().includes(needle));
}

export function eligibleSourceIds(ids: string[], options: SourceOption[]): string[] {
  return [...new Set(ids)].filter((id) => options.some((option) => option.id === id && option.status !== 'unavailable')).slice(0, MAX_STUDY_SOURCES);
}

export function validSourceSelection(ids: string[], options: SourceOption[]): boolean {
  return ids.length > 0 && ids.length <= MAX_STUDY_SOURCES && eligibleSourceIds(ids, options).length === ids.length;
}

export function sourceCheckboxDisabled(option: SourceOption, ids: string[]): boolean {
  return !ids.includes(option.id) && (option.status === 'unavailable' || ids.length >= MAX_STUDY_SOURCES);
}

export function toggleSource(ids: string[], id: string, options: SourceOption[]): string[] {
  if (ids.includes(id)) return ids.filter((item) => item !== id);
  const option = options.find((item) => item.id === id);
  if (!option || option.status === 'unavailable') return ids;
  return ids.length < MAX_STUDY_SOURCES ? [...ids, id] : ids;
}

/** Adds visible eligible sources up to the cap. If they are all selected, clears only those visible ids. */
export function toggleVisibleSources(selectedIds: string[], visible: SourceOption[]): string[] {
  const eligible = visible.filter((option) => option.status !== 'unavailable');
  if (eligible.length === 0) return selectedIds;
  const allSelected = eligible.every((option) => selectedIds.includes(option.id));
  if (allSelected) {
    const visibleIds = new Set(eligible.map((option) => option.id));
    return selectedIds.filter((id) => !visibleIds.has(id));
  }
  const next = [...selectedIds];
  for (const option of eligible) {
    if (next.includes(option.id)) continue;
    if (next.length >= MAX_STUDY_SOURCES) break;
    next.push(option.id);
  }
  return next;
}

export function sourceSelectionNotice(count: number): string | null {
  if (count >= MAX_STUDY_SOURCES) return 'You can choose up to 10 sources.';
  if (count >= SOURCE_LATENCY_WARNING_AT) return 'Six or more sources can take longer to prepare.';
  return null;
}

export function sourceStatusLabel(status: SourceOption['status']): string {
  if (status === 'indexing') return 'Still indexing';
  if (status === 'unavailable') return 'Unavailable';
  return 'Ready';
}
