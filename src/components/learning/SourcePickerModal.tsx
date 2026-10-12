'use client';

import { useEffect, useId, useRef } from 'react';
import Link from 'next/link';
import {
  filterSourceOptions,
  sourceCheckboxDisabled,
  validSourceSelection,
  sourceSelectionNotice,
  sourceStatusLabel,
  toggleSource,
  toggleVisibleSources,
  type SourceOption,
} from '@/src/library/studySets/sourceOptions';
import type { StudyKind } from '@/src/library/studySets/setupRules';
import styles from './SourcePickerModal.module.css';

interface SourcePickerModalProps {
  open: boolean;
  kind: StudyKind;
  options: SourceOption[];
  selectedIds: string[];
  query: string;
  onQueryChange: (query: string) => void;
  onChange: (ids: string[]) => void;
  onBack?: () => void;
  /** Where "use my own prompt and files instead" goes; omitted where that doesn't apply. */
  customHref?: string;
  onContinue: () => void;
  onClose: () => void;
}

export default function SourcePickerModal({
  open,
  kind,
  options,
  selectedIds,
  query,
  onQueryChange,
  onChange,
  onBack,
  customHref,
  onContinue,
  onClose,
}: SourcePickerModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const visible = filterSourceOptions(options, query);
  const documents = visible.filter((option) => option.kind === 'document');
  const notes = visible.filter((option) => option.kind === 'note');
  const notice = sourceSelectionNotice(selectedIds.length);
  const countLabel = `${selectedIds.length} ${selectedIds.length === 1 ? 'source' : 'sources'} selected`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog?.addEventListener('cancel', onCancel);
    return () => dialog?.removeEventListener('cancel', onCancel);
  }, [open, onClose]);

  if (!open) return null;

  const renderGroup = (label: string, rows: SourceOption[]) => {
    if (rows.length === 0) return null;
    return (
      <section>
        <div className={styles.group}>
          <span>{label}</span>
          <button type="button" onClick={() => onChange(toggleVisibleSources(selectedIds, rows))}>
            {rows.filter((row) => row.status !== 'unavailable').every((row) => selectedIds.includes(row.id)) ? 'Clear group' : 'Select group'}
          </button>
        </div>
        {rows.map((option) => {
          const selected = selectedIds.includes(option.id);
          const disabled = sourceCheckboxDisabled(option, selectedIds);
          return (
            <label key={option.id} className={styles.row} data-selected={selected} data-disabled={disabled}>
              <input
                type="checkbox"
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(toggleSource(selectedIds, option.id, options))}
              />
              <span>
                <span className={styles.title}>{option.title}</span>
                <span className={styles.meta}>
                  {option.kind === 'document' ? 'Document' : 'Note'}
                  {option.reason ? ` · ${option.reason}` : ''}
                </span>
              </span>
              <span className={`${styles.status} ${option.status === 'indexing' ? styles.wait : ''} ${option.status === 'unavailable' ? styles.bad : ''}`}>
                {sourceStatusLabel(option.status)}
              </span>
            </label>
          );
        })}
      </section>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className={styles.head}>
        <div>
          <p className={styles.step}>Step 1 of 2</p>
          <h2 id={titleId}>Choose your sources</h2>
          <p className={styles.sub}>Pick documents and notes for your {kind === 'quiz' ? 'quiz' : 'flashcards'}.</p>
        </div>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search your course material"
          aria-label="Search course material"
          autoFocus
        />
        {customHref && (
          <p className={styles.sub}>
            Not from your course material?{' '}
            <Link href={customHref} className={styles.all}>Make a custom {kind === 'quiz' ? 'quiz' : 'flashcard set'} from your own prompt and files →</Link>
          </p>
        )}
        {notice && <p className={styles.notice}>{notice}</p>}
        <div className={styles.group}>
          <span>Choose up to 10</span>
          <button type="button" className={styles.all} onClick={() => onChange(toggleVisibleSources(selectedIds, visible))}>
            All visible
          </button>
        </div>
        {options.length === 0 ? (
          <p className={styles.empty}>No course material yet. Upload a document in this class, then come back to create a set.</p>
        ) : visible.length === 0 ? (
          <p className={styles.empty}>
            No matches for “{query}”.{' '}
            <button type="button" className={styles.all} onClick={() => onQueryChange('')}>Clear search</button>
          </p>
        ) : (
          <>
            {renderGroup('Documents', documents)}
            {renderGroup('Notes', notes)}
          </>
        )}
      </div>
      <div className={styles.foot}>
        <span aria-live="polite">{countLabel}</span>
        <span>
          {onBack && <button type="button" className={styles.all} onClick={onBack}>Back</button>}
          <button type="button" className={styles.pill} disabled={!validSourceSelection(selectedIds, options)} onClick={() => { if (validSourceSelection(selectedIds, options)) onContinue(); }}>Continue →</button>
        </span>
      </div>
    </dialog>
  );
}
