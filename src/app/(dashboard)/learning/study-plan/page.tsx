import { Suspense } from "react";
import LearningWorkspace from "@/src/components/learning/LearningWorkspace";

export default function LearningStudyPlanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-beige-canvas" />}>
      <LearningWorkspace surface="study-plan" />
    </Suspense>
  );
}
