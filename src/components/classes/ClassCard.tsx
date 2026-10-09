"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { EnrollmentStatus } from "@/src/library/enrollmentStatus";
import { DEFAULT_CLASS_COLOR } from "@/src/library/classColors";
import ClassColorPicker from "@/src/components/classes/ClassColorPicker";
import ClassScheduleDetails from "@/src/components/classes/ClassScheduleDetails";

export interface ClassCardProps {
  classId?: string;
  className?: string;
  classCode?: string;
  term?: string;
  color?: string;
  variant?: "default" | "compact";
  status?: EnrollmentStatus;
  scheduleLabel?: string;
  onColorChange?: (color: string) => void;
  onScheduleEdit?: () => void;
}

export default function ClassCard({
  classId,
  className,
  classCode,
  term,
  color = DEFAULT_CLASS_COLOR,
  variant = "default",
  onColorChange,
  onScheduleEdit,
  scheduleLabel,
}: ClassCardProps) {
  const courseName = className || "Untitled class";
  const courseCode = classCode || "Course";
  const courseHref = `/courses/${classId}`;

  if (variant === "compact") {
    return (
      <article className="group relative flex w-64 items-center gap-3 rounded-xl border border-border-light bg-bg-container p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-border-hover hover:shadow-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: color }}>
          <BookOpen size={19} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={courseHref} className="block truncate text-sm font-semibold text-text-main hover:text-primary focus:outline-none focus:underline">
            {courseName}
          </Link>
          <p className="mt-1 truncate text-xs font-medium text-text-muted">{courseCode}</p>
          {term && <p className="mt-0.5 truncate text-xs text-text-muted">{term}</p>}
        </div>
        {onColorChange && <ClassColorPicker color={color} onChange={onColorChange} />}
      </article>
    );
  }

  return (
    <article className="group relative flex min-h-[232px] w-full flex-col rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-border-hover hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: color }}>
            <BookOpen size={21} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-main">{courseCode}</p>
            {term && <p className="mt-0.5 text-xs text-text-muted">{term}</p>}
          </div>
        </div>
        {onColorChange && <ClassColorPicker color={color} onChange={onColorChange} />}
      </div>

      <Link href={courseHref} className="mt-5 line-clamp-2 text-lg font-semibold leading-snug text-text-main transition hover:text-primary focus:outline-none focus:underline">
        {courseName}
      </Link>

      <div className="mt-auto">
        <ClassScheduleDetails scheduleLabel={scheduleLabel} onEdit={onScheduleEdit} />
      </div>
    </article>
  );
}
