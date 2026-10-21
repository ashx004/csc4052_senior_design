import type { ReactNode } from "react";

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className="rounded-xl border border-border-light bg-bg-warm px-4 py-3 text-sm leading-relaxed text-text-main"
    >
      {children}
    </p>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail: string;
}) {
  return (
    <div className="min-w-0 p-5 sm:p-6">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {value === null ? "—" : value.toLocaleString()}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">{detail}</p>
    </div>
  );
}
