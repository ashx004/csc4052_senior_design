import "@/src/components/classes/ClassCard.css";
import Link from 'next/link';
import { EnrollmentStatus } from "@/src/library/enrollmentStatus";

// to hold props for class information for later user input
export interface ClassCardProps {
  classId?: string;
  className?: string;
  classCode?: string;
  term?: string;
  color?: string;
  variant?: "default" | "compact";
  status?: EnrollmentStatus;
}

export default function ClassCard({
  classId: classId,
  className: className,
  classCode: classCode,
  term,
  color = "#0a2a3c",
  variant = "default",
}: ClassCardProps) {

  const cardClassName = variant == "compact" ? "class-card class-card-compact" : "class-card";


  return (
    <div className={cardClassName}>
      {/* Banner */}
      <div className="class-card-banner" style={{ background: color }} />

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