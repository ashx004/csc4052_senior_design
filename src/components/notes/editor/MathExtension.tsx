"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE, insertSnippet, nextPlaceholder, type Edit } from "@/src/library/notes/equationBuilder";
import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import katex from "katex";
import "katex/dist/katex.min.css";

export function renderLatex(latex: string, display: boolean): string {
  return katex.renderToString(latex.trim() || "\\square", { displayMode: display, throwOnError: false, output: "htmlAndMathml", strict: "ignore" });
}

// Each palette button shows the math it inserts, rendered once and reused.
const paletteHtml = new Map<string, string>();
function paletteFace(latex: string): string {
  let html = paletteHtml.get(latex);
  if (!html) {
    html = renderLatex(latex, false);
    paletteHtml.set(latex, html);
  }
  return html;
}

/**
 * Buttons for building an equation without knowing LaTeX: pick a group, click
 * a template or symbol, and it is written into the equation text at the cursor.
 * mousedown is cancelled so the text box keeps focus (losing it would finish the
 * equation).
 */
function EquationPalette({ onInsert }: { onInsert: (latex: string) => void }) {
  const [group, setGroup] = useState(PALETTE[0].id);
  const current = PALETTE.find((g) => g.id === group) ?? PALETTE[0];
  return (
    <div className="note-math-palette">
      <div role="tablist" aria-label="Equation parts" className="note-math-tabs">
        {PALETTE.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === current.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setGroup(g.id)}
          >
            {g.title}
          </button>
        ))}
      </div>
      <div role="group" aria-label={current.title} className="note-math-grid">
        {current.items.map((item) => (
          <button
            key={item.label}
            type="button"
            title={item.label}
            aria-label={item.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(item.latex)}
            dangerouslySetInnerHTML={{ __html: paletteFace(item.latex) }}
          />
        ))}
      </div>
    </div>
  );
}

function MathView({ node, updateAttributes, editor, getPos, selected, deleteNode }: NodeViewProps) {
  const display = node.type.name === "mathBlock";
  const latex = String(node.attrs.latex ?? "");
  const [editing, setEditing] = useState(!latex);
  const [draft, setDraft] = useState(latex);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const finished = useRef(false);
  const html = useMemo(() => renderLatex(editing ? draft : latex, display), [editing, draft, latex, display]);
  // Where to put the cursor once a palette click has changed the text.
  const pendingSelection = useRef<Edit | null>(null);

  useEffect(() => {
    const edit = pendingSelection.current;
    const box = inputRef.current;
    if (!edit || !box) return;
    pendingSelection.current = null;
    box.focus();
    box.setSelectionRange(edit.start, edit.end);
  }, [draft]);

  function insert(snippet: string) {
    const box = inputRef.current;
    if (!box) return;
    const edit = insertSnippet(draft, box.selectionStart, box.selectionEnd, snippet);
    pendingSelection.current = edit;
    setDraft(edit.text);
  }

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
            placeholder="Use the buttons below, or type LaTeX, e.g. \frac{a}{b}"
            aria-label="LaTeX equation"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Tab hops to the next empty box in a template instead of leaving the equation.
              if (e.key === "Tab" && !e.shiftKey) {
                const next = nextPlaceholder(draft, e.currentTarget.selectionEnd);
                if (next) {
                  e.preventDefault();
                  e.currentTarget.setSelectionRange(next.start, next.end);
                  return;
                }
              }
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
          <EquationPalette onInsert={insert} />
          <span className="note-math-foot">
            <small>
              Click a button, then fill in the boxes (Tab jumps to the next one). {display ? "Ctrl+Enter" : "Enter"} to finish.
            </small>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(true)}>
              Done
            </button>
          </span>
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
