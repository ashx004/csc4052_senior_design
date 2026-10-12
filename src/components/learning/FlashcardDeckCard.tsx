'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import StudySetActions from './StudySetActions';
import { flashcardStatusLabel, type FlashcardSetSummary } from '@/src/library/studySets/viewModels';
import { studySetRoutes } from '@/src/library/studySets/routes';
import styles from './FlashcardDeckCard.module.css';

/** The same four hues the quiz rows use for their bars. */
const FACES = ['', styles.face2, styles.face3, styles.face4];

export default function FlashcardDeckCard({
  set,
  courseId,
  index,
}: {
  set: FlashcardSetSummary;
  courseId: string;
  index: number;
}) {
  const face = FACES[index % FACES.length];
  const minutes = typeof set.estimatedMinutes === 'number' ? `about ${set.estimatedMinutes} min` : null;
  return (
    <article className="relative">
    <Link href={studySetRoutes(courseId).flashcard(set.id)} className={`${styles.card} ${face}`}>
      <h3 className={styles.title} title={set.name}>{set.name}</h3>
      <span className={styles.tag}>{flashcardStatusLabel(set.reviewStatus)}</span>
      <div className={styles.meta}>
        <span>{set.cardCount} cards</span>
        {minutes && <span>{minutes}</span>}
        <ArrowRight size={26} strokeWidth={2.25} className={styles.arrow} aria-hidden="true" />
      </div>
    </Link>
    <StudySetActions set={set} kind="flashcard" courseId={courseId} />
    </article>
  );
}
