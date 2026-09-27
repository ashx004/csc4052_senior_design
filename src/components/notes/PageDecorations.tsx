import { PAGE_HEIGHT } from "@/src/library/notes/types";

/** Faint dashed line where each page ends, and a faint page number in
 *  each page's bottom-right corner. Purely visual; never intercepts input. */
export default function PageDecorations({ pages }: { pages: number }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {Array.from({ length: pages }, (_, i) => (
        <div key={i}>
          {i > 0 && (
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-text-muted opacity-20"
              style={{ top: i * PAGE_HEIGHT }}
            />
          )}
          <span
            className="absolute right-10 text-xs tabular-nums text-text-muted opacity-40"
            style={{ top: (i + 1) * PAGE_HEIGHT - 36 }}
          >
            {i + 1}
          </span>
        </div>
      ))}
    </div>
  );
}
