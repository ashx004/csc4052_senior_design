"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import katex from "katex";
import "katex/dist/katex.min.css";

export function renderLatex(latex: string, display: boolean): string {
  return katex.renderToString(latex.trim() || "\\square", { displayMode: display, throwOnError: false, output: "htmlAndMathml", strict: "ignore" });
}

function MathView({ node, updateAttributes, editor, getPos, selected, deleteNode }: NodeViewProps) {
  const display = node.type.name === "mathBlock";
  const latex = String(node.attrs.latex ?? "");
  const [editing, setEditing] = useState(!latex);
  const [draft, setDraft] = useState(latex);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const finished = useRef(false);
  const html = useMemo(() => renderLatex(editing ? draft : latex, display), [editing, draft, latex, display]);

  useEffect(() => {
    if (editing) {
      finished.current = false;
      inputRef.current?.focus();
    }
  }, [editing]);

  function commit(moveOn: boolean) {
    // Finishing moves focus away, which fires blur: only commit once.
    if (finished.current) return;
    finished.current = true;
    const next = draft.trim();
    setEditing(false);
    if (!next) {
      deleteNode();
      return;
    }
    updateAttributes({ latex: next });
    if (moveOn && typeof getPos === "function") {
      const pos = getPos();
      if (typeof pos === "number") editor.chain().focus(pos + node.nodeSize).run();
    }
  }

  return (
    <NodeViewWrapper
      as={display ? "div" : "span"}
      data-math={display ? "block" : "inline"}
      contentEditable={false}
      className={`note-math ${display ? "note-math-block" : "note-math-inline"} ${selected || editing ? "note-math-selected" : ""}`}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={`Equation ${latex}. Click to edit.`}
        onClick={() => {
          setDraft(latex);
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setDraft(latex);
            setEditing(true);
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {editing && (
        <span className="note-math-editor" onMouseDown={(e) => e.stopPropagation()}>
          <textarea
            ref={inputRef}
            value={draft}
            rows={display ? 3 : 1}
            spellCheck={false}
            placeholder="LaTeX, e.g. \frac{a}{b} or x^2 + y^2"
            aria-label="LaTeX equation"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (!display || e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commit(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                commit(false);
              }
            }}
            onBlur={() => commit(false)}
          />
          <small>{display ? "Ctrl+Enter to finish" : "Enter to finish"} - LaTeX supported</small>
        </span>
      )}
    </NodeViewWrapper>
  );
}

const common = {
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-latex") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-latex": String(attrs.latex ?? "") }),
      },
    };
  },
};

/** `$x^2$` typed inline: an equation that sits within a line of text. */
export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  ...common,
  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "math-inline" }), `$${node.attrs.latex}$`];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathView);
  },
  addInputRules() {
    return [
      new InputRule({
        // $...$ with no space just inside the dollar signs, so "$5 and $6"
        // is left as ordinary text.
        find: /(?:^|[\s(])\$([^$\s](?:[^$]*[^$\s])?)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          const full = match[0];
          const from = range.from + full.indexOf("$");
          state.tr.replaceWith(from, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },
});

/** `$$` on an empty line: a centered display equation. */
export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  ...common,
  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "math-block" }), `$$${node.attrs.latex}$$`];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$$/,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name !== "paragraph" || $from.parent.textContent !== "$") return null;
          state.tr.replaceWith($from.before(), $from.after(), this.type.create({ latex: "" }));
        },
      }),
    ];
  },
});
