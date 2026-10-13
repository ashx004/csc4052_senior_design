"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Monitor, X } from "lucide-react";

type Device = { id: string; label: string; createdAt: number | null; lastSeenAt: number | null; current: boolean };

const formatWhen = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Unknown";

/**
 * Browsers that skip the emailed sign-in code. Removing one means the next
 * sign-in on it asks for a code again.
 */
export default function SignInDevicesModal({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/devices", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Couldn't load your devices.");
      setDevices(data.devices as Device[]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your devices.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function remove(target: string) {
    setBusyId(target);
    setError("");
    try {
      const query = target === "all" ? "all=1" : `id=${encodeURIComponent(target)}`;
      const response = await fetch(`/api/auth/devices?${query}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Couldn't remove that device.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that device.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign-in devices"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-bg-container p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-main">Sign-in devices</h3>
            <p className="mt-1 text-sm text-text-muted">
              You only get an emailed code when you sign in somewhere new. These browsers are remembered and skip it. Remove any you don&apos;t recognize or no longer use.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-text-muted hover:bg-bg-warm">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4">
          {devices === null && !error && (
            <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={14} className="animate-spin" /> Loading...</p>
          )}
          {devices?.length === 0 && (
            <p className="rounded-lg bg-bg-main p-3 text-sm text-text-muted">No remembered devices. You&apos;ll get a code the next time you sign in with your password.</p>
          )}
          {devices && devices.length > 0 && (
            <ul className="space-y-2">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center gap-3 rounded-lg border border-border-light bg-bg-main px-3 py-2.5">
                  <Monitor size={18} className="shrink-0 text-text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-main">
                      {device.label}
                      {device.current && <span className="ml-2 rounded bg-bg-warm px-1.5 py-0.5 text-[10px] font-medium text-primary">This device</span>}
                    </p>
                    <p className="text-xs text-text-muted">Last used {formatWhen(device.lastSeenAt)}</p>
                    <p className="text-xs text-text-muted">First signed in {formatWhen(device.createdAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(device.id)}
                    disabled={busyId !== null}
                    className="shrink-0 rounded-md border border-border-light px-2.5 py-1 text-xs font-medium text-text-main hover:bg-bg-warm disabled:opacity-50"
                  >
                    {busyId === device.id ? "Removing..." : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-alert-error">{error}</p>}
        </div>

        {devices && devices.length > 1 && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void remove("all")}
              disabled={busyId !== null}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-alert-error hover:bg-alert-error-bg disabled:opacity-50"
            >
              {busyId === "all" ? "Removing..." : "Remove all devices"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
