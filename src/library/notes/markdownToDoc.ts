// Markdown -> TipTap document JSON, so the AI can write typed notes that open
// in the Notes editor exactly like hand-typed ones. Covers what the editor
// supports: headings 1-3, paragraphs, dash/dot/numbered/checkbox lists
// (nested by indentation), blockquotes, code blocks, horizontal rules, math
// ($x$, $$...$$, \(..\), \[..\]), pictures from the student's own storage, and
// bold/italic/underline/highlight/strike/inline code/links.
// The inverse of noteToMarkdown in noteText.ts (round-trips are tested).

type Mark = { type: "bold" | "italic" | "strike" | "code" | "underline" | "highlight" | "link"; attrs?: Record<string, unknown> };
type TextNode = { type: "text"; text: string; marks?: Mark[] };
type InlineNode = TextNode | { type: "mathInline"; attrs: { latex: string } };
type Block = { type: string; attrs?: Record<string, unknown>; content?: (Block | InlineNode)[] };

// Order matters: code first (its contents are literal), then math (so the
// underscores in $a_b$ aren't italics), then the paired marks.
const INLINE =
  /(`[^`\n]+`)|(\$(?!\s)[^$\n]*?[^\s$]\$(?!\d))|(\\\([^\n]+?\\\))|(\*\*[^*\n]+\*\*|(?<![A-Za-z0-9])__[^_\n]+__(?![A-Za-z0-9]))|(~~[^~\n]+~~)|(<u>[^<\n]+<\/u>)|(==[^=\n]+==)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\n]+\*|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9]))/g;

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export function inlineToNodes(text: string, inherited: Mark[] = []): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  const push = (t: string, marks: Mark[]) => {
    if (!t) return;
    nodes.push(marks.length ? { type: "text", text: t, marks } : { type: "text", text: t });
  };
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    push(text.slice(last, index), inherited);
    const [whole, code, dollarMath, parenMath, bold, strike, underline, highlight, link, italic] = m;
    if (code) push(code.slice(1, -1), [...inherited, { type: "code" }]);
    else if (dollarMath) nodes.push({ type: "mathInline", attrs: { latex: dollarMath.slice(1, -1).trim() } });
    else if (parenMath) nodes.push({ type: "mathInline", attrs: { latex: parenMath.slice(2, -2).trim() } });
    else if (bold) nodes.push(...inlineToNodes(bold.slice(2, -2), [...inherited, { type: "bold" }]));
    else if (strike) nodes.push(...inlineToNodes(strike.slice(2, -2), [...inherited, { type: "strike" }]));
    else if (underline) nodes.push(...inlineToNodes(underline.slice(3, -4), [...inherited, { type: "underline" }]));
    else if (highlight) nodes.push(...inlineToNodes(highlight.slice(2, -2), [...inherited, { type: "highlight" }]));
    else if (link) {
      const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(link)!;
      if (SAFE_HREF.test(parts[2])) nodes.push(...inlineToNodes(parts[1], [...inherited, { type: "link", attrs: { href: parts[2] } }]));
      else push(whole, inherited);
    } else if (italic) nodes.push(...inlineToNodes(italic.slice(1, -1), [...inherited, { type: "italic" }]));
    last = index + whole.length;
  }
  push(text.slice(last), inherited);
  return nodes;
}

const paragraph = (text: string): Block => {
  const content = inlineToNodes(text.trim());
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK_TEXT = /^\[([ xX])\]\s+(.*)$/;
const indentOf = (line: string) => line.match(/^\s*/)![0].replace(/\t/g, "    ").length;
// Pictures only from the student's own storage, never an arbitrary URL.
const OWN_IMAGE = /^!\[([^\]\n]*)\]\((\/api\/download\?key=[^)\s]+)\)$/;

type ListKind = "ordered" | "dash" | "dot" | "task";
function kindOf(line: string): ListKind | null {
  const m = LIST_LINE.exec(line);
  if (!m) return null;
  if (/\d/.test(m[2])) return "ordered";
  if (TASK_TEXT.test(m[3])) return "task";
  return m[2] === "-" ? "dash" : "dot";
}

function parseList(lines: string[], start: number): [Block, number] {
  const indent = indentOf(lines[start]);
  const kind = kindOf(lines[start])!;
  const items: Block[] = [];
  let i = start;
  while (i < lines.length && LIST_LINE.test(lines[i]) && indentOf(lines[i]) === indent && kindOf(lines[i]) === kind) {
    const text = LIST_LINE.exec(lines[i])![3];
    const task = kind === "task" ? TASK_TEXT.exec(text)! : null;
    const content: Block[] = [paragraph(task ? task[2] : text)];
    i++;
    while (i < lines.length && LIST_LINE.test(lines[i]) && indentOf(lines[i]) > indent) {
      const [nested, next] = parseList(lines, i);
      content.push(nested);
      i = next;
    }
    items.push(
      kind === "task"
        ? { type: "taskItem", attrs: { checked: task![1].toLowerCase() === "x" }, content }
        : { type: "listItem", content }
    );
  }
  const block: Block =
    kind === "ordered"
      ? { type: "orderedList", content: items }
      : kind === "task"
        ? { type: "taskList", content: items }
        : { type: "bulletList", attrs: { marker: kind }, content: items };
  return [block, i];
}

const BLOCK_START = /^(#{1,6}\s|>|```|\$\$|\\\[|!\[|\s*[-*+]\s|\s*\d+[.)]\s)/;

export function markdownToDoc(markdown: string): { type: "doc"; content: Block[] } {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++; // closing fence
      const text = code.join("\n");
      blocks.push(text ? { type: "codeBlock", content: [{ type: "text", text }] } : { type: "codeBlock" });
      continue;
    }

    const dollarBlock = /^\$\$(.*)$/.exec(trimmed);
    const bracketBlock = /^\\\[(.*)$/.exec(trimmed);
    if (dollarBlock || bracketBlock) {
      const close = dollarBlock ? "$$" : "\\]";
      const first = (dollarBlock ?? bracketBlock)![1];
      const math: string[] = [];
      if (first.trimEnd().endsWith(close) && first.trim().length >= close.length) {
        math.push(first.trimEnd().slice(0, -close.length));
        i++;
      } else {
        if (first.trim()) math.push(first);
        i++;
        while (i < lines.length && !lines[i].trim().endsWith(close)) math.push(lines[i++]);
        if (i < lines.length) {
          const tail = lines[i].trim().slice(0, -close.length);
          if (tail) math.push(tail);
          i++;
        }
      }
      blocks.push({ type: "mathBlock", attrs: { latex: math.join("\n").trim() } });
      continue;
    }

    const image = OWN_IMAGE.exec(trimmed);
    if (image) {
      blocks.push({ type: "noteImage", attrs: { src: image[2], alt: image[1], width: 80 } });
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = Math.min(3, heading[1].length); // the editor offers H1-H3
      const content = inlineToNodes(heading[2].trim());
      blocks.push({ type: "heading", attrs: { level }, ...(content.length ? { content } : {}) });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) quoted.push(lines[i++].trim().replace(/^>\s?/, ""));
      blocks.push({ type: "blockquote", content: markdownToDoc(quoted.join("\n")).content });
      continue;
    }

    if (LIST_LINE.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = [lines[i++].trim()]; // always take one line, so a stray "![" can't stall the loop
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BLOCK_START.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push(paragraph(para.join(" ")));
  }

  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}
