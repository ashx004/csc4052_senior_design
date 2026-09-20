"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { X } from "lucide-react";
import type { ActivityType } from "@/src/library/studyPlan/types";

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (task: {
    title: string;
    courseId: string;
    courseName: string;
    courseCode: string;
    activityType: ActivityType;
    estimatedMinutes: number;
  }) => void;
}

export default function AddTaskModal({
  open,
  onClose,
  onAdd,
}: AddTaskModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("quiz");
  const [duration, setDuration] = useState(20);
  const [courses, setCourses] = useState<
    { id: string; className: string; classCode: string }[]
  >([]);

  useEffect(() => {
    if (!user || !open) return;
    getDocs(collection(db, "users", user.uid, "enrollment")).then((snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        className: d.data().className ?? "",
        classCode: d.data().classCode ?? "",
      }));
      setCourses(list);
      if (list.length > 0 && !courseId) setCourseId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open]);

  if (!open) return null;

  const selectedCourse = courses.find((c) => c.id === courseId);

  const handleSubmit = () => {
    if (!title.trim() || !courseId || !selectedCourse) return;
    onAdd({
      title: title.trim(),
      courseId,
      courseName: selectedCourse.className,
      courseCode: selectedCourse.classCode,
      activityType,
      estimatedMinutes: duration,
    });
    setTitle("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-2xl bg-bg-container p-6 shadow-xl ring-1 ring-border-light">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-text-muted hover:text-text-main"
        >
          <X size={20} />
        </button>

        <h3 className="text-lg font-semibold text-text-main">Add a task</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-text-main">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Review Chapter 5"
              className="mt-1 w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-text-main">Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} ({c.classCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-text-main">Type</label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as ActivityType)}
              className="mt-1 w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
            >
              <option value="quiz">Quiz</option>
              <option value="flashcards">Flashcards</option>
              <option value="reading">Reading</option>
              <option value="ai_explanation">AI Explanation</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-text-main">
              Duration (minutes)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={5}
              max={120}
              className="mt-1 w-full rounded-lg border border-border-light bg-bg-main px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:text-text-main"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !courseId}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}
