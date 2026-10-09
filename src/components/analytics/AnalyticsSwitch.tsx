"use client";

export default function AnalyticsSwitch({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Share usage analytics"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 ${enabled ? "bg-primary" : "bg-border-light"}`}
    >
      <span
        className={`absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}
