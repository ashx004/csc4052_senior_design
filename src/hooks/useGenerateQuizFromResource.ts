"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useCourseInfo } from "@/src/hooks/useCourseInfo";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import { publishStudySet } from "@/src/library/discover/publishStudySet";
import type { StudySetVisibility } from "@/src/library/discover/types";
import { parseQuizDifficulty, type QuizDifficulty } from "@/src/library/quizDifficulty";

export interface QuizResourceContext {
  sourceDocKey: string;
  resourceId: string;
  name: string;
  url: string;
}

export interface QuizGenerationConfig {
  questionCount: number;
  questionTypes: {
    multipleChoice: boolean;
    trueFalse: boolean;
    matching: boolean;
  };
  difficulty: QuizDifficulty;
  visibility: StudySetVisibility;
}

export function useGenerateQuizFromResource(courseId: string) {
  const router = useRouter();
  const { user } = useAuth();
  const { courseCode } = useCourseInfo(courseId);
  const [resource, setResource] = useState<QuizResourceContext | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback((next: QuizResourceContext) => {
    setResource(next);
    setError(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const start = useCallback(
    async (config: QuizGenerationConfig) => {
      if (!user || !resource) return;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/generate-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docUrl: resource.url,
            docName: resource.name,
            questionCount: config.questionCount,
            questionTypes: config.questionTypes,
            difficulty: config.difficulty,
            modelKey: getEffectiveModelKey("quiz"),
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate quiz.");
        }

        const setsRef = collection(db, "users", user.uid, "enrollment", courseId, "quizSets");
        const newDoc = await addDoc(setsRef, {
          name: data.topicName,
          sourceDocKey: resource.sourceDocKey,
          questions: data.questions,
          questionTypes: config.questionTypes,
          difficulty: parseQuizDifficulty(data.difficulty),
          questionCount: data.questions.length,
          pinned: true,
          visibility: config.visibility,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (config.visibility === "public" && courseCode) {
          try {
            const publicSetId = await publishStudySet({
              type: "quiz",
              setData: { name: data.topicName, questions: data.questions },
              courseCode,
              ownerUid: user.uid,
              originalPath: `users/${user.uid}/enrollment/${courseId}/quizSets/${newDoc.id}`,
            });
            await updateDoc(doc(db, "users", user.uid, "enrollment", courseId, "quizSets", newDoc.id), {
              publicSetId,
            });
          } catch (publishError) {
            console.error("Error publishing quiz set to Discover:", publishError);
          }
        }

        setOpen(false);
        setResource(null);
        router.push(`/courses/${courseId}/quizzes/${newDoc.id}?mode=take`);
      } catch (err) {
        console.error("Error generating quiz:", err);
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [user, resource, courseId, courseCode, router],
  );

  return {
    open,
    documentName: resource?.name ?? "",
    loading,
    error,
    begin,
    close,
    start,
  };
}
