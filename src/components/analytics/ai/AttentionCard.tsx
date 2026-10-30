import Link from "next/link";
import { ArrowRight, Clock, Database, TriangleAlert, type LucideIcon } from "lucide-react";

export type AttentionTone = "slow" | "cost" | "fail";

// Tinted cards fix their own text colours, so they read the same under every theme (all >= 4.5:1 on their tint).
const tones: Record<AttentionTone, { icon: LucideIcon; card: string; accent: string; value: string }> = {
  slow: { icon: Clock, card: "border-[#f0dfca] bg-[#fbf1e6]", accent: "text-[#8a6539]", value: "text-[#3d3a34]" },
  cost: { icon: Database, card: "border-[#dcd8f6] bg-[#efedfc]", accent: "text-[#4f43b8]", value: "text-[#3d3a34]" },
  fail: { icon: TriangleAlert, card: "border-[#f3cfcb] bg-[#fbe9e8]", accent: "text-[#a3302a]", value: "text-[#a3302a]" },
};

/** `href` null: the feature has no drill-down page, so the card is not a link and says so. */
export function AttentionCard({
  tone,
  label,
  feature,
  value,
  context,
  href,
}: {
  tone: AttentionTone;
  label: string;
  feature: string;
  value: string;
  context: string;
  href: string | null;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  const body = (
    <>
      <span className="flex items-start gap-3">
        <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/70 ${t.accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className={`block text-xs ${t.accent}`}>{label}</span>
          <span className="block truncate text-sm font-semibold text-[#3d3a34]">{feature}</span>
        </span>
      </span>
      <span className={`mt-4 block text-3xl font-semibold tabular-nums tracking-tight ${t.value}`}>{value}</span>
      <span className={`mt-2 block pr-10 text-xs ${t.accent}`}>{context}</span>
    </>
  );
  if (href === null) {
    return (
      <div data-tone={tone} className={`relative flex min-w-0 flex-col rounded-xl border p-4 ${t.card}`}>
        {body}
        <span className={`mt-1 block text-[11px] ${t.accent}`}>No detail page is available for this feature.</span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      data-tone={tone}
      className={`group relative flex min-w-0 flex-col rounded-xl border p-4 transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${t.card}`}
    >
      {body}
      <span
        aria-hidden
        className="absolute bottom-4 right-4 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#3d3a34] shadow-sm transition-transform group-hover:translate-x-0.5"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
