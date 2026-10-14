/**
 * Two-tone flame drawn inline so the streak badge never depends on an emoji
 * font or a raster asset. The outer body inherits `currentColor` so callers
 * set the warm tone with a text color token; the inner core is the fixed
 * highlight that makes the shape read as a flame at badge size.
 *
 * Decorative by default (`aria-hidden`). Pass `title` only when the flame is
 * the sole carrier of meaning — in the streak badge it is not, so the badge
 * leaves `title` off and spells the streak out in text instead.
 */
export default function FireIcon({ className = "", title }: { className?: string; title?: string }) {
  const labelled = Boolean(title);
  return (
    <svg viewBox="0 0 72 88" className={className} role={labelled ? "img" : undefined} aria-hidden={labelled ? undefined : true} aria-label={title}>
      <path d="M38 3c4 16 25 24 25 49 0 19-12 32-28 32S7 72 7 53c0-13 7-22 17-33 1 9 4 13 8 15 1-13 4-24 6-32Z" fill="currentColor" />
      <path d="M35 42c2 8 11 12 11 23 0 9-5 15-12 15s-13-6-13-15c0-7 4-12 9-17 1 5 2 7 4 8 0-6 0-10 1-14Z" fill="#F6CA45" />
    </svg>
  );
}
