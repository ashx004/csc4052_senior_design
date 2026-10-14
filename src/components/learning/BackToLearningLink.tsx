import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LEARNING_ROUTES } from "@/src/library/learning/routes";

/**
 * The only way back to `/learning` from an inner route. It replaces the
 * `HeroBanner` surface switcher, which the redesign removed.
 */
export default function BackToLearningLink() {
  return (
    <Link
      href={LEARNING_ROUTES.home}
      className="inline-flex items-center gap-2 rounded-full border border-gray-light bg-white py-2 pl-3 pr-4 text-sm font-semibold text-gray-secondary transition-colors hover:border-border-hover hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transition-none"
    >
      <ChevronLeft size={16} aria-hidden="true" />
      Learning
    </Link>
  );
}
