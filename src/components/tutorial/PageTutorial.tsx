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
  const { ready, hasSeen, markSeen, optedOut, optOutOfAll, requestActive, release } = useTutorial();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready || optedOut || hasSeen(id) || steps.length === 0) return;
    const timer = setTimeout(() => {
      if (requestActive(id)) setShow(true);
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
    // Intentionally only keyed on readiness/id/optedOut — not on
    // hasSeen/steps identity — so finishing the tour (which flips hasSeen)
    // doesn't immediately re-run this effect and try to restart itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, optedOut, id]);

  if (!show) return null;

  // Finishing the last step and skipping both end this one tour the same
  // way (never show THIS id again) - `skipAll` additionally sets the
  // global opt-out, so no other page's tour fires again either, including
  // ones added after this user made the choice. Same handler for both:
  // the "don't show me tutorials again" checkbox means the same thing
  // whether the student actually finished the tour or skipped partway
  // through.
  function handleExit(skipAll: boolean) {
    setShow(false);
    release(id);
    markSeen(id);
    if (skipAll) optOutOfAll();
  }

  return <TutorialOverlay steps={steps} onFinish={handleExit} onSkip={handleExit} />;
}
