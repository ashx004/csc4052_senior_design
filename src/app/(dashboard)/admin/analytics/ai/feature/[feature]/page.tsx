import { AdminAccessDenied } from "@/src/components/analytics/AdminAccessDenied";
import { adminPageAccess } from "@/src/components/analytics/adminPageAccess";
import { AiFeatureDetailScreen } from "@/src/components/analytics/ai/AiFeatureDetail";
import { aiFeatureView, aiWindowDays } from "@/src/components/analytics/dashboardUtils";

export const dynamic = "force-dynamic";

export default async function AiFeaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ feature: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { feature } = await params;
  const accessError = await adminPageAccess(`/admin/analytics/ai/feature/${encodeURIComponent(feature)}`);
  if (accessError) {
    return <AdminAccessDenied error={accessError} unavailableTitle="AI performance unavailable" />;
  }

  const query = await searchParams;
  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <AiFeatureDetailScreen feature={feature} mode={aiFeatureView(query.view)} days={aiWindowDays(query.days)} />
      </div>
    </section>
  );
}
