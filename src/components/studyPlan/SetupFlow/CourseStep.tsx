"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { Sparkles, Loader2 } from "lucide-react";

interface CourseOption {
  id: string;
  classCode: string;
  className: string;
}

interface CourseStepProps {
  selected: string | null | undefined;
  onSelect: (courseId: string | null) => void;
}

export default function CourseStep({ selected, onSelect }: CourseStepProps) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDocs(collection(db, "users", user.uid, "enrollment")).then((snap) => {
      setCourses(
        snap.docs.map((d) => ({
          id: d.id,
          classCode: d.data().classCode ?? "",
          className: d.data().className ?? "",
        }))
      );
      setLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-text-main">
        Which course?
      </h3>
      <p className="mb-4 text-sm text-text-muted">
        Focus on one course or let Catalyst choose.
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => onSelect(null)}
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
            selected === null
              ? "border-primary bg-primary/10 text-primary"
              : "border-border-light text-text-main hover:border-primary/50"
          }`}
        >
          <Sparkles size={16} />
          Let Catalyst choose
        </button>
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
              selected === c.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border-light text-text-main hover:border-primary/50"
            }`}
          >
            <span>{c.className}</span>
            <span className="ml-2 text-text-muted">{c.classCode}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
