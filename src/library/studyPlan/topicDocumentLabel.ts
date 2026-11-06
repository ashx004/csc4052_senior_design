/**
 * Turns a document resource name (for example `uploads/03-cell-respiration.pdf`)
 * into a readable topic label (`Cell Respiration`). Falls back to the raw
 * resource name when tidying leaves nothing readable.
 */
export function topicDocumentLabel(resourceName: string): string {
  const fileName = resourceName.slice(resourceName.lastIndexOf("/") + 1);
  const withoutPrefix = fileName.replace(/^(?:\d{4}-\d{2}-\d{2}|\d+)[-_ ]/, "");
  const withoutExtension = withoutPrefix.replace(/\.[^.]{1,5}$/, "");
  const words = withoutExtension
    .replace(/[-_\s]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const label = words.join(" ");
  return label.length > 0 ? label : resourceName;
}
