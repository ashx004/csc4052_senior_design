import type {
  HealthReport,
  ServiceState,
} from "@/src/library/monitoring/types";
import { serviceNames } from "@/src/library/monitoring/types";
import { Notice } from "./dashboardShared";
import { displayTime, panelClass } from "./dashboardUtils";

const statusLabels: Record<ServiceState, string> = {
  healthy: "Operational",
  degraded: "Degraded",
  down: "Unavailable",
  unconfigured: "Not configured",
};
const statusColors: Record<ServiceState, string> = {
  healthy: "bg-alert-success-bg text-alert-success",
  degraded: "bg-bg-warm text-primary",
  down: "bg-alert-error-bg text-alert-error",
  unconfigured: "bg-bg-warm text-text-muted",
};

export function HealthSummary({ report }: { report: HealthReport }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-text-muted">
        Service status
      </span>
      {report.services.map((service) => (
        <span
          key={service.id}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${statusColors[service.status]}`}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          {serviceNames[service.id]} · {statusLabels[service.status]}
        </span>
      ))}
    </div>
  );
}

function interruptionDuration(
  start: string,
  end: string | null,
  checkedAt: string,
) {
  const seconds = Math.max(
    0,
    Math.round((Date.parse(end ?? checkedAt) - Date.parse(start)) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function AnalyticsHealth({ report }: { report: HealthReport }) {
  const workerRecent =
    report.workerLastSeen &&
    Date.parse(report.checkedAt) - Date.parse(report.workerLastSeen) < 180_000;
  return (
    <div className="space-y-6">
      {!workerRecent && (
        <Notice>
          Background monitoring has no recent heartbeat. Start the monitoring
          worker on the host to record peaks and interruptions while this page
          is closed.
        </Notice>
      )}
      {!report.historyAvailable && (
        <Notice error>
          Live checks are shown, but incident history could not be read or
          saved. Missing history does not mean there were no interruptions.
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {report.services.map((service) => (
          <section className={panelClass} key={service.id}>
            <h2 className="font-medium">{serviceNames[service.id]}</h2>
            <span
              className={`mt-4 inline-block rounded-full px-3 py-1 text-xs ${statusColors[service.status]}`}
            >
              {statusLabels[service.status]}
            </span>
            <p className="mt-4 text-xs leading-relaxed text-text-muted">
              {service.message}
            </p>
            <p className="mt-4 text-xs text-text-muted">
              {service.latencyMs.toLocaleString()} ms ·{" "}
              {displayTime(service.checkedAt)}
            </p>
          </section>
        ))}
      </div>
      <section className={panelClass}>
        <h2 className="font-semibold">Service interruptions</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-muted">
          Latest 100 records. Outage durations run from the first failing probe
          to the first healthy probe; gaps in monitoring are not measured
          downtime. Request warnings are sampled at most once per service and
          type per minute.
        </p>
        {report.historyAvailable && report.incidents.length === 0 && (
          <p className="py-8 text-sm text-text-muted">
            No interruptions have been recorded yet.
          </p>
        )}
        {report.incidents.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-light text-xs text-text-muted">
                  {[
                    "Service / event",
                    "First observed",
                    "Duration",
                    "State",
                  ].map((name) => (
                    <th className="p-3 font-medium" key={name}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.incidents.map((incident) => (
                  <tr
                    key={incident.id}
                    className="border-b border-border-light last:border-0"
                  >
                    <td className="p-3">
                      <p className="font-medium">
                        {serviceNames[incident.service]} ·{" "}
                        {incident.kind.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 max-w-md text-xs text-text-muted">
                        {incident.message}
                      </p>
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs">
                      {displayTime(incident.startedAt)}
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs">
                      {incident.kind === "outage"
                        ? interruptionDuration(
                            incident.startedAt,
                            incident.resolvedAt,
                            report.checkedAt,
                          )
                        : "Single observation"}
                    </td>
                    <td className="p-3 text-xs">
                      {incident.kind !== "outage"
                        ? "Recorded"
                        : incident.resolvedAt
                          ? "Recovered"
                          : "Open"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-text-muted">
        Checks refresh every minute while visible. Last checked{" "}
        {displayTime(report.checkedAt)}.{" "}
        {report.workerLastSeen &&
          `Worker last seen ${displayTime(report.workerLastSeen)}.`}
      </p>
    </div>
  );
}
