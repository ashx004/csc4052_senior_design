"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./weakConceptModal.module.css";
import { resultHeadline, type ModalConcept, type ModalLayer } from "./weakConceptModalView";
import type { ConceptPracticeType } from "./weakConceptPractice";

// Paths from public/catalyst_minimal_assets/svg/outline/, drawn in currentColor
// so they stay visible on the dark button and in the dark theme.
const ICON_PATHS = {
  "arrow-left": <path d="M20 12H4m7-7-7 7 7 7" />,
  "arrow-right": <path d="M4 12h16m-7-7 7 7-7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5 5 19" />,
  "drag-drop": (
    <path d="M8 3h3v5H8a2.5 2.5 0 1 0 0 5h3v3H6a3 3 0 0 0-3 3v2h7v-3a2.5 2.5 0 1 1 5 0v3h6v-7h-3a2.5 2.5 0 1 1 0-5h3V3h-7v3a2.5 2.5 0 1 1-5 0V3Z" />
  ),
  file: <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM14 3v5h5M9 13h6M9 17h6" />,
  "fill-blank": (
    <>
      <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M8 3h5l4 4v3M13 3v4h4M8 12h4M8 16h3" />
      <path d="m15 17 4-4 2 2-4 4-3 1z" />
    </>
  ),
  flashcards: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M8 2h11a3 3 0 0 1 3 3v11M2 8v11a3 3 0 0 0 3 3h11" />
    </>
  ),
  focus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  insights: <path d="M4 20V13h4v7M10 20V8h4v12M16 20V4h4v16M3 20h18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  practice: <path d="m4 20 4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20ZM14 7l3 3M4 20l4.5-1" />,
  quiz: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="m9 9 1.5 1.5L13 8M9 15h6" />
    </>
  ),
  "word-problem": <path d="M9 18h6M10 22h4M8 14a7 7 0 1 1 8 0c-1.3 1-1.7 2-1.7 4h-4.6c0-2-.4-3-1.7-4Z" />,
} satisfies Record<string, ReactNode>;

type IconName = keyof typeof ICON_PATHS;

