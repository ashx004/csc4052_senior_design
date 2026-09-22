"use client";

import { useEffect, useState } from "react";
import { useTutorial } from "@/src/context/TutorialContext";
import TutorialOverlay from "./TutorialOverlay";
import type { TutorialId, TutorialStep } from "@/src/library/tutorials/types";

// Give the page's own content/data a moment to render before measuring
// anything — most of these steps target elements that only exist once a
// Firestore fetch resolves.
const START_DELAY_MS = 500;

/** Drop this once on any page: `<PageTutorial id="classes" steps={classesSteps} />`.
 *  Shows the tour automatically the first time this user hits this page (or
 *  after a Settings replay), then marks it seen for good. Renders nothing
 *  once the tour isn't due. */
export default function PageTutorial({ id, steps }: { id: TutorialId; steps: TutorialStep[] }) {
  const { ready, hasSeen, markSeen, requestActive, release } = useTutorial();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready || hasSeen(id) || steps.length === 0) return;
    const timer = setTimeout(() => {
      if (requestActive(id)) setShow(true);
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
    // Intentionally only keyed on readiness/id — not on hasSeen/steps
    // identity — so finishing the tour (which flips hasSeen) doesn't
    // immediately re-run this effect and try to restart itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  if (!show) return null;

  function done() {
    setShow(false);
    release(id);
    markSeen(id);
  }

  return <TutorialOverlay steps={steps} onFinish={done} onSkip={done} />;
}
