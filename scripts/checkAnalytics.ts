import "./loadEnvironment";

async function main() {
  const { getReportingConfiguration } =
    await import("../src/library/analyticsReportingConfig");
  const { getAnalyticsReport } =
    await import("../src/library/analyticsReports");
  const configuration = getReportingConfiguration();
  const report = await getAnalyticsReport("7days", "");
  console.log(
    `GA4 reporting connected to property ${configuration.propertyId}.`,
  );
  console.log(`Reporting timezone: ${report.timeZone}.`);
  console.log(
    `Received ${report.events.length} event categories for the last 7 days.`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Analytics configuration check failed.";
  console.error(message);
  process.exitCode = 1;
});
