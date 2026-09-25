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
    targetId: string | null;
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
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([]);
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

  useEffect(() => {
    if (!user || !courseId || !open || (activityType !== "quiz" && activityType !== "flashcards")) {
      setTargets([]);
      setTargetId(null);
      return;
    }

    const collectionName = activityType === "quiz" ? "quizSets" : "flashcardSets";
    getDocs(collection(db, "users", user.uid, "enrollment", courseId, collectionName)).then((snap) => {
      const nextTargets = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name ?? d.data().topicName ?? d.id,
      }));
      setTargets(nextTargets);
      setTargetId(nextTargets[0]?.id ?? null);
    });
  }, [user, courseId, activityType, open]);

  if (!open) return null;

  const selectedCourse = courses.find((c) => c.id === courseId);

  const handleSubmit = () => {
    if (!title.trim() || !courseId || !selectedCourse) return;
    if ((activityType === "quiz" || activityType === "flashcards") && !targetId) return;
    onAdd({
      title: title.trim(),
      courseId,
      courseName: selectedCourse.className,
      courseCode: selectedCourse.classCode,
      activityType,
      targetId: activityType === "reading" || activityType === "ai_explanation" ? null : targetId,
      estimatedMinutes: duration,
    });
    setTitle("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/35 p-4">
      <div className="relative w-full max-w-[500px] rounded-[20px] bg-beige-light p-6 shadow-[0_18px_50px_rgba(26,26,48,.08)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-secondary hover:bg-gray-input hover:text-navy"
          aria-label="Close add task dialog"
        >
          <X size={20} />
        </button>

        <h3 className="text-xl font-bold tracking-[-0.04em] text-navy">New study task</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-secondary">Task name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Review Chapter 5"
              className="mt-1 w-full rounded-[10px] border-0 bg-gray-input px-3 py-3 text-sm text-navy outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-secondary">Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="mt-1 w-full rounded-[10px] border-0 bg-gray-input px-3 py-3 text-sm text-navy outline-none"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} ({c.classCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-secondary">Activity</label>
            <select
              value={activityType}
              onChange={(e) => {
                setActivityType(e.target.value as ActivityType);
                setTargetId(null);
              }}
              className="mt-1 w-full rounded-[10px] border-0 bg-gray-input px-3 py-3 text-sm text-navy outline-none"
            >
              <option value="quiz">Quiz</option>
              <option value="flashcards">Flashcards</option>
              <option value="reading">Reading</option>
              <option value="ai_explanation">AI Explanation</option>
            </select>
          </div>

          {(activityType === "quiz" || activityType === "flashcards") && (
            <div>
              <label className="text-xs font-bold text-gray-secondary">
                {activityType === "quiz" ? "Quiz set" : "Flashcard set"}
              </label>
              {targets.length > 0 ? (
                <select
                  value={targetId ?? ""}
                  onChange={(e) => setTargetId(e.target.value || null)}
                  className="mt-1 w-full rounded-[10px] border-0 bg-gray-input px-3 py-3 text-sm text-navy outline-none"
                >
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-xs text-gray-secondary">
                  No {activityType === "quiz" ? "quiz" : "flashcard"} sets are available for this course. Choose Reading or AI Explanation.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-secondary">
              Duration (minutes)
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={5}
              max={120}
              className="mt-1 w-full rounded-[10px] border-0 bg-gray-input px-3 py-3 text-sm text-navy outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-[10px] border border-brown-label px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-beige-canvas"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !title.trim() ||
              !courseId ||
              ((activityType === "quiz" || activityType === "flashcards") && !targetId)
            }
            className="rounded-[10px] bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-50"
          >
            Add to plan
          </button>
        </div>
      </div>
    </div>
  );
}
