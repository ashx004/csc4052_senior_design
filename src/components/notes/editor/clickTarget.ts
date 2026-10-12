// Where the cursor goes when the student clicks on the page but not on the text:
// the side margins, the space above the first line, or the blank page below the
// last. Instead of a fixed spot, the click is moved onto the nearest text and
// ProseMirror places the cursor there:
//   left / right of a line  -> start / end of that line
//   above all the text      -> the very start (left of the first line)
//   below all the text      -> the very end (right of the last line)
// Pure, so it is unit-tested; the editor feeds the result to view.posAtCoords.

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Point {
  left: number;
  top: number;
}

/** How far inside the text box to aim, so the point lands on text and not on its edge. */
const INSET = 1;

export function nearestTextPoint(click: { x: number; y: number }, text: Box): Point {
  const innerLeft = text.left + INSET;
  const innerRight = Math.max(innerLeft, text.right - INSET);
  const innerTop = text.top + INSET;
  const innerBottom = Math.max(innerTop, text.bottom - INSET);

  if (click.y < text.top) return { left: innerLeft, top: innerTop };
  if (click.y > text.bottom) return { left: innerRight, top: innerBottom };
  return { left: Math.min(innerRight, Math.max(innerLeft, click.x)), top: click.y };
}
