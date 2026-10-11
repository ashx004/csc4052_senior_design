'use client';

import { use } from 'react';
import FlashcardViewer from '@/src/components/learning/FlashcardViewer';

export default function FlashcardSetPage({ params }: { params: Promise<{ courseId: string; setId: string }> }) {
  const { courseId, setId } = use(params);
  return <FlashcardViewer courseId={courseId} setId={decodeURIComponent(setId)} />;
}
