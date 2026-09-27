// Markdown -> TipTap document JSON, so the AI can write typed notes that open
// in the Notes editor exactly like hand-typed ones. Covers what the editor
// supports: headings 1-3, paragraphs, bullet/numbered lists, blockquotes,
// code blocks, horizontal rules, and bold/italic/strike/inline code.
// The inverse of noteToMarkdown in noteText.ts (round-trips are tested).

type Mark = { type: "bold" | "italic" | "strike" | "code" };
type TextNode = { type: "text"; text: string; marks?: Mark[] };
type Block = { type: string; attrs?: Record<string, unknown>; content?: (Block | TextNode)[] };

// Order matters: code first (its contents are literal), then bold before italic.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*|_[^_\n]+_)/g;

export function inlineToNodes(text: string, inherited: Mark[] = []): TextNode[] {
  const nodes: TextNode[] = [];
  let last = 0;
  const push = (t: string, marks: Mark[]) => {
    if (!t) return;
    nodes.push(marks.length ? { type: "text", text: t, marks } : { type: "text", text: t });
  };
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    push(text.slice(last, index), inherited);
    const [whole, code, bold, strike, italic] = m;
    if (code) push(code.slice(1, -1), [...inherited, { type: "code" }]);
    else if (bold) nodes.push(...inlineToNodes(bold.slice(2, -2), [...inherited, { type: "bold" }]));
    else if (strike) nodes.push(...inlineToNodes(strike.slice(2, -2), [...inherited, { type: "strike" }]));
    else if (italic) nodes.push(...inlineToNodes(italic.slice(1, -1), [...inherited, { type: "italic" }]));
    last = index + whole.length;
  }
  push(text.slice(last), inherited);
  return nodes;
}

const paragraph = (text: string): Block => {
  const content = inlineToNodes(text.trim());
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

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

    const bullet = /^\s*[-*+]\s+(.*)$/;
    const ordered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || ordered.test(line)) {
      const isOrdered = !bullet.test(line);
      const pattern = isOrdered ? ordered : bullet;
      const items: Block[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push({ type: "listItem", content: [paragraph(pattern.exec(lines[i])![1])] });
        i++;
      }
      blocks.push({ type: isOrdered ? "orderedList" : "bulletList", content: items });
      continue;
    }

    // A paragraph runs until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|>|```|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push(paragraph(para.join(" ")));
  }

  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}
