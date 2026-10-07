import { eventNames } from "./analyticsContract";

export type ReportRow = {
  label: string;
  count: number;
};

export type AnalyticsReport = {
  startDate: string;
  endDate: string;
  timeZone: string;
  retrievedAt: string;
  pages: ReportRow[];
  events: ReportRow[];
  daily: ReportRow[];
  limited: boolean;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;

export class ReportError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  if (!Number.isFinite(Date.parse(value))) {
    return false;
  }

  const dateAfterParsing = new Date(value).toISOString().slice(0, 10);
  return dateAfterParsing === value;
}

export function validateDateRange(start: string, end: string, today: string) {
  if (!isValidDate(start) || !isValidDate(end)) {
    throw new ReportError(400, "Enter valid start and end dates.");
  }

  const daysBetween =
    (Date.parse(end) - Date.parse(start)) / MILLISECONDS_PER_DAY;
  const isReversed = daysBetween < 0;
  const numberOfDaysIncludingStartAndEnd = daysBetween + 1;
  const isTooLong = numberOfDaysIncludingStartAndEnd > MAX_REPORT_DAYS;
  const endsInFuture = end > today;

  if (isReversed || isTooLong || endsInFuture) {
    throw new ReportError(
      400,
      "Choose up to 366 days, ending no later than today in the reporting timezone.",
    );
  }
  return { startDate: start, endDate: end };
}

export function propertyToday(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function buildReportRequests(startDate: string, endDate: string) {
  const commonFields = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "eventCount" }],
    limit: "1000",
  };
  const approvedEventsFilter = {
    filter: {
      fieldName: "eventName",
      inListFilter: { values: eventNames },
    },
  };

  const pageViewsReport = {
    ...commonFields,
    dimensions: [{ name: "pageTitle" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT" as const, value: "page_view" },
      },
    },
  };
  const featureEventsReport = {
    ...commonFields,
    dimensions: [{ name: "eventName" }],
    dimensionFilter: approvedEventsFilter,
  };
  const dailyActivityReport = {
    ...commonFields,
    dimensions: [{ name: "date" }],
    dimensionFilter: approvedEventsFilter,
    orderBys: [{ dimension: { dimensionName: "date" } }],
  };

  return [pageViewsReport, featureEventsReport, dailyActivityReport];
}
