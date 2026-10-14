/** Dragged position first; classes never reordered keep their original order after them. */
export function sortByPosition<T extends { sortOrder?: number }>(classes: T[]): T[] {
  return classes
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.sortOrder ?? Infinity) - (b.item.sortOrder ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);
}
