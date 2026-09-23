"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { TutorialStep } from "@/src/library/tutorials/types";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Padding around the highlighted element's own box, and how long/how often
// to poll for a target that hasn't rendered yet (async data, conditional
// empty states) before giving up and skipping the step.
const SPOTLIGHT_PADDING = 8;
const TARGET_WAIT_MS = 2000;
const TARGET_POLL_MS = 120;
const CARD_WIDTH = 320;
const CARD_MARGIN = 16;

function measure(selector: string | undefined): SpotlightRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - SPOTLIGHT_PADDING,
    left: r.left - SPOTLIGHT_PADDING,
    width: r.width + SPOTLIGHT_PADDING * 2,
    height: r.height + SPOTLIGHT_PADDING * 2,
  };
}

export default function TutorialOverlay({
  steps,
  onFinish,
  onSkip,
}: {
  steps: TutorialStep[];
  /** true when the "don't show me tutorials again" checkbox was checked -
   *  the checkbox applies no matter how the tour ends, not just via Skip,
   *  so checking it and then clicking through to "Done" on the last step
   *  still honors the choice instead of silently dropping it. */
  onFinish: (skipAll: boolean) => void;
  /** Same skipAll meaning as onFinish - false for a plain skip of just this
   *  one tour (including the corner X, which is always a plain skip). */
  onSkip: (skipAll: boolean) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [visible, setVisible] = useState(false);
  const [skipAllChecked, setSkipAllChecked] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(160);
  const prefersReducedMotion = useRef(false);

  const step = steps[stepIndex];

  useEffect(() => {
    setMounted(true);
    prefersReducedMotion.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function goNext() {
    setStepIndex((i) => {
      const next = i + 1;
      if (next >= steps.length) {
        onFinish(skipAllChecked);
        return i;
      }
      return next;
    });
  }

  // Locate (and keep tracking) the current step's target. Some targets live
  // behind async data loads or conditional rendering — this polls briefly
  // rather than giving up on the first miss, and auto-advances if the
  // element genuinely never shows up for this user's data, instead of
  // leaving a dark screen pointing at nothing.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    let elapsed = 0;
    setVisible(false);

    function tick() {
      if (cancelled) return;
      const found = measure(step.target);
      if (found || !step.target) {
        setRect(found);
        setVisible(true);
        return;
      }
      elapsed += TARGET_POLL_MS;
      if (elapsed >= TARGET_WAIT_MS) {
        goNext();
        return;
      }
      window.setTimeout(tick, TARGET_POLL_MS);
    }
    tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => {
    if (!step?.target) return;
    const reposition = () => setRect(measure(step.target));
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.getBoundingClientRect().height);
  }, [stepIndex, rect]);

  if (!mounted || !step) return null;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let cardTop: number;
  let cardLeft: number;

  if (!rect) {
    cardTop = viewportH / 2 - cardHeight / 2;
    cardLeft = viewportW / 2 - CARD_WIDTH / 2;
  } else {
    const spaceBelow = viewportH - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const fitsBelow = spaceBelow > cardHeight + CARD_MARGIN * 2;
    const fitsAbove = spaceAbove > cardHeight + CARD_MARGIN * 2;
    const placeBelow = step.placement === "top" ? !fitsAbove : fitsBelow || !fitsAbove;

    cardTop = placeBelow ? rect.top + rect.height + CARD_MARGIN : rect.top - cardHeight - CARD_MARGIN;
    cardTop = Math.min(Math.max(cardTop, CARD_MARGIN), viewportH - cardHeight - CARD_MARGIN);

    cardLeft = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    cardLeft = Math.min(Math.max(cardLeft, CARD_MARGIN), viewportW - CARD_WIDTH - CARD_MARGIN);
  }

  const spotlightAnimate = rect
    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, opacity: 1 }
    : { top: viewportH / 2, left: viewportW / 2, width: 0, height: 0, opacity: 1 };

  const transition = prefersReducedMotion.current
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[1000]"
      role="dialog"
      aria-modal="true"
      aria-label="App tour"
      initial={prefersReducedMotion.current ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReducedMotion.current ? 0 : 0.2 }}
    >
      {/* Spotlight cutout: a box-shadow spread large enough to cover the
          whole viewport except this element's own rect creates the "dark
          everywhere but here" effect from a single animatable element. A
          soft pulse on the ring (skipped under reduced-motion) draws the
          eye to the highlighted element without being distracting once
          you're actually reading the card next to it. */}
      <motion.div
        className="pointer-events-none fixed rounded-xl ring-2 ring-primary/90"
        style={{ boxShadow: "0 0 0 9999px rgba(15, 15, 20, 0.7)" }}
        initial={false}
        animate={
          prefersReducedMotion.current
            ? spotlightAnimate
            : { ...spotlightAnimate, boxShadow: ["0 0 0 9999px rgba(15,15,20,0.7)", "0 0 0 9999px rgba(15,15,20,0.72)", "0 0 0 9999px rgba(15,15,20,0.7)"] }
        }
        transition={
          prefersReducedMotion.current
            ? transition
            : { ...transition, boxShadow: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } }
        }
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={stepIndex}
          ref={cardRef}
          initial={prefersReducedMotion.current ? false : { opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: visible ? 1 : 0, y: 0, scale: 1, top: cardTop, left: cardLeft }}
          exit={prefersReducedMotion.current ? undefined : { opacity: 0, y: -10, scale: 0.98 }}
          transition={transition}
          style={{ width: CARD_WIDTH }}
          className="fixed max-w-[calc(100vw-2rem)] rounded-xl border border-border-light bg-bg-container p-5 shadow-xl"
        >
          <button
            type="button"
            onClick={() => onSkip(false)}
            aria-label="Skip tutorial"
            className="absolute right-3 top-3 text-text-muted transition hover:text-text-main"
          >
            <X size={16} />
          </button>

          <p className="pr-6 text-xs font-medium uppercase tracking-wide text-primary">
            Step {stepIndex + 1} of {steps.length}
          </p>
          <h3 className="mt-1 text-base font-semibold text-text-main">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === stepIndex ? "bg-primary" : "bg-border-light"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-bg-warm"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => onSkip(skipAllChecked)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-bg-warm"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={goNext}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover"
              >
                {stepIndex === steps.length - 1 ? "Done" : "Next"}
              </button>
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-border-light pt-3 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={skipAllChecked}
              onChange={(e) => setSkipAllChecked(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border-light accent-primary"
            />
            Don&apos;t show me tutorials again
          </label>
        </motion.div>
      </AnimatePresence>
    </motion.div>,
    document.body
  );
}
