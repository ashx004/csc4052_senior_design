"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { useBilling } from "@/src/context/BillingContext";
import { availableMicros, formatUsd, usdToMicros } from "@/src/library/billing/money";
import PageTutorial from "@/src/components/tutorial/PageTutorial";
import billingSteps from "@/src/library/tutorials/steps/billing";

type Entry = { id: string; type: string; amountMicros: number; feature: string | null; model: string | null; at: string | null };

const FEATURE_LABELS: Record<string, string> = {
  chat: "AI assistant",
  "quiz-generation": "Quizzes",
  "flashcard-generation": "Flashcards",
  "practice-generation": "Practice problems",
  "discover-learn-question": "Discover questions",
  ocr: "Handwriting (OCR)",
  "contextual-chunking": "Indexing documents for search",
  "thought-summary": "AI assistant (thinking summaries)",
  "query-clarifier": "AI assistant (search help)",
  "student-profile": "AI assistant (remembering your preferences)",
  "course-summary": "Course summaries",
  syllabus: "Syllabus reading",
};
const featureLabel = (f: string | null) =>
  (f && FEATURE_LABELS[f]) || (f?.startsWith("advising-") ? "Advising" : f ? f.replace(/-/g, " ") : "AI");

const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "Recently");

// Charges come one per AI request (a quiz is several), so the history shows
// one line per feature per day; purchases and refunds stay individual.
function groupHistory(entries: Entry[]) {
  const rows: { key: string; day: string; label: string; amountMicros: number; count: number; kind: string }[] = [];
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const e of entries) {
    const day = dayOf(e.at);
    if (e.type === "charge") {
      const key = `${day}|${e.feature}`;
      const row = byKey.get(key);
      if (row) {
        row.amountMicros += e.amountMicros;
        row.count += 1;
        continue;
      }
      const created = { key, day, label: featureLabel(e.feature), amountMicros: e.amountMicros, count: 1, kind: "charge" };
      byKey.set(key, created);
      rows.push(created);
    } else {
      const label =
        e.type === "purchase" ? "Added credit"
        : e.type === "trial" ? "Free trial credit"
        : e.type === "refund" ? "Refund to your card"
        : e.type === "refund-ai" ? `Refunded: ${featureLabel(e.feature)} failed on our side`
        : e.type === "dispute" ? "Disputed payment"
        : e.type;
      rows.push({ key: e.id, day, label, amountMicros: e.amountMicros, count: 1, kind: e.type });
    }
  }
  return rows;
}

// useSearchParams needs a Suspense boundary for the production build.
export default function BillingPageRoute() {
  return (
    <Suspense>
      <BillingPage />
    </Suspense>
  );
}

