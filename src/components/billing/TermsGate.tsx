"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { TERMS_VERSION } from "@/src/library/legalVersion";

// Pages a student must be able to read without agreeing first.
const EXEMPT = ["/legal/", "/login", "/signup", "/share/"];

/**
 * Asks a signed-in student to accept the current terms when they haven't yet:
 * accounts from before the terms existed, or after TERMS_VERSION changes.
 * New sign-ups accept on the sign-up page, so they never see this.
 */
export default function TermsGate() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [needed, setNeeded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNeeded(false);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        // No profile yet means sign-up is still writing it, with the terms included.
        if (!cancelled && snap.exists()) setNeeded(snap.data().termsVersion !== TERMS_VERSION);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || !needed || EXEMPT.some((p) => pathname.startsWith(p))) return null;

  async function accept() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", user.uid), { termsAcceptedAt: serverTimestamp(), termsVersion: TERMS_VERSION });
      setNeeded(false);
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="terms-gate-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-bg-container p-6 shadow-xl">
        <h3 id="terms-gate-title" className="text-base font-semibold text-text-main">Catalyst&apos;s AI now runs on paid credit</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-text-muted">
          <li>AI features (chat, quizzes, flashcards, OCR, advising) use prepaid credit, charged at what the AI actually costs. Nothing else in Catalyst costs anything.</li>
          <li>You choose if and when to add credit, from $5. There&apos;s no subscription.</li>
          <li>Your messages are processed by our AI providers, who may not train on them.</li>
        </ul>
        <label className="mt-4 flex items-start gap-2.5 text-sm text-text-main">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]" />
          <span>
            I&apos;m 13 or older (with a parent or guardian&apos;s permission if under 18), and I agree to the{" "}
            <Link href="/legal/terms" target="_blank" className="font-medium text-primary underline">Terms of Service</Link>,{" "}
            <Link href="/legal/privacy" target="_blank" className="font-medium text-primary underline">Privacy Policy</Link> and{" "}
            <Link href="/legal/credits" target="_blank" className="font-medium text-primary underline">Credits &amp; Refunds terms</Link>.
          </span>
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-alert-error">{error}</p>}
        <button
          type="button"
          onClick={() => void accept()}
          disabled={!agreed || busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-text-inverse hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          Continue
        </button>
        <p className="mt-3 text-center text-xs text-text-muted">Questions? contact@zonocsc.com</p>
      </div>
    </div>
  );
}
