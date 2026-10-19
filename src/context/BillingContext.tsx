"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/src/context/AuthContext";
import AddCreditModal from "@/src/components/billing/AddCreditModal";

// The student's AI credit, everywhere in the app.
//
// Every AI route answers 402 with an X-Catalyst-Billing header when the
// balance can't cover a task (creditGate.ts). Rather than teach dozens of
// fetch() call sites about that, this provider watches responses once, at
// window.fetch, and opens the add-credit window itself. The call site still
// gets its normal error, so whatever it shows ("You're out of AI credit...")
// stays correct. It also refreshes the balance shortly after any AI request.

export type TopUp = { usd: number; creditMicros: number; fits: boolean };
export type Wallet = {
  enforced: boolean;
  balanceMicros: number;
  heldMicros: number;
  minToStartMicros: number;
  capMicros: number;
  minTopUpMicros: number;
  topUps: TopUp[];
  estimates: { task: string; typicalUsd: number; note?: string }[];
};

type BillingContextType = {
  wallet: Wallet | null;
  refresh: () => Promise<void>;
  /** Opens the add-credit window; `outOfCredit` explains a task was just refused. */
  openAddCredit: (options?: { outOfCredit?: boolean }) => void;
};

const BillingContext = createContext<BillingContextType>({ wallet: null, refresh: async () => {}, openAddCredit: () => {} });

const OUT_OF_CREDIT_EVENT = "catalyst:out-of-credit";
const AI_USED_EVENT = "catalyst:ai-used";

// Installed once per page load, however often the provider re-renders.
function installFetchWatcher() {
  const w = window as typeof window & { __catalystFetchWatched?: boolean };
  if (w.__catalystFetchWatched) return;
  w.__catalystFetchWatched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.href);
      if (path.origin === window.location.origin && path.pathname.startsWith("/api/") && !path.pathname.startsWith("/api/billing/")) {
        if (response.status === 402 && response.headers.get("X-Catalyst-Billing") === "insufficient-credit") {
          window.dispatchEvent(new Event(OUT_OF_CREDIT_EVENT));
        } else if ((init?.method ?? "GET").toUpperCase() !== "GET") {
          window.dispatchEvent(new Event(AI_USED_EVENT));
        }
      }
    } catch {
      // Watching must never break the request itself.
    }
    return response;
  };
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [modal, setModal] = useState<{ outOfCredit: boolean } | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return setWallet(null);
    try {
      const response = await fetch("/api/billing/wallet", { cache: "no-store" });
      if (response.ok) setWallet((await response.json()) as Wallet);
    } catch {
      // Keep showing the last known balance.
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    installFetchWatcher();
    const onOut = () => {
      setModal({ outOfCredit: true });
      void refresh();
    };
    // Charges settle a moment after a reply finishes; a streamed chat can run
    // for a while, so check twice.
    const onUsed = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refresh();
        refreshTimer.current = setTimeout(() => void refresh(), 15_000);
      }, 3_000);
    };
    const onFocus = () => void refresh();
    window.addEventListener(OUT_OF_CREDIT_EVENT, onOut);
    window.addEventListener(AI_USED_EVENT, onUsed);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(OUT_OF_CREDIT_EVENT, onOut);
      window.removeEventListener(AI_USED_EVENT, onUsed);
      window.removeEventListener("focus", onFocus);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  const openAddCredit = useCallback((options?: { outOfCredit?: boolean }) => setModal({ outOfCredit: Boolean(options?.outOfCredit) }), []);

  return (
    <BillingContext.Provider value={{ wallet, refresh, openAddCredit }}>
      {children}
      {modal && user && <AddCreditModal wallet={wallet} outOfCredit={modal.outOfCredit} onClose={() => setModal(null)} />}
    </BillingContext.Provider>
  );
}

export const useBilling = () => useContext(BillingContext);
