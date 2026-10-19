"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { formatUsd } from "@/src/library/billing/money";
import type { Wallet } from "@/src/context/BillingContext";

/**
 * Pick an amount, agree to the credit terms, go to Stripe's payment page.
 * Credit shows up when Stripe confirms the payment, usually within seconds.
 */
export default function AddCreditModal({ wallet, outOfCredit, onClose }: { wallet: Wallet | null; outOfCredit: boolean; onClose: () => void }) {
  const fitting = wallet?.topUps.filter((t) => t.fits) ?? [];
  const [amount, setAmount] = useState<number | null>(fitting[1]?.usd ?? fitting[0]?.usd ?? null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    if (!amount || !agreed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: amount, acceptedTerms: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) throw new Error(data?.error || "Couldn't start the payment. Please try again.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the payment. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-credit-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-bg-container p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="add-credit-title" className="text-base font-semibold text-text-main">
              {outOfCredit ? "You're out of AI credit" : "Add AI credit"}
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {outOfCredit
                ? "AI features pause until you add credit. Everything else in Catalyst keeps working."
                : "Credit pays for the AI you use, at cost. No subscription."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-text-muted hover:bg-bg-warm">
            <X size={16} />
          </button>
        </div>

        {wallet && (
          <p className="mt-4 rounded-lg bg-bg-main px-3 py-2 text-sm text-text-main">
            Balance: <strong>{formatUsd(wallet.balanceMicros)}</strong>
            <span className="text-text-muted"> of {formatUsd(wallet.capMicros)} max</span>
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-text-main">Amount</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(wallet?.topUps ?? []).map((t) => (
              <button
                key={t.usd}
                type="button"
                disabled={!t.fits}
                onClick={() => setAmount(t.usd)}
                aria-pressed={amount === t.usd}
                className={`rounded-xl border px-2 py-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  amount === t.usd ? "border-primary bg-bg-warm" : "border-border-light hover:border-border-hover"
                }`}
              >
                <span className="block text-base font-semibold text-text-main">${t.usd}</span>
                <span className="block text-xs text-text-muted">{formatUsd(t.creditMicros)} credit</span>
              </button>
            ))}
          </div>
          {wallet && fitting.length === 0 && (
            <p className="mt-2 text-xs text-text-muted">Your balance is close to the {formatUsd(wallet.capMicros)} limit. Use some of it first.</p>
          )}
          {wallet && fitting.length > 0 && fitting.length < wallet.topUps.length && (
            <p className="mt-2 text-xs text-text-muted">Larger amounts would put you over the {formatUsd(wallet.capMicros)} limit.</p>
          )}
          <p className="mt-2 text-xs text-text-muted">
            The difference is the card processor&apos;s fee (2.9% + 30¢), which we pass on without adding anything.
          </p>
        </fieldset>

        <label className="mt-4 flex items-start gap-2.5 text-sm text-text-main">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]" />
          <span>
            I&apos;m 18 or older, or my parent or guardian is paying, and I agree to the{" "}
            <Link href="/legal/credits" target="_blank" className="font-medium text-primary underline">Credits &amp; Refunds terms</Link>. Credit used on AI isn&apos;t refundable; unused credit is.
          </span>
        </label>

        {error && <p role="alert" className="mt-3 text-sm text-alert-error">{error}</p>}

        <button
          type="button"
          onClick={() => void checkout()}
          disabled={!amount || !agreed || busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {amount ? `Pay $${amount} with Stripe` : "Choose an amount"}
        </button>
        <p className="mt-3 text-center text-xs text-text-muted">
          Payment is handled by Stripe; Catalyst never sees your card. <Link href="/billing" onClick={onClose} className="underline">Usage &amp; history</Link>
        </p>
      </div>
    </div>
  );
}
