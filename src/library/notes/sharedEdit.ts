import { noteToPlainText } from "./noteText";

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };
type Doc = { type: "doc"; content: Node[] };

const paragraph = (line: string): Node => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] });
const blockText = (node: Node) => noteToPlainText({ type: "doc", content: [node] }).trim();

export function plainTextDocument(plainText: string): Doc {
  const lines = plainText.split("\n");
  return { type: "doc", content: lines.map(paragraph) };
}

/** A block whose text a shared editor can retype without losing what makes it
 *  that block (a heading stays a heading). */
const retypeable = (node: Node) => node.type === "paragraph" || node.type === "heading";

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
const isFlatList = (node: Node) =>
  LIST_TYPES.has(node.type ?? "") &&
  !!node.content?.length &&
  node.content.every((item) => item.content?.length === 1 && item.content[0].type === "paragraph");

const BLANK_RUN = /\n(?:[ \t]*\n)+/;
const BLANK_RUNS = new RegExp(BLANK_RUN.source, "g");
const GUARD = /\n\u0001(\d+)\u0001\n/g;

/** Code and math blocks hold their text verbatim, blank lines and indentation
 *  included, so an edit to one stays that block. */
function rewrittenVerbatim(old: Node, chunk: string): Node | null {
  if (old.type === "codeBlock") return { ...old, content: chunk ? [{ type: "text", text: chunk }] : [] };
  if (old.type === "mathBlock") return { ...old, attrs: { ...old.attrs, latex: chunk } };
  return null;
}

function rewritten(old: Node | null, chunk: string): Node[] {
  const verbatim = old && rewrittenVerbatim(old, chunk);
  if (verbatim) return [verbatim];
  const lines = chunk.trim().split("\n").map((line) => line.trimEnd());
  if (old && isFlatList(old)) {
    const items = old.content!;
    const content = lines.map((line, k) => {
      const item = items[k] ?? items[items.length - 1];
      const attrs = k < items.length || !item.attrs ? item.attrs : { ...item.attrs, checked: false };
      return { ...item, ...(attrs ? { attrs } : {}), content: [paragraph(line)] };
    });
    return [{ ...old, content }];
  }
  if (old && retypeable(old) && lines.length === 1) {
    return [{ ...old, content: [{ type: "text", text: lines[0] }] }];
  }
  return lines.map(paragraph);
}

/**
 * A visitor with edit access changes the note's plain text. Rebuilding the
 * document from that text alone would flatten every heading, list, formula and
 * picture, so blocks whose text is unchanged keep their original formatting,
 * an edited paragraph or heading keeps its type, and blocks with no text
 * (pictures, rules) stay where they were.
 */
export function mergeSharedEdit(oldDoc: unknown, plainText: string): Doc {
  const text = plainText.replace(/\r\n?/g, "\n");
  const root = oldDoc as Node | null;
  const oldBlocks = Array.isArray(root?.content) ? root!.content! : [];

  // Text blocks are what the visitor sees; empty blocks ride along after the
  // text block that precedes them.
  const units: { node: Node; text: string; trailing: Node[] }[] = [];
  const leading: Node[] = [];
  for (const node of oldBlocks) {
    const nodeText = blockText(node);
    if (nodeText) units.push({ node, text: nodeText, trailing: [] });
    else (units.length ? units[units.length - 1].trailing : leading).push(node);
  }
  if (!units.length && !leading.length) return plainTextDocument(text);

  // A block that itself holds blank lines (code, a quote of several
  // paragraphs) would be cut apart by the blank-line split below, so while
  // its text is still intact in the edit, hide the blank lines inside it.
  const seps: string[] = [];
  let guarded = text;
  let from = 0;
  for (const unit of units) {
    if (!BLANK_RUN.test(unit.text)) continue;
    let at = guarded.indexOf(unit.text, from);
    while (at >= 0 && !((at === 0 || guarded[at - 1] === "\n") && (guarded[at + unit.text.length] ?? "\n") === "\n")) {
      at = guarded.indexOf(unit.text, at + 1);
    }
    if (at < 0) continue;
    const hidden = unit.text.replace(BLANK_RUNS, (run) => `\n\u0001${seps.push(run) - 1}\u0001\n`);
    guarded = guarded.slice(0, at) + hidden + guarded.slice(at + unit.text.length);
    from = at + hidden.length;
  }
  const unguard = (value: string) => value.replace(GUARD, (_, i) => seps[Number(i)]);

  // `raw` keeps indentation and the blank lines that followed it (`sep`).
  const parts: { raw: string; sep: string }[] = [];
  let last = 0;
  for (const run of guarded.matchAll(BLANK_RUNS)) {
    parts.push({ raw: unguard(guarded.slice(last, run.index)), sep: run[0] });
    last = run.index + run[0].length;
  }
  parts.push({ raw: unguard(guarded.slice(last)), sep: "" });
  const kept = parts.map((p) => ({ ...p, raw: p.raw.replace(/^\n+/, "").replace(/\s+$/, "") })).filter((p) => p.raw.trim());
  const chunks = kept.map((p) => p.raw.trim());
  const rawOf = (k: number, take = 1) =>
    kept
      .slice(k, k + take)
      .map((p, idx, all) => (idx < all.length - 1 ? p.raw + (p.sep || "\n\n") : p.raw))
      .join("");

  // Longest common subsequence of unchanged blocks.
  const n = units.length;
  const m = chunks.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = units[i].text === chunks[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (units[i].text === chunks[j]) anchors.push([i++, j++]);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  anchors.push([n, m]);

  const content: Node[] = [...leading];
  let i = 0;
  let j = 0;
  for (const [ai, aj] of anchors) {
    // Between two unchanged blocks: pair up what was edited, add or drop the rest.
    const oldGap = units.slice(i, ai);
    // An edited code block that holds blank lines arrives as several chunks:
    // it takes as many as it had pieces before.
    let next = j;
    for (let k = 0; k < oldGap.length || next < aj; k++) {
      const unit = oldGap[k];
      const verbatim = !!unit && (unit.node.type === "codeBlock" || unit.node.type === "mathBlock");
      const pieces = verbatim ? unit.text.split(BLANK_RUN).length : 1;
      const take = Math.max(1, Math.min(pieces, aj - next));
      if (next < aj) {
        content.push(...rewritten(unit?.node ?? null, rawOf(next, take)));
        next += take;
      }
      if (unit) content.push(...unit.trailing);
    }
    if (ai < n) {
      content.push(units[ai].node, ...units[ai].trailing);
    }
    i = ai + 1;
    j = aj + 1;
  }
  return { type: "doc", content: content.length ? content : [paragraph("")] };
}
