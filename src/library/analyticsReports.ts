import "server-only";

import { auth as googleAuth } from "googleapis/build/src/apis/analyticsdata";
import { analyticsdata_v1beta } from "googleapis/build/src/apis/analyticsdata/v1beta";
import {
  type AnalyticsReport,
  type ReportRow,
  buildReportRequests,
  propertyToday,
  ReportError,
  validateDateRange,
} from "./analyticsReportContract";

const CACHE_LIFETIME_MS = 60 * 1000;
const MAX_CACHED_REPORTS = 100;
const REQUEST_TIMEOUT_MS = 15 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const READ_ONLY_ANALYTICS_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";

type GoogleReport = analyticsdata_v1beta.Schema$RunReportResponse;
type CachedReport = {
  expiresAt: number;
  report: AnalyticsReport;
};
const reportCache = new Map<string, CachedReport>();

function getReportingConfiguration() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const timeZone = process.env.GA4_PROPERTY_TIMEZONE;
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\\\n/g, "\\n");

  const hasValidPropertyId =
    typeof propertyId === "string" && /^\d+$/.test(propertyId);
  if (!hasValidPropertyId || !timeZone || !clientEmail || !privateKey) {
    throw new ReportError(
      503,
      "Analytics reporting is not configured. Follow docs/analytics.md to connect a GA4 property and reporting account.",
    );
  }

  return { propertyId, timeZone, clientEmail, privateKey };
}

function resolveDateRange(
  startDate: string,
  endDate: string,
  timeZone: string,
) {
  let today: string;
  try {
    today = propertyToday(timeZone);
  } catch {
    throw new ReportError(503, "The analytics reporting timezone is invalid.");
  }

  if (startDate === "7days" || startDate === "30days") {
    let numberOfDays = 7;
    if (startDate === "30days") {
      numberOfDays = 30;
    }
    const firstDayTimestamp =
      Date.parse(today) - (numberOfDays - 1) * MILLISECONDS_PER_DAY;
    startDate = new Date(firstDayTimestamp).toISOString().slice(0, 10);
    endDate = today;
  }

  return validateDateRange(startDate, endDate, today);
}

function readReportRows(report: GoogleReport): ReportRow[] {
  const result: ReportRow[] = [];
  if (!report.rows) {
    return result;
  }

  for (const row of report.rows) {
    let label = "(not set)";
    let count = 0;

    if (row.dimensionValues && row.dimensionValues.length > 0) {
      const dimension = row.dimensionValues[0];
      if (dimension.value !== undefined && dimension.value !== null) {
        label = dimension.value;
      }
    }
    if (row.metricValues && row.metricValues.length > 0) {
      const metric = row.metricValues[0];
      if (metric.value !== undefined && metric.value !== null) {
        count = Number(metric.value);
      }
    }

    result.push({ label, count });
  }
  return result;
}

function hasReportingLimits(report: GoogleReport): boolean {
  const metadata = report.metadata;
  if (metadata && metadata.subjectToThresholding) {
    return true;
  }
  if (
    metadata &&
    metadata.samplingMetadatas &&
    metadata.samplingMetadatas.length > 0
  ) {
    return true;
  }

  const availableRowCount = report.rowCount ?? 0;
  const returnedRowCount = report.rows?.length ?? 0;
  return availableRowCount > returnedRowCount;
}

function parseReports(
  reports: GoogleReport[] | undefined,
  startDate: string,
  endDate: string,
  timeZone: string,
): AnalyticsReport {
  if (!reports || reports.length !== 3) {
    throw new ReportError(
      502,
      "Analytics returned an incomplete report. Try again.",
    );
  }

  let resultsAreLimited = false;
  for (const report of reports) {
    const reportedTimeZone = report.metadata?.timeZone;
    if (reportedTimeZone && reportedTimeZone !== timeZone) {
      throw new ReportError(
        503,
        "Configured timezone differs from the GA4 property. Update GA4_PROPERTY_TIMEZONE.",
      );
    }
    if (hasReportingLimits(report)) {
      resultsAreLimited = true;
    }
  }

  const [pageViews, featureEvents, dailyActivity] = reports;
  return {
    startDate,
    endDate,
    timeZone,
    retrievedAt: new Date().toISOString(),
    pages: readReportRows(pageViews),
    events: readReportRows(featureEvents),
    daily: readReportRows(dailyActivity),
    limited: resultsAreLimited,
  };
}

function cacheReport(key: string, report: AnalyticsReport) {
  if (reportCache.size >= MAX_CACHED_REPORTS) {
    const oldestKey = reportCache.keys().next().value;
    if (oldestKey) {
      reportCache.delete(oldestKey);
    }
  }

  reportCache.set(key, {
    report,
    expiresAt: Date.now() + CACHE_LIFETIME_MS,
  });
}

function reportingError(error: unknown): ReportError {
  if (error instanceof ReportError) {
    return error;
  }

  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 401 || status === 403) {
    return new ReportError(
      503,
      "Reporting access is unavailable. Check the service account's GA4 Viewer permission and Data API configuration.",
    );
  }
  if (status === 429) {
    return new ReportError(
      429,
      "Analytics reporting quota reached. Please try again later.",
    );
  }
  return new ReportError(
    502,
    "Analytics reporting is temporarily unavailable. Please try again.",
  );
}

/** Call only after requireAdmin(); cached reports are still protected data. */
export async function getAnalyticsReport(
  requestedStart: string,
  requestedEnd: string,
): Promise<AnalyticsReport> {
  const { propertyId, timeZone, clientEmail, privateKey } =
    getReportingConfiguration();
  const { startDate, endDate } = resolveDateRange(
    requestedStart,
    requestedEnd,
    timeZone,
  );
  const cacheKey = `${propertyId}:${timeZone}:${startDate}:${endDate}`;

  const cached = reportCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.report;
  }

  const auth = new googleAuth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [READ_ONLY_ANALYTICS_SCOPE],
  });
  const api = new analyticsdata_v1beta.Analyticsdata({ auth });

  try {
    const response = await api.properties.batchRunReports(
      {
        property: `properties/${propertyId}`,
        requestBody: { requests: buildReportRequests(startDate, endDate) },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    const report = parseReports(
      response.data.reports,
      startDate,
      endDate,
      timeZone,
    );
    cacheReport(cacheKey, report);
    return report;
  } catch (error) {
    throw reportingError(error);
  }
}
