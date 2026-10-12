"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useCourseInfo } from "@/src/hooks/useCourseInfo";
import { getEffectiveModelKey } from "@/src/library/chatMode";
import { publishStudySet } from "@/src/library/discover/publishStudySet";
import type { StudySetVisibility } from "@/src/library/discover/types";
import type { SourceAudit } from "@/src/library/generation/orchestrator";
import { persistStudySet } from "@/src/library/studySets/persistStudySet";
import { liveDeps } from "@/src/library/studySets/persistDepsLive";
import { completeSourceKeys, type PayloadNote, type RequestSource } from "@/src/library/studySets/buildSourcesPayload";
import type { SourceOption } from "@/src/library/studySets/sourceOptions";
import { parseQuizDifficulty, type QuizDifficulty } from "@/src/library/quizDifficulty";

type PublishArgs = Parameters<typeof publishStudySet>[0];
type QuizSetQuestions = Extract<PublishArgs, { type: "quiz" }>["setData"]["questions"];

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

  // Shared persist + publish + navigate tail for both entry points.
  const finish = useCallback(
    async (
      uid: string,
      data: { topicName: string; questions: QuizSetQuestions; difficulty?: unknown; sourceKeys?: unknown },
      fallbackKeys: string[],
      config: QuizGenerationConfig,
      navigate = true,
    ) => {
      const sourceKeys: string[] =
        Array.isArray(data.sourceKeys) && data.sourceKeys.length > 0 ? (data.sourceKeys as string[]) : fallbackKeys;
      const { setId } = await persistStudySet(liveDeps(db, uid, courseId), {
        kind: "quiz",
        sourceKeys,
        name: data.topicName,
        items: data.questions,
        visibility: config.visibility,
        questionTypes: config.questionTypes,
        difficulty: parseQuizDifficulty(data.difficulty),
      });

      if (config.visibility === "public" && courseCode) {
        try {
          const publicSetId = await publishStudySet({
            type: "quiz",
            setData: { name: data.topicName, questions: data.questions },
            courseCode,
            ownerUid: uid,
            originalPath: `users/${uid}/enrollment/${courseId}/quizSets/${setId}`,
          });
          await updateDoc(doc(db, "users", uid, "enrollment", courseId, "quizSets", setId), {
            publicSetId,
          });
        } catch (publishError) {
          console.error("Error publishing quiz set to Discover:", publishError);
        }
      }

      setOpen(false);
      setResource(null);
      if (navigate) router.push(`/courses/${courseId}/quizzes/${setId}?mode=take`);
      return setId;
    },
    [courseId, courseCode, router],
  );

  const generate = useCallback(
    async (target: QuizResourceContext, config: QuizGenerationConfig) => {
      if (!user) return;
      setResource(target);
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/generate-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: [
              {
                title: target.name,
                url: target.url,
                fileType: target.url.split(".").pop() || "pdf",
                resourceId: target.resourceId,
              },
            ],
            courseId,
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

        await finish(user.uid, data, [target.sourceDocKey], config);
      } catch (err) {
        console.error("Error generating quiz:", err);
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [user, courseId, finish],
  );

  const generateFromSources = useCallback(
    async (
      sources: RequestSource[],
      selected: SourceOption[],
      config: QuizGenerationConfig,
      notes: PayloadNote[] = [],
    ): Promise<{ setId: string; audit: SourceAudit[]; skipped: Array<{ title: string; reason: string }>; route: string } | null> => {
      if (!user) return null;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/generate-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources,
            courseId,
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

        // Storage keys from the server, plus note: keys for typed notes (and
        // resource: keys if the server gave none), so the saved set's key
        // matches what the flashcard path writes.
        const sourceKeys = completeSourceKeys(Array.isArray(data.sourceKeys) ? data.sourceKeys : [], selected, notes);
        const setId = await finish(user.uid, { ...data, sourceKeys }, sourceKeys, config, false);
        const audit: SourceAudit[] = Array.isArray(data.audit) ? data.audit : [];
        const skipped = Array.isArray(data.skipped) ? data.skipped : [];
        return { setId, audit, skipped, route: `/courses/${courseId}/quizzes/${setId}?mode=take` };
      } catch (err) {
        console.error("Error generating quiz:", err);
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user, courseId, finish],
  );

  const start = useCallback(
    async (config: QuizGenerationConfig) => {
      if (!resource) return;
      await generate(resource, config);
    },
    [resource, generate],
  );

  return {
    open,
    documentName: resource?.name ?? "",
    loading,
    error,
    begin,
    close,
    start,
    generate,
    generateFromSources,
  };
}
