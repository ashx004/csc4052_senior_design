import type { AdminAccessError } from "@/src/library/adminAuth";

/** What an admin page shows instead of itself when access is refused or cannot be checked. */
export function AdminAccessDenied({
  error,
  unavailableTitle,
}: {
  error: AdminAccessError;
  /** The heading when access could not be checked, e.g. "Analytics unavailable". */
  unavailableTitle: string;
}) {
  let title = unavailableTitle;
  if (error.status === 403) {
    title = "Access denied";
  }
  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-xl rounded-2xl border border-border-light bg-bg-container p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            {error.message}
          </p>
        </div>
      </div>
    </section>
  );
}
