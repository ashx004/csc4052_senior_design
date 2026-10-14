// The floating AI panel (components/aiPanel) is mounted by both the dashboard and
// the course layouts so it is available on every page. A few pages carry their own
// contextual "Ask Catalyst" panel, briefed on exactly what is on screen (a quiz, a
// flashcard deck, the course overview). Showing both would stack two chat UIs, so
// the global panel stays out of those pages. (Pages whose own panel only sometimes shows,
// such as course Discover, announce it instead: see useClaimAiPanel.)

const COURSE = /^\/courses\/[^/]+/;

export function pageHasOwnAiPanel(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // The full-page assistant is itself the chat.
  if (pathname === "/ai-assistant" || pathname.startsWith("/ai-assistant/")) return true;
  if (!COURSE.test(pathname)) return false;
  const rest = pathname.replace(COURSE, "").replace(/\/+$/, "");
  if (rest === "") return true; // the course overview
  if (/^\/learning(\/|$)/.test(rest)) return true;
  if (/^\/(quizzes|flashcards)\/[^/]+$/.test(rest)) return true; // one quiz or deck, not the lists
  return false;
}
