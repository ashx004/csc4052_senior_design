"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";

export const IMAGE_WIDTHS = [
  { label: "S", percent: 30 },
  { label: "M", percent: 55 },
  { label: "L", percent: 80 },
  { label: "Full", percent: 100 },
];

function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const width = Number(node.attrs.width) || 100;
  return (
    <NodeViewWrapper className={`note-image ${selected ? "note-image-selected" : ""}`} data-drag-handle>
      <div className="note-image-frame" style={{ width: `${width}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={String(node.attrs.src)} alt={String(node.attrs.alt ?? "")} draggable={false} />
        {selected && (
          <div className="note-image-controls" contentEditable={false}>
            {IMAGE_WIDTHS.map((w) => (
              <button
                key={w.label}
                type="button"
                aria-label={`Picture size ${w.label}`}
                aria-pressed={width === w.percent}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ width: w.percent })}
              >
                {w.label}
              </button>
            ))}
            <button type="button" aria-label="Remove picture" onMouseDown={(e) => e.preventDefault()} onClick={() => deleteNode()}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** A picture on the page: uploaded (and compressed) to the student's own
 *  storage, shown at S / M / L / full width, draggable like any block. */
export const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      width: {
        default: 80,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-width")) || 80,
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-width": String(attrs.width ?? 80) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
