import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** How many course codes fit on one line before the rest become "+N". */
const VISIBLE_PIPS = 3;

/**
 * One of the two routes offered on the landing page. The whole card is the
 * link; the arrow circle is decoration, so each card is a single tab stop.
 * The scribble is drawn in a lighter tint of the card's own colour, which is
 * what keeps the pastel surfaces from reading as flat blocks. Class codes sit
 * in their own row of labels, bordered in the card's colour, with anything
 * past three folded into a count so the row stays one line.
 */
export default function LearningDestinationCard({
  href,
  icon,
  title,
  meta,
  pips,
  surfaceClassName,
  scribbleClassName,
  notchClassName,
  pipBorderClassName,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  meta?: string;
  pips?: string[];
  surfaceClassName: string;
  scribbleClassName: string;
  notchClassName: string;
  pipBorderClassName: string;
}) {
  return (
    <Link
      href={href}
      className={`relative flex min-h-[296px] flex-col justify-end rounded-[30px] p-[22px] text-[#15161C] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${surfaceClassName}`}
    >
      <span className="absolute left-[22px] top-[22px] z-[3] grid h-[46px] w-[46px] place-items-center rounded-full bg-white">
        {icon}
      </span>

      <svg
        data-scribble
        aria-hidden="true"
        viewBox="0 0 300 90"
        preserveAspectRatio="none"
        className={`pointer-events-none absolute left-[4%] top-[52px] z-[1] h-[132px] w-[92%] ${scribbleClassName}`}
      >
        <path
          vectorEffect="non-scaling-stroke"
          fill="none"
          stroke="currentColor"
          strokeWidth="19"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M22 12C110 -2 206 24 276 6 196 30 92 22 22 44 116 30 214 52 274 38 186 64 84 54 20 80"
        />
      </svg>

      <span
        data-arrow
        aria-hidden="true"
        className={`absolute right-4 top-[44%] z-[4] grid h-[58px] w-[58px] place-items-center rounded-full bg-[#15161C] text-white ${notchClassName}`}
      >
        <ArrowUpRight size={20} strokeWidth={2.3} />
      </span>

      <span className="relative z-[3] block max-w-[10ch] text-[30px] font-bold leading-[1.12] tracking-[-0.025em]">
        {title}
      </span>

      {meta !== undefined && (
        <span data-meta className="relative z-[3] mt-4 flex flex-col items-start gap-2.5 text-[15px] text-[#5E6068]">
          {pips && pips.length > 0 && (
            <span className="flex max-w-full flex-wrap items-center gap-1.5">
              {pips.slice(0, VISIBLE_PIPS).map((pip, index) => (
                <span
                  key={`${pip}-${index}`}
                  title={pip}
                  className={`inline-block max-w-[9.5rem] truncate rounded-full border-2 bg-white px-2.5 py-1 text-xs font-bold leading-none text-[#15161C] ${pipBorderClassName}`}
                >
                  {pip}
                </span>
              ))}
              {pips.length > VISIBLE_PIPS && (
                <span className={`inline-block rounded-full border-2 bg-white px-2.5 py-1 text-xs font-bold leading-none text-[#15161C] ${pipBorderClassName}`}>
                  +{pips.length - VISIBLE_PIPS}
                </span>
              )}
            </span>
          )}
          <span>{meta}</span>
        </span>
      )}
    </Link>
  );
}
