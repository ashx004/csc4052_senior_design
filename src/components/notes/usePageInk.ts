"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPages, savePage } from "@/src/library/notes/notesStore";
import { EMPTY_PAGE, type PageAnnotations } from "@/src/library/notes/types";

const SAVE_DELAY_MS = 700;
const MAX_UNDO = 60;

/** Per-page drawings/annotations for one note: loading, debounced saving
 *  (each page saves on its own), and undo across pages. */
export function usePageInk(uid: string | undefined, noteId: string) {
  const [pages, setPages] = useState<Record<number, PageAnnotations>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const history = useRef<{ page: number; before: PageAnnotations }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    loadPages(uid, noteId)
      .then((p) => !cancelled && setPages(p))
      .catch((e) => console.error("Failed to load drawings:", e))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [uid, noteId]);

  const scheduleSave = useCallback(
    (index: number) => {
      if (!uid) return;
      clearTimeout(timers.current[index]);
      setSaving(true);
      timers.current[index] = setTimeout(async () => {
        delete timers.current[index];
        try {
          await savePage(uid, noteId, index, pagesRef.current[index] ?? EMPTY_PAGE);
        } catch (e) {
          console.error(`Failed to save page ${index + 1}:`, e);
        } finally {
          if (Object.keys(timers.current).length === 0) setSaving(false);
        }
      }, SAVE_DELAY_MS);
    },
    [uid, noteId]
  );

  // Flush pending saves when leaving the note.
  useEffect(
    () => () => {
      if (!uid) return;
      for (const key of Object.keys(timers.current)) {
        const index = Number(key);
        clearTimeout(timers.current[index]);
        savePage(uid, noteId, index, pagesRef.current[index] ?? EMPTY_PAGE).catch(() => {});
      }
    },
    [uid, noteId]
  );

  const updatePage = useCallback(
    (index: number, next: PageAnnotations) => {
      const before = pagesRef.current[index] ?? EMPTY_PAGE;
      history.current = [...history.current.slice(-MAX_UNDO + 1), { page: index, before }];
      setCanUndo(true);
      setPages((prev) => ({ ...prev, [index]: next }));
      pagesRef.current = { ...pagesRef.current, [index]: next };
      scheduleSave(index);
    },
    [scheduleSave]
  );

  const undo = useCallback(() => {
    const last = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!last) return;
    setPages((prev) => ({ ...prev, [last.page]: last.before }));
    pagesRef.current = { ...pagesRef.current, [last.page]: last.before };
    scheduleSave(last.page);
  }, [scheduleSave]);

  return { pages, loaded, saving, updatePage, undo, canUndo };
}
