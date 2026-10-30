import { getReportingPropertyId } from "@/src/library/analyticsReportingConfig";
import AnalyticsDashboard from "@/src/components/analytics/AnalyticsDashboard";
import { AdminAccessDenied } from "@/src/components/analytics/AdminAccessDenied";
import { adminPageAccess } from "@/src/components/analytics/adminPageAccess";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const accessError = await adminPageAccess("/admin/analytics");
  if (accessError) {
    return <AdminAccessDenied error={accessError} unavailableTitle="Analytics unavailable" />;
  }

  let analyticsUrl: string | undefined;
  try {
    const propertyId = getReportingPropertyId();
    analyticsUrl = `https://analytics.google.com/analytics/web/#/p${propertyId}/reports/intelligenthome`;
  } catch {
    analyticsUrl = undefined;
  }
  return <AnalyticsDashboard analyticsUrl={analyticsUrl} />;
}
