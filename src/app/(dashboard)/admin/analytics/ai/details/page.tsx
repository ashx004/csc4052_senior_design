import { AdminAccessDenied } from "@/src/components/analytics/AdminAccessDenied";
import { adminPageAccess } from "@/src/components/analytics/adminPageAccess";
import { AiDetailsScreen } from "@/src/components/analytics/ai/AiDetails";
import { aiWindowDays } from "@/src/components/analytics/dashboardUtils";

export const dynamic = "force-dynamic";

export default async function AiDetailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const accessError = await adminPageAccess("/admin/analytics/ai/details");
  if (accessError) {
    return <AdminAccessDenied error={accessError} unavailableTitle="AI performance unavailable" />;
  }

  const days = aiWindowDays((await searchParams).days);
  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <h1 className="sr-only">AI performance: detailed analysis</h1>
        <AiDetailsScreen days={days} />
      </div>
    </section>
  );
}
