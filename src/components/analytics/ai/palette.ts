// Colours for the admin AI pages. The global tokens stay as they are; two of them fail here:
// --color-text-muted is ~3.3:1 on white (below AA for small text), and the peach and sage
// accents vanish on a white card at bar size.

/** Small grey label text: text-muted pulled toward text-main, so it darkens on light themes and lightens on dark ones (light theme: #605b52, 6.7:1 on white). */
export const labelText =
  "text-[color:color-mix(in_srgb,var(--color-text-muted)_45%,var(--color-text-main))]";

/** Bar and slice colours, each at least 3:1 on white and on the dark card. */
export const PEACH_STRONG = "#c97c4c";
export const SAGE_STRONG = "#759868";
export const PURPLE = "#6b5bd2";
export const TAN = "#b08957";
export const LAVENDER_STRONG = "#8f84d9";
export const NEUTRAL_SLICE = "#9d937f";
export const SKY_STRONG = "#5b8fc7";
export const BROWN_STRONG = "#8a6539";
export const RED_STRONG = "#a3302a";

/** Donut order: the four costliest features, then "All others". */
export const DONUT_COLORS = [PURPLE, TAN, PEACH_STRONG, LAVENDER_STRONG, NEUTRAL_SLICE] as const;

/** The ring drawn when there is no cost at all. Decorative, so no contrast floor. */
export const EMPTY_RING = "#e5dfd4";
