"use client";

interface FocusModeCardProps {
  recommendedMinutes: number;
  onStartSession: () => void;
  disabled?: boolean;
}

export default function FocusModeCard({
  recommendedMinutes,
  onStartSession,
  disabled = false,
}: FocusModeCardProps) {
  const timer = `${recommendedMinutes}:00`;

  return (
    <section className="rounded-2xl bg-navy p-6 text-white">
      <h3 className="text-lg font-semibold text-white">Focus mode</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">
        When you start a task, Catalyst keeps the session focused. Pause when you
        need a break, then return to the same task.
      </p>

      <p className="mt-6 text-5xl font-bold tabular-nums tracking-tight text-white">
        {timer}
      </p>
      <p className="mt-1 text-sm text-white/60">recommended session</p>

      <button
        type="button"
        onClick={onStartSession}
        disabled={disabled}
        className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-semibold text-navy transition-colors hover:bg-beige-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-navy/60"
      >
        Start focus session
      </button>
    </section>
  );
}