function BillingPage() {
  const { wallet, refresh, openAddCredit } = useBilling();
  const params = useSearchParams();
  const returned = params.get("checkout");
  const [history, setHistory] = useState<Entry[] | null>(null);
  const [waitingForPayment, setWaitingForPayment] = useState(returned === "success");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch("/api/billing/wallet?history=1", { cache: "no-store" }).catch(() => null);
      const data = response?.ok ? await response.json() : null;
      if (!cancelled && data) setHistory(data.history as Entry[]);
      return data;
    };
    void load();
    if (returned !== "success") return () => { cancelled = true; };
    // Stripe tells our server about the payment a few seconds after the
    // student lands back here; check until the purchase appears.
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const data = await load();
      await refresh();
      const latest = (data?.history as Entry[] | undefined)?.[0];
      const fresh = latest?.type === "purchase" && latest.at && Date.now() - new Date(latest.at).getTime() < 10 * 60_000;
      if (fresh || tries >= 15) {
        clearInterval(timer);
        if (!cancelled) setWaitingForPayment(false);
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [returned, refresh]);

  const rows = useMemo(() => groupHistory(history ?? []), [history]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageTutorial id="billing" steps={billingSteps} />
      <h1 className="text-2xl font-semibold tracking-tight text-text-main">AI credit</h1>
      <p className="mt-1 text-sm text-text-muted">
        Catalyst&apos;s AI runs on prepaid credit, charged at what each request actually costs our AI providers, with their fees passed on and nothing added.
        Everything that isn&apos;t AI is free.
      </p>

      {returned === "success" && (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-alert-success-bg px-4 py-3 text-sm text-alert-success">
          {waitingForPayment ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {waitingForPayment ? "Payment received. Adding your credit..." : "Thanks! Your credit is ready. A receipt is on its way to your email."}
        </div>
      )}
      {returned === "cancelled" && (
        <p className="mt-5 rounded-xl bg-bg-warm px-4 py-3 text-sm text-text-main">Payment cancelled. You weren&apos;t charged.</p>
      )}

      <section className="mt-6 rounded-2xl border border-border-light bg-bg-container p-5" data-tutorial="billing-balance">
        {wallet ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Balance</p>
                <p className="text-3xl font-semibold text-text-main">{formatUsd(wallet.balanceMicros)}</p>
                {wallet.heldMicros > 0 && (
                  <p className="text-xs text-text-muted">{formatUsd(wallet.heldMicros)} set aside for a reply in progress</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => openAddCredit()}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse hover:bg-primary-hover"
              >
                <Plus size={16} /> Add credit
              </button>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-warm" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (wallet.balanceMicros / wallet.capMicros) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Balances are capped at {formatUsd(wallet.capMicros)}. Top-ups start at {formatUsd(wallet.minTopUpMicros)}.
              {availableMicros(wallet) < wallet.minToStartMicros && " AI features are paused until you add credit."}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={14} className="animate-spin" /> Loading...</p>
        )}
      </section>

      {wallet && (
        <section className="mt-6" data-tutorial="billing-estimates">
          <h2 className="text-base font-semibold text-text-main">What things cost</h2>
          <p className="mt-1 text-sm text-text-muted">Typical amounts. Long documents, big chats and web searches cost more.</p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border-light">
            <table className="w-full text-sm">
              <thead className="bg-bg-warm text-left text-xs text-text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Task</th>
                  <th className="px-4 py-2 text-right font-medium">About</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Per $1</th>
                </tr>
              </thead>
              <tbody>
                {wallet.estimates.map((e) => (
                  <tr key={e.task} className="border-t border-border-light">
                    <td className="px-4 py-2.5 text-text-main">
                      {e.task}
                      {e.note && <span className="block text-xs text-text-muted">{e.note}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-main">{formatUsd(usdToMicros(e.typicalUsd))}</td>
                    <td className="hidden px-4 py-2.5 text-right text-text-muted sm:table-cell">≈ {Math.floor(1 / e.typicalUsd).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-base font-semibold text-text-main">History</h2>
        {history === null ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-text-muted"><Loader2 size={14} className="animate-spin" /> Loading...</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 rounded-xl bg-bg-main p-4 text-sm text-text-muted">Nothing yet. Purchases and AI usage will show up here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-light overflow-hidden rounded-2xl border border-border-light">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 bg-bg-container px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-text-main" title={r.count > 1 ? "One task can take several AI calls (a quiz from several files makes one per file)." : undefined}>{r.label}{r.count > 1 && <span className="text-text-muted"> · {r.count} AI calls</span>}</p>
                  <p className="text-xs text-text-muted">{r.day}</p>
                </div>
                <span className={`shrink-0 font-medium ${r.amountMicros > 0 ? "text-alert-success" : "text-text-main"}`}>
                  {r.amountMicros > 0 ? "+" : "−"}{formatUsd(Math.abs(r.amountMicros))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-text-muted">
        Want unused credit back? Email <a href="mailto:contact@zonocsc.com" className="underline">contact@zonocsc.com</a> from your account&apos;s email.
        Refunds go to your original card, minus the card processor&apos;s fee. Details in the{" "}
        <Link href="/legal/credits" className="underline">Credits &amp; Refunds terms</Link>.
      </p>
    </div>
  );
}
