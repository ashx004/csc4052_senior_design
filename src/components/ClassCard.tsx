import "@/src/styles/ClassCard.css";

// to hold props
interface ClassCardProps {
  courseName?: string;
  courseCode?: string;
  term?: string;
  color?: string;
  href?: string;
}

export default function ClassCard({
  courseName = "Introduction to Psychology",
  courseCode = "PSYC 101",
  term = "Spring 2026",
  color = "#0a2a3c",
  href = "#",
}: ClassCardProps) {

  return (
    <div className="class-card">
      {/* Banner */}
      <div className="class-card-banner" style={{ background: color }} />

      {/* Body */}
      <div className="class-card-body">
        <a href={href} className="class-card-title" style={{ color }}>
          {courseName}
        </a>
        <p className="class-card-code">{courseCode}</p>
        <p className="class-card-term">{term}</p>
      </div>

      {/* Nav row */}
      <div className="class-card-nav">
        {["Home", "Announcements", "Assignments", "Grades"].map((label) => (
          <a key={label} href="#">
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}