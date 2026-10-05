import { useCallback, useEffect, useRef, type DependencyList } from "react";

// Keeps a chat scrolled to the newest text only while the reader is already
// at the bottom. Scrolling up while a reply streams in leaves them where
// they are (it used to yank them back down on every chunk); scrolling back
// to the bottom, or sending a message, resumes following.
const NEAR_BOTTOM_PX = 80;

export function useStickToBottom<T extends HTMLElement>(deps: DependencyList) {
  const ref = useRef<T | null>(null);
  const following = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  /** Jump to the bottom and follow again (after the student sends a message). */
  const stick = useCallback(() => {
    following.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's content deps
  }, deps);

  return { ref, onScroll, stick };
}
