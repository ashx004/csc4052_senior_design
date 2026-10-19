"use client";

import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { availableMicros, formatUsd } from "@/src/library/billing/money";
import { useBilling } from "@/src/context/BillingContext";

// Low enough that a few more tasks may not fit; the badge turns amber.
const LOW_MICROS = 500_000;

/** The student's AI credit in the sidebar, on every page: balance, how full, and a way to add more. */
export default function CreditBadge() {
  const { wallet, openAddCredit } = useBilling();
  if (!wallet?.enforced) return null;

  const available = availableMicros(wallet);
  const out = available < wallet.minToStartMicros;
  const low = !out && available < LOW_MICROS;
  const percent = Math.max(0, Math.min(100, (wallet.balanceMicros / wallet.capMicros) * 100));
  const tone = out ? "bg-red-400" : low ? "bg-amber-300" : "bg-emerald-300";

  return (
    <div className="mb-3 rounded-xl bg-white/10 px-3 py-2.5" data-tutorial="ai-credit">
      <div className="flex items-center justify-between gap-2">
        <Link href="/billing" className="flex min-w-0 items-center gap-2 text-white/85 hover:text-white">
          <Sparkles size={15} aria-hidden="true" />
          <span className="truncate text-xs">
            AI credit <strong className="text-white">{formatUsd(wallet.balanceMicros)}</strong>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => openAddCredit()}
          className="flex h-7 items-center gap-1 rounded-lg bg-white/15 px-2 text-[11px] font-semibold text-white hover:bg-white/25"
          aria-label="Add AI credit"
        >
          <Plus size={12} aria-hidden="true" /> Add
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      {(out || low) && (
        <p className={`mt-1.5 text-[11px] ${out ? "text-red-200" : "text-amber-100"}`}>
          {out ? "Out of credit: AI features are paused." : "Running low."}
        </p>
      )}
    </div>
  );
}
