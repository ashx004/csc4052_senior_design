"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { useStudyNotifications } from "@/src/hooks/useStudyNotifications";

// Advising notifications (written server-side when a background upload or
// schedule job finishes) stay up until the student closes them or clicks
// through - the job may finish while they're looking at something else, so a
// 5-second popup is easy to miss. Study-plan notifications keep auto-hiding.
const isAdvising = (type: string) => type.startsWith("advising_");

export default function NotificationToast() {
  const { user } = useAuth();
  const router = useRouter();
  const { notifications, dismissNotification } = useStudyNotifications(
    user?.uid ?? null
  );
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const newest = notifications.find(
    (n) =>
      (n.status === "created" || n.status === "delivered") &&
      !dismissed.has(n.id)
  );

  useEffect(() => {
    if (newest && newest.id !== visibleId) {
      setVisibleId(newest.id);
      if (isAdvising(newest.type)) return;
      const timer = setTimeout(() => {
        setVisibleId(null);
        setDismissed((prev) => new Set(prev).add(newest.id));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newest?.id]);

  if (!visibleId) return null;

  const active = notifications.find((n) => n.id === visibleId);
  if (!active) return null;

  const handleDismiss = () => {
    setVisibleId(null);
    setDismissed((prev) => new Set(prev).add(active.id));
    dismissNotification(active.id);
  };

  const handleAction = () => {
    handleDismiss();
    if (active.actionUrl) router.push(active.actionUrl);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-lg animate-in slide-in-from-bottom-2"
    >
      <div className="flex-1">
        <p className="font-semibold">{active.title}</p>
        <p className="mt-0.5 text-white/70">{active.body}</p>
        {isAdvising(active.type) && active.actionUrl && (
          <button
            onClick={handleAction}
            className="mt-2 rounded-md bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
          >
            {active.actionLabel ?? "View"}
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        className="mt-0.5 text-white/50 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}
