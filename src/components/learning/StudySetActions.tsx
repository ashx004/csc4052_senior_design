'use client';

import { useId, useRef, useState } from 'react';
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { MoreVertical } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useCourseInfo } from '@/src/hooks/useCourseInfo';
import { db } from '@/src/library/firebase';
import { publishStudySet } from '@/src/library/discover/publishStudySet';
import { unpublishStudySet } from '@/src/library/discover/unpublishStudySet';
import ConfirmDeleteModal from './ConfirmDeleteModal';

/** Independent disclosure: native buttons remain reachable by Tab without menu-role key handling. */
export default function StudySetActions({ set, kind, courseId }: {
  set: { id: string; name: string; pinned?: boolean; visibility?: string; publicSetId?: string };
  kind: 'flashcard' | 'quiz';
  courseId: string;
}) {
  const { user } = useAuth();
  const { courseCode } = useCourseInfo(courseId);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const isPublic = set.visibility === 'public';
  const run = async (action: 'pin' | 'visibility' | 'delete') => {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const collectionName = kind === 'flashcard' ? 'flashcardSets' : 'quizSets';
      const ref = doc(db, 'users', user.uid, 'enrollment', courseId, collectionName, set.id);
      if (action === 'pin') await updateDoc(ref, { pinned: set.pinned === false });
      else if (action === 'delete') {
        await deleteDoc(ref);
        setConfirm(false);
      } else if (isPublic) {
        if (set.publicSetId) await unpublishStudySet(set.publicSetId, user.uid);
        await updateDoc(ref, { visibility: 'private' });
      } else {
        if (!courseCode) throw new Error('Course information is still loading. Please try again.');
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) throw new Error('This set is no longer available.');
        const data = snapshot.data();
        const publicSetId = await publishStudySet({
          type: kind,
          setData: kind === 'flashcard' ? { name: data.name, cards: data.cards } : { name: data.name, questions: data.questions },
          courseCode, ownerUid: user.uid,
          originalPath: `users/${user.uid}/enrollment/${courseId}/${collectionName}/${set.id}`,
        });
        await updateDoc(ref, { visibility: 'public', publicSetId });
      }
      setOpen(false);
      trigger.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this set. Please try again.');
    } finally { setBusy(false); }
  };
  const buttonClass = 'w-full rounded px-3 py-2 text-left text-sm hover:bg-bg-warm focus-visible:bg-bg-warm focus-visible:outline-none disabled:opacity-50';
  return (
    <div className="absolute right-2 top-2 z-10 text-text-main" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    }}>
      <button ref={trigger} type="button" aria-label={`Actions for ${set.name}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="rounded-lg bg-bg-container p-2 hover:bg-bg-warm focus-visible:bg-bg-warm focus-visible:outline-none">
        <MoreVertical size={16} />
      </button>
      {open && <div id={id} className="absolute right-0 mt-1 w-52 rounded-lg bg-bg-container p-1 shadow-lg">
        <button type="button" disabled={busy} className={buttonClass} onClick={() => void run('pin')}>{set.pinned === false ? 'Pin to sidebar' : 'Unpin from sidebar'}</button>
        <button type="button" disabled={busy} className={buttonClass} onClick={() => void run('visibility')}>{isPublic ? 'Make private' : 'Share with classmates'}</button>
        <button type="button" disabled={busy} className={buttonClass} onClick={() => { setConfirm(true); setOpen(false); }}>Remove from folder</button>
      </div>}
      {error && <p role="alert" className="absolute right-0 top-full z-20 w-60 rounded-lg bg-bg-container p-3 text-sm text-alert-error">{error}</p>}
      <ConfirmDeleteModal open={confirm} title="Remove from folder" message="This will permanently delete this set. This action cannot be undone." loading={busy} onConfirm={() => void run('delete')} onCancel={() => { setConfirm(false); trigger.current?.focus(); }} />
    </div>
  );
}
