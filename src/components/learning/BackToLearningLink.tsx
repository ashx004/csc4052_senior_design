"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LEARNING_ROUTES } from "@/src/library/learning/routes";
import { useBackDestination } from "@/src/hooks/useBackDestination";

/**
 * The only way back to `/learning` from an inner route. It replaces the
 * `HeroBanner` surface switcher, which the redesign removed.
 *
 * It stays a `Link` so middle-click and the browser's status bar keep working:
 * `href` is the resolved destination, and the click handler defers to `goBack`
 * so an in-app history entry is popped rather than pushed onto.
 */
export default function BackToLearningLink() {
  const { goBack, href } = useBackDestination(LEARNING_ROUTES.home);

  return (
    <Link
      href={href}
      onClick={(event) => {
        // A modified click asks the browser to open `href` somewhere else (new tab, new
        // window). Those fire `click`, not `auxclick`, so intercepting them unconditionally
        // would cancel the open and navigate this tab instead. Let the `Link` handle them.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
          return;
        event.preventDefault();
        goBack();
      }}
      className="inline-flex items-center gap-2 rounded-full border border-gray-light bg-white py-2 pl-3 pr-4 text-sm font-semibold text-gray-secondary transition-colors hover:border-border-hover hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transition-none"
    >
      <ChevronLeft size={16} aria-hidden="true" />
      Learning
    </Link>
  );
}
