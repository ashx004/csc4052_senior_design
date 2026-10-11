"use client";

import { useState } from "react";
import { EMPTY_PAGE, type InkStroke, type PageAnnotations } from "@/src/library/notes/types";
import { eraseAnnotations, placeAnnotation } from "./AnnotationItems";
import type { usePageInk } from "./usePageInk";
import type { ToolState } from "./tools";

/** Glue between a page's saved annotations (usePageInk) and the drawing
 *  tools: what each page's ink layer and annotation overlay need. Shared by
 *  every kind of note so they all draw, highlight and place stickers alike. */
export function useAnnotationTools(ink: ReturnType<typeof usePageInk>, tool: ToolState, setTool: (t: ToolState) => void) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const page = (i: number): PageAnnotations => ink.pages[i] ?? EMPTY_PAGE;

  return {
    page,
    editingId,
    setEditingId,
    setStrokes: (i: number, strokes: InkStroke[]) => ink.updatePage(i, { ...page(i), strokes }),
    setPage: (i: number, next: PageAnnotations) => ink.updatePage(i, next),
    placeAt: (i: number, x: number, y: number) => {
      const placed = placeAnnotation(tool, page(i), x, y);
      if (!placed) return;
      ink.updatePage(i, placed.next);
      if (placed.editId) {
        setEditingId(placed.editId);
        setTool({ ...tool, mode: "type" });
      }
    },
    eraseAt: (i: number, x: number, y: number, r: number) => {
      const next = eraseAnnotations(page(i), x, y, r);
      if (next) ink.updatePage(i, next);
    },
  };
}
