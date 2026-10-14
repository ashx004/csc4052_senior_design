import { Suspense } from "react";
import LearningWorkspace from "@/src/components/learning/LearningWorkspace";

export default function LearningPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-beige-canvas" />}>
      <LearningWorkspace surface="home" />
    </Suspense>
  );
}
