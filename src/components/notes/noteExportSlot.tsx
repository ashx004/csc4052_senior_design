"use client";

import { createContext, useContext, useEffect, type MutableRefObject } from "react";
import type { ExportSource } from "./ExportMenu";

/**
 * Lets the open note's editor offer its export to the note page. The page's
 * Share popup shows the export options, but only the editor knows how to render
 * its pages, so each editor registers a function that returns what an export
 * needs, and the popup calls it when a format is picked (always the latest
 * state, never a stale copy).
 */
export type ExportGetter = () => ExportSource | null;

const ExportSlotContext = createContext<MutableRefObject<ExportGetter | null> | null>(null);
export const ExportSlotProvider = ExportSlotContext.Provider;

/**
 * Registers this editor's export with the note page. Returns whether there is
 * a page to hand it to; when there isn't, the editor shows its own Export button.
 */
export function useExportRegistration(getSource: ExportGetter): boolean {
  const slot = useContext(ExportSlotContext);
  useEffect(() => {
    if (slot) slot.current = getSource;
  });
  useEffect(
    () => () => {
      if (slot) slot.current = null;
    },
    [slot]
  );
  return slot !== null;
}
