// The equation builder's palettes and the text editing behind its buttons. An
// equation is stored as LaTeX (see MathExtension); the builder just writes that
// LaTeX for the student. Templates mark the spots to fill in with \square, which
// KaTeX draws as an empty box in the live preview. Pure, so it is unit-tested.

export const PLACEHOLDER = "\\square";

export interface PaletteItem {
  /** Tooltip and accessible name. */
  label: string;
  latex: string;
  /**
   * Text to select after inserting, for templates whose blank is ordinary text
   * rather than a \square box (KaTeX can't draw a math box inside \text{}).
   */
  select?: string;
}

export interface PaletteGroup {
  id: string;
  title: string;
  items: PaletteItem[];
}

const sym = (label: string, latex: string, select?: string): PaletteItem => ({ label, latex, ...(select ? { select } : {}) });

export const PALETTE: PaletteGroup[] = [
  {
    id: "basic",
    title: "Basic",
    items: [
      sym("Fraction", "\\frac{\\square}{\\square}"),
      sym("Power", "\\square^{\\square}"),
      sym("Subscript", "\\square_{\\square}"),
      sym("Subscript and power", "\\square_{\\square}^{\\square}"),
      sym("Square root", "\\sqrt{\\square}"),
      sym("Nth root", "\\sqrt[\\square]{\\square}"),
      sym("Parentheses", "\\left(\\square\\right)"),
      sym("Brackets", "\\left[\\square\\right]"),
      sym("Braces", "\\left\\{\\square\\right\\}"),
      sym("Absolute value", "\\left|\\square\\right|"),
      sym("Binomial", "\\binom{\\square}{\\square}"),
      sym("Overline", "\\overline{\\square}"),
      sym("Vector", "\\vec{\\square}"),
      sym("Hat", "\\hat{\\square}"),
      sym("Text", "\\text{words}", "words"),
    ],
  },
  {
    id: "calculus",
    title: "Calculus",
    items: [
      sym("Sum", "\\sum_{i=1}^{n} \\square"),
      sym("Product", "\\prod_{i=1}^{n} \\square"),
      sym("Integral", "\\int_{a}^{b} \\square \\, dx"),
      sym("Double integral", "\\iint_{D} \\square \\, dA"),
      sym("Limit", "\\lim_{x \\to \\square} \\square"),
      sym("Derivative", "\\frac{d}{dx} \\square"),
      sym("Partial derivative", "\\frac{\\partial \\square}{\\partial x}"),
      sym("Infinity", "\\infty"),
      sym("Nabla", "\\nabla"),
      sym("Delta", "\\Delta"),
    ],
  },
  {
    id: "symbols",
    title: "Symbols",
    items: [
      sym("Plus or minus", "\\pm"),
      sym("Times", "\\times"),
      sym("Divide", "\\div"),
      sym("Dot", "\\cdot"),
      sym("Not equal", "\\neq"),
      sym("Approximately", "\\approx"),
      sym("Equivalent", "\\equiv"),
      sym("Less or equal", "\\leq"),
      sym("Greater or equal", "\\geq"),
      sym("Much less", "\\ll"),
      sym("Much greater", "\\gg"),
      sym("Proportional", "\\propto"),
      sym("Right arrow", "\\rightarrow"),
      sym("Left arrow", "\\leftarrow"),
      sym("Implies", "\\Rightarrow"),
      sym("If and only if", "\\Leftrightarrow"),
      sym("Element of", "\\in"),
      sym("Not an element of", "\\notin"),
      sym("Subset", "\\subset"),
      sym("Subset or equal", "\\subseteq"),
      sym("Union", "\\cup"),
      sym("Intersection", "\\cap"),
      sym("Empty set", "\\emptyset"),
      sym("For all", "\\forall"),
      sym("There exists", "\\exists"),
      sym("Not", "\\neg"),
      sym("And", "\\land"),
      sym("Or", "\\lor"),
      sym("Real numbers", "\\mathbb{R}"),
      sym("Integers", "\\mathbb{Z}"),
      sym("Natural numbers", "\\mathbb{N}"),
      sym("Rational numbers", "\\mathbb{Q}"),
      sym("Degrees", "^{\\circ}"),
      sym("Ellipsis", "\\ldots"),
    ],
  },
  {
    id: "greek",
    title: "Greek",
    items: [
      ...["alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu", "nu", "pi", "rho", "sigma", "tau", "phi", "chi", "psi", "omega"].map((name) =>
        sym(name, `\\${name}`)
      ),
      ...["Gamma", "Delta", "Theta", "Lambda", "Pi", "Sigma", "Phi", "Psi", "Omega"].map((name) => sym(name, `\\${name}`)),
    ],
  },
  {
    id: "functions",
    title: "Functions",
    items: [
      ...["sin", "cos", "tan", "arcsin", "arccos", "arctan", "log", "ln", "exp", "min", "max", "det"].map((name) => sym(name, `\\${name}\\left(\\square\\right)`)),
      sym("Matrix 2 by 2", "\\begin{bmatrix} \\square & \\square \\\\ \\square & \\square \\end{bmatrix}"),
      sym("Matrix 3 by 3", "\\begin{bmatrix} \\square & \\square & \\square \\\\ \\square & \\square & \\square \\\\ \\square & \\square & \\square \\end{bmatrix}"),
      sym("Cases", "\\begin{cases} \\square & \\text{if } \\square \\\\ \\square & \\text{otherwise} \\end{cases}"),
    ],
  },
];

export interface Edit {
  text: string;
  /** The selection afterwards (start === end is a caret). */
  start: number;
  end: number;
}

/** The first empty box at or after `from`, wrapping to the start; null when there is none. */
export function nextPlaceholder(text: string, from: number): { start: number; end: number } | null {
  let at = text.indexOf(PLACEHOLDER, Math.max(0, from));
  if (at < 0) at = text.indexOf(PLACEHOLDER);
  return at < 0 ? null : { start: at, end: at + PLACEHOLDER.length };
}

/**
 * Puts a template or symbol into the text where the cursor is. Selected text
 * goes into the template's first box (so selecting "x" and clicking Fraction
 * gives x over an empty box). Afterwards the first empty box is selected, ready
 * to be typed over, or the caret sits after what was added if there are none.
 */
export function insertSnippet(text: string, selStart: number, selEnd: number, snippet: string, select?: string): Edit {
  const start = Math.max(0, Math.min(selStart, selEnd, text.length));
  const end = Math.max(start, Math.min(Math.max(selStart, selEnd), text.length));
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  let after = text.slice(end);

  let piece = snippet;
  if (selected && piece.includes(PLACEHOLDER)) piece = piece.replace(PLACEHOLDER, selected);
  else if (selected && !piece.includes(PLACEHOLDER)) piece = snippet; // a plain symbol replaces the selection

  // "\alpha" directly followed by a letter would read as one unknown command.
  if (/\\[A-Za-z]+$/.test(piece) && /^[A-Za-z]/.test(after)) after = ` ${after}`;
  // And a command name just before the new piece, if it starts with a letter.
  const joined = before + piece + after;

  const box = nextPlaceholder(joined, before.length);
  if (box && box.start < before.length + piece.length) return { text: joined, start: box.start, end: box.end };
  // Text templates: select the sample word so typing replaces it.
  const word = select ? piece.indexOf(select) : -1;
  if (select && word >= 0 && !selected) return { text: joined, start: before.length + word, end: before.length + word + select.length };
  const caret = before.length + piece.length;
  return { text: joined, start: caret, end: caret };
}