function Icon({ name, size, className }: { name: IconName; size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** The kit's 64×64 tiles: a rounded cream or lavender square around an outline icon. */
function Tile({ name, tone, className }: { name: IconName; tone: "cream" | "lavender"; className: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="17" fill={tone === "cream" ? "var(--wc-cream)" : "var(--wc-lavender)"} />
      <g
        transform="translate(16 16) scale(1.33333)"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICON_PATHS[name]}
      </g>
    </svg>
  );
}

const RING_RADIUS = 45;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ score, total }: { score: number; total: number }) {
  const fraction = total > 0 ? Math.min(1, Math.max(0, score / total)) : 0;
  const arc = fraction * RING_CIRCUMFERENCE;
  return (
    <div className={styles.ring}>
      <svg width="106" height="106" viewBox="0 0 106 106" role="img" aria-label={`${score} out of ${total} correct`}>
        <circle className={styles.ringTrack} cx="53" cy="53" r={RING_RADIUS} fill="none" strokeWidth="8" />
        {arc > 0 && (
          <circle
            className={styles.ringArc}
            cx="53"
            cy="53"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${RING_CIRCUMFERENCE}`}
            transform="rotate(-90 53 53)"
          />
        )}
        <text className={styles.ringText} x="53" y="61" textAnchor="middle">
          {score}/{total}
        </text>
      </svg>
      <div className={styles.ringCaption}>
        {score} correct · {Math.max(0, total - score)} incorrect
      </div>
    </div>
  );
}

const FORMATS: {
  type: "flashcards" | "quiz" | "practice";
  title: string;
  description: string;
  icon: IconName;
  tone: "cream" | "lavender";
}[] = [
  { type: "flashcards", title: "Flashcards", description: "Review key concepts with examples.", icon: "flashcards", tone: "lavender" },
  { type: "quiz", title: "Quiz", description: "Test your understanding with new questions.", icon: "quiz", tone: "cream" },
  { type: "practice", title: "Practice", description: "Step-by-step problems with explanations.", icon: "practice", tone: "lavender" },
];

type PracticeKindType = Extract<ConceptPracticeType, "fill_blank" | "word_problem" | "drag_drop">;

const PRACTICE_KINDS: {
  type: PracticeKindType;
  title: string;
  description: string;
  icon: IconName;
  tone: "cream" | "lavender";
  benefit: string;
}[] = [
  { type: "fill_blank", title: "Fill in the blank", description: "Type the missing term", icon: "fill-blank", tone: "cream", benefit: "Reinforces key steps" },
  { type: "word_problem", title: "Word problem", description: "Solve it in your own words", icon: "word-problem", tone: "cream", benefit: "Applies the idea to a real problem" },
  { type: "drag_drop", title: "Drag & drop", description: "Match the steps or expressions", icon: "drag-drop", tone: "lavender", benefit: "Shows how the pieces fit together" },
];

export type WeakConceptBusy =
  | { action: "start" | "plan"; type: ConceptPracticeType }
  | { action: "retry" }
  | null;

export interface WeakConceptModalProps {
  quizName: string;
  score: number;
  total: number;
  concepts: ModalConcept[];
  /** Some misses have no concept yet: naming is running or did not return. */
  namingPending: boolean;
  /** The naming request is still running. */
  namingInFlight: boolean;
  busy: WeakConceptBusy;
  error: string | null;
  canRetry: boolean;
  onClose: () => void;
  onStart: (type: ConceptPracticeType) => void;
  onPlan: (type: ConceptPracticeType) => void;
  onRetry: () => void;
}

export default function WeakConceptModal({
  quizName,
  score,
  total,
  concepts,
  namingPending,
  namingInFlight,
  busy,
  error,
  canRetry,
  onClose,
  onStart,
  onPlan,
  onRetry,
}: WeakConceptModalProps) {
  const [layer, setLayer] = useState<ModalLayer>("result");
  const [practiceKind, setPracticeKind] = useState<PracticeKindType>("fill_blank");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const headline = resultHeadline(score, total, concepts, namingPending);
  const working = busy !== null;
  const labels = concepts.map((concept) => concept.label);

  const closeButton = (
    <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
      <Icon name="close" size={21} />
    </button>
  );

  const backHeader = (to: ModalLayer) => (
    <div className={styles.top}>
      <button type="button" className={styles.back} onClick={() => setLayer(to)} disabled={working}>
        <Icon name="arrow-left" size={19} /> Back
      </button>
      {closeButton}
    </div>
  );

  const startLabel = (type: ConceptPracticeType, idle: ReactNode) =>
    busy?.action === "start" && busy.type === type ? "Generating…" : idle;
  const planLabel = (type: ConceptPracticeType) =>
    busy?.action === "plan" && busy.type === type ? "Adding…" : "Plan";

  let body: ReactNode;
  if (layer === "result") {
    body = (
      <>
        <div className={styles.top}>
          <span className={`${styles.pill} ${headline.tone === "clear" ? styles.pillClear : ""}`}>
            <span className={styles.dot} /> {headline.pillText}
          </span>
          {closeButton}
        </div>

        <div className={styles.head}>
          <div>
            <h2 className={styles.title} id="weak-concept-title">{quizName}</h2>
            <p className={styles.muted}>{headline.tone === "clear" ? "Nice work!" : "You're getting there!"}</p>
          </div>
          <ScoreRing score={score} total={total} />
        </div>

        <div className={styles.note}>
          <Icon name="insights" size={23} className={styles.noteIcon} />
          <p>{headline.noteText}</p>
        </div>

        {headline.tone === "weak" && (
          <>
            <h3 className={styles.section}>Concepts to focus on</h3>
            {concepts.length > 0 ? (
              <ul className={styles.rows}>
                {concepts.map((concept) => (
                  <li key={concept.conceptKey} className={styles.row}>
                    <Tile name="file" tone="cream" className={styles.rowTile} />
                    <p className={styles.rowLabel}>{concept.label}</p>
                    <span className={styles.count}>{concept.missCount} missed</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.pendingRow}>
                {namingInFlight ? "Finding the concepts behind your misses…" : "We couldn't name these concepts yet. They'll show up after your next attempt."}
              </p>
            )}
            {namingInFlight && concepts.length > 0 && (
              <p className={styles.pendingRow}>Still naming a few more…</p>
            )}

            <button
              type="button"
              className={styles.cta}
              onClick={() => setLayer("format")}
              disabled={concepts.length === 0 || working}
            >
              Practice these concepts now <Icon name="arrow-right" size={19} />
            </button>
            <button type="button" className={styles.ghost} onClick={onRetry} disabled={!canRetry || working}>
              <Icon name="clock" size={17} /> {busy?.action === "retry" ? "Adding…" : "Retry wrong answers"}
            </button>
            <button type="button" className={styles.ghost} onClick={onClose}>
              Maybe later
            </button>
          </>
        )}

        {headline.tone === "clear" && (
          <button type="button" className={styles.cta} onClick={onClose}>
            Done
          </button>
        )}
      </>
    );
  } else if (layer === "format") {
    body = (
      <>
        {backHeader("result")}
        <h2 className={`${styles.title} ${styles.layerTitle}`} id="weak-concept-title">How would you like to practice?</h2>
        <p className={`${styles.muted} ${styles.layerSubtitle}`}>Tap to start now, or add it to your plan.</p>

        <div className={styles.formats}>
          {FORMATS.map((format, index) => {
            const queueable = format.type !== "practice";
            return (
              <div key={format.type} className={`${styles.format} ${queueable ? styles.formatWithPlan : ""}`}>
                <button
                  type="button"
                  className={`${styles.formatMain} ${index === 0 ? styles.formatSelected : ""}`}
                  disabled={working}
                  onClick={() => (format.type === "practice" ? setLayer("practice_kind") : onStart(format.type))}
                >
                  <Tile name={format.icon} tone={format.tone} className={styles.formatTile} />
                  <span className={styles.formatBody}>
                    <span className={styles.formatTitle}>{format.type === "practice" ? format.title : startLabel(format.type, format.title)}</span>
                    <span className={styles.formatDescription}>{format.description}</span>
                  </span>
                </button>
                <Icon name="arrow-right" size={19} className={styles.formatArrow} />
                {format.type !== "practice" && (
                  <button
                    type="button"
                    className={styles.planButton}
                    disabled={working}
                    onClick={() => onPlan(format.type as ConceptPracticeType)}
                    aria-label={`Add ${format.title.toLowerCase()} to your plan`}
                  >
                    <Icon name="plus" size={13} /> {planLabel(format.type)}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className={`${styles.note} ${styles.noteFlush}`}>
          <Icon name="focus" size={23} className={styles.noteIcon} />
          <div>
            <p>We&rsquo;ll focus on these concepts:</p>
            <div className={styles.chips}>
              {labels.map((label) => (
                <span key={label} className={styles.chip}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  } else {
    const chosen = PRACTICE_KINDS.find((kind) => kind.type === practiceKind) ?? PRACTICE_KINDS[0];
    body = (
      <>
        {backHeader("format")}
        <h2 className={`${styles.title} ${styles.layerTitle}`} id="weak-concept-title">What type of practice?</h2>
        <p className={`${styles.muted} ${styles.layerSubtitle}`}>Choose the style that fits your goal.</p>

        <div className={styles.formats} role="radiogroup" aria-label="Practice type">
          {PRACTICE_KINDS.map((kind) => {
            const selected = kind.type === practiceKind;
            return (
              <label
                key={kind.type}
                className={`${styles.format} ${styles.formatMain} ${styles.radioRow} ${selected ? styles.formatSelected : ""}`}
              >
                <input
                  type="radio"
                  name="weak-concept-practice-kind"
                  className={styles.radioInput}
                  checked={selected}
                  onChange={() => setPracticeKind(kind.type)}
                  disabled={working}
                />
                <Tile name={kind.icon} tone={kind.tone} className={styles.formatTile} />
                <span className={styles.formatBody}>
                  <span className={styles.formatTitle}>{kind.title}</span>
                  <span className={styles.formatDescription}>{kind.description}</span>
                </span>
                <span className={`${styles.radio} ${selected ? styles.radioOn : ""}`} aria-hidden="true" />
              </label>
            );
          })}
        </div>

        <div className={`${styles.note} ${styles.noteBottom}`}>
          <Icon name="insights" size={23} className={styles.noteIcon} />
          <div>
            <p className={styles.noteHeading}>
              Good for {labels.length === 1 ? labels[0] : "these concepts"}
            </p>
            <ul className={styles.bullets}>
              <li>{chosen.benefit}</li>
              <li>Practice in different formats</li>
              <li>New questions generated from your weak concepts</li>
            </ul>
          </div>
        </div>

        <button type="button" className={styles.cta} onClick={() => onStart(practiceKind)} disabled={working}>
          {startLabel(practiceKind, "Start practice")} <Icon name="arrow-right" size={19} />
        </button>
        <button type="button" className={styles.ghost} onClick={() => onPlan(practiceKind)} disabled={working}>
          <Icon name="plus" size={16} /> {busy?.action === "plan" ? "Adding…" : "Add to plan instead"}
        </button>
      </>
    );
  }

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet} role="dialog" aria-modal="false" aria-labelledby="weak-concept-title">
        {body}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>
  );
}
