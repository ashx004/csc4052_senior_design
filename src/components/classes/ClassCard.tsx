"use client";

import "@/src/components/classes/ClassCard.css";
import { useState } from "react";
import Link from 'next/link';
import { Pencil } from "lucide-react";
import { EnrollmentStatus } from "@/src/library/enrollmentStatus";
import { CLASS_COLOR_PALETTE } from "@/src/library/classColors";

// to hold props for class information for later user input
export interface ClassCardProps {
  classId?: string;
  className?: string;
  classCode?: string;
  term?: string;
  color?: string;
  variant?: "default" | "compact";
  status?: EnrollmentStatus;
  // Omitted by callers that don't want the color square editable (e.g. a
  // read-only preview) — when present, a pencil icon appears on the banner.
  onColorChange?: (color: string) => void;
}

export default function ClassCard({
  classId: classId,
  className: className,
  classCode: classCode,
  term,
  color = "#0a2a3c",
  variant = "default",
  onColorChange,
}: ClassCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const cardClassName = variant == "compact" ? "class-card class-card-compact" : "class-card";

  return (
    <div className={cardClassName}>
      {/* Banner */}
      <div className="class-card-banner" style={{ background: color }}>
        {onColorChange && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPickerOpen((open) => !open);
              }}
              className="class-card-color-edit"
              aria-label="Change class color"
            >
              <Pencil size={12} />
            </button>

            {pickerOpen && (
              <>
                {/* Closes the popup on any outside click, without needing a
                    click-outside library. */}
                <div
                  className="class-card-color-overlay"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPickerOpen(false);
                  }}
                />
                <div
                  className="class-card-color-popup"
                  onClick={(e) => e.stopPropagation()}
                >
                  {CLASS_COLOR_PALETTE.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className="class-card-color-swatch"
                      style={{ background: swatch }}
                      aria-label={`Set class color to ${swatch}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onColorChange(swatch);
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Body */}
      <div className="class-card-body">
        <Link
          href={`/courses/${classId}`}
          className="class-card-title">
          {className}
        </Link>
        <p className="class-card-code">{classCode}</p>
        <p className="class-card-term">{term}</p>
      </div>

      {/* Nav row
      <div className="class-card-nav">
        {["Home", "Announcements", "Assignments", "Grades"].map((label) => (
          <a key={label} href="#">
            {label}
          </a>
        ))}
      </div> */}
    </div>
  );
}
