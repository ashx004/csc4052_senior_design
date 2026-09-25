'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ThumbsUp } from 'lucide-react';
import type { PublicStudySet } from '@/src/library/discover/types';

interface PublicStudySetWithId extends PublicStudySet {
  id: string;
}

interface StudySetCarouselProps {
  sets: PublicStudySetWithId[];
  onSelect: (setId: string) => void;
}

const CARDS_PER_STEP = 3;

export default function StudySetCarousel({ sets, onSelect }: StudySetCarouselProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 1px tolerance for sub-pixel rounding at the scroll edges
    setCanScrollPrev(el.scrollLeft > 1);
    setCanScrollNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    // Re-check edge state whenever the row's size changes (viewport resize,
    // sidebar toggle, etc.) — arrow visibility depends on how many cards
    // actually fit, not just scroll position.
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [updateScrollState, sets.length]);

  // Derives the per-card scroll step (card width + gap) from the actual
  // rendered cards' positions rather than a hard-coded pixel offset, so it
  // stays correct across breakpoints and whatever width the cards end up at.
  const getStepDistance = (): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    const cards = el.children;
    if (cards.length < 2) {
      return (cards[0] as HTMLElement | undefined)?.offsetWidth ?? el.clientWidth;
    }
    const cardSpan = (cards[1] as HTMLElement).offsetLeft - (cards[0] as HTMLElement).offsetLeft;
    return cardSpan * CARDS_PER_STEP;
  };

  const scrollByCards = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * getStepDistance(), behavior: 'smooth' });
  };

  if (sets.length === 0) return null;

  return (
    <div className="relative mt-4">
      <button
        type="button"
        onClick={() => scrollByCards(-1)}
        disabled={!canScrollPrev}
        aria-label="Show previous study sets"
        className={`absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-light bg-bg-container shadow-sm transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6914] focus-visible:ring-offset-2 ${
          canScrollPrev ? 'opacity-100 hover:bg-bg-warm' : 'pointer-events-none opacity-0'
        }`}
      >
        <ChevronLeft size={18} className="text-text-main" />
      </button>

      {/* Edge fades hint at more content without dimming the fully-visible
          cards themselves — thin enough to sit within a card's own padding. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 z-[5] w-8 bg-gradient-to-r from-[#FAFAF8] to-transparent transition-opacity ${
          canScrollPrev ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 z-[5] w-8 bg-gradient-to-l from-[#FAFAF8] to-transparent transition-opacity ${
          canScrollNext ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        tabIndex={0}
        role="group"
        aria-label="Recommended study sets"
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6914] focus-visible:ring-offset-2 rounded-2xl"
      >
        {sets.map((set) => (
          <button
            key={set.id}
            onClick={() => onSelect(set.id)}
            className="flex w-64 shrink-0 snap-start flex-col rounded-2xl border border-border-light bg-bg-container p-5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6914] focus-visible:ring-offset-2 md:w-[calc((100%-2rem)/3)]"
          >
            <h3 className="text-sm font-bold text-[#1a1a2e] line-clamp-2">{set.title}</h3>
            <p className="mt-1 text-xs text-text-muted">
              {set.itemCount} {set.type === 'quiz' ? 'question' : 'card'}
              {set.itemCount !== 1 ? 's' : ''}
            </p>
            <div className="mt-auto flex items-center justify-between pt-4 text-xs text-text-muted">
              <span className="truncate">{set.creatorDisplayName}</span>
              <span className="flex shrink-0 items-center gap-1">
                <ThumbsUp size={12} />
                {set.positiveVotes}
              </span>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollByCards(1)}
        disabled={!canScrollNext}
        aria-label="Show next study sets"
        className={`absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-border-light bg-bg-container shadow-sm transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6914] focus-visible:ring-offset-2 ${
          canScrollNext ? 'opacity-100 hover:bg-bg-warm' : 'pointer-events-none opacity-0'
        }`}
      >
        <ChevronRight size={18} className="text-text-main" />
      </button>
    </div>
  );
}
