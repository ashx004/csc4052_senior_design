import Link from "next/link";
import { AdminAccessDenied } from "@/src/components/analytics/AdminAccessDenied";
import { adminPageAccess } from "@/src/components/analytics/adminPageAccess";
import { AiOverviewScreen } from "@/src/components/analytics/ai/AiOverview";
import { aiWindowDays } from "@/src/components/analytics/dashboardUtils";

export const dynamic = "force-dynamic";

const PRESETS = [1, 7, 14, 30];

export default async function AiPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessError = await adminPageAccess("/admin/analytics/ai");
  if (accessError) {
    return <AdminAccessDenied error={accessError} unavailableTitle="AI performance unavailable" />;
  }

  const days = aiWindowDays((await searchParams).days);
  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Administration
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              AI performance
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Complete days only, up to last night. Days counted in UTC.
            </p>
          </div>
          <nav
            aria-label="Time window"
            className="flex gap-1 rounded-xl border border-border-light bg-bg-container p-1"
          >
            {PRESETS.map((preset) => (
              <Link
                key={preset}
                href={`/admin/analytics/ai?days=${preset}`}
                aria-current={preset === days ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${preset === days ? "bg-primary text-text-inverse" : "text-text-main hover:bg-bg-warm"}`}
              >
                {preset}d
              </Link>
            ))}
          </nav>
        </header>
        <AiOverviewScreen days={days} />
      </div>
    </section>
  );
}
