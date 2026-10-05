import { CalendarClock } from "lucide-react";

interface ClassScheduleDetailsProps {
  scheduleLabel?: string;
  onEdit?: () => void;
}

export default function ClassScheduleDetails({ scheduleLabel, onEdit }: ClassScheduleDetailsProps) {
  if (!scheduleLabel) {
    if (!onEdit) return null;

    return (
      <div className="mt-5 border-t border-border-light pt-4">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-primary transition hover:bg-bg-warm hover:text-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Add class time
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-light pt-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <CalendarClock size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Class time</p>
          <p className="mt-0.5 break-words text-sm font-medium text-text-main">{scheduleLabel}</p>
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-primary transition hover:bg-bg-warm hover:text-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Edit
        </button>
      )}
    </div>
  );
}
