import { TriangleAlert } from "lucide-react";
import { formatBuiltAt } from "./format";

export function StaleBanner({
  builtAt,
  source,
  staleReason,
  timeZone,
}: {
  builtAt: string;
  source: "live" | "snapshot";
  staleReason?: "quota" | "unavailable" | null;
  /** Tests pin this; the page leaves it to the viewer's clock. */
  timeZone?: string;
}) {
  if (source === "live") return null;
  // Midnight Pacific is when the Firestore quota resets; it is not a day boundary for the figures.
  const reason = staleReason === "quota"
    ? "Live update unavailable — daily Firestore quota used up. Resets at midnight Pacific."
    : "Live update unavailable right now.";
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-[#f1c6c0] bg-[#fbe8e6] px-4 py-3 text-sm"
    >
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#a3302a]" />
      <div>
        <p className="font-semibold text-[#a3302a]">Showing data from {formatBuiltAt(builtAt, timeZone)}.</p>
        <p className="mt-0.5 text-[#3d3a34]">{reason}</p>
      </div>
    </div>
  );
}
