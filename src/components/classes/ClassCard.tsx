import "@/src/components/classes/ClassCard.css";
import Link from 'next/link';

// to hold props for class information for later user input
export interface ClassCardProps {
  classId?: string;
  className?: string;
  classCode?: string;
  term?: string;
  color?: string;
}

export default function ClassCard({
  classId: classId,
  className: className,
  classCode: classCode,
  term,
  color = "#0a2a3c",
}: ClassCardProps) {


  return (
    <div className="class-card">
      {/* Banner */}
      <div className="class-card-banner" style={{ background: color }} />

      {/* Body */}
      <div className="class-card-body">
        <Link href={`/classes/${classId}`} className="class-card-title" style={{ color }}>
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