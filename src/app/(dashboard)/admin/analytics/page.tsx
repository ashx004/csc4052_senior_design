import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AnalyticsDashboard from "@/src/components/analytics/AnalyticsDashboard";
import { AdminAccessError, requireAdmin } from "@/src/library/adminAuth";
import { SESSION_COOKIE } from "@/src/library/requestAuthToken";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  let accessError: AdminAccessError | undefined;

  try {
    const cookieStore = await cookies();
    await requireAdmin({ cookie: cookieStore.get(SESSION_COOKIE)?.value });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      accessError = error;
    } else {
      accessError = new AdminAccessError(
        503,
        "Administrator verification is unavailable.",
      );
    }
  }

  // Next.js redirects throw internally, so keep this outside the try/catch.
  if (accessError?.status === 401) {
    redirect("/login?redirect=/admin/analytics");
  }

  if (accessError) {
    let title = "Analytics unavailable";
    if (accessError.status === 403) {
      title = "Access denied";
    }
    return (
      <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-xl rounded-2xl border border-border-light bg-bg-container p-6 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              {accessError.message}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return <AnalyticsDashboard />;
}
