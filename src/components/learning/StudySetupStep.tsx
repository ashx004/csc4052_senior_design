'use client';

import VisibilitySelector from '@/src/components/discover/VisibilitySelector';
import { QUIZ_DIFFICULTY_OPTIONS, type QuizDifficulty } from '@/src/library/quizDifficulty';
import type { SourceOption } from '@/src/library/studySets/sourceOptions';
import {
  coveragePreview,
  type StudyConfig,
  type StudyKind,
  type StudyValidation,
} from '@/src/library/studySets/setupRules';
import styles from './StudySetupStep.module.css';

interface StudySetupStepProps {
  kind: StudyKind;
  selected: SourceOption[];
  config: StudyConfig;
  validation: StudyValidation;
  blockedMessage: string | null;
  loading: boolean;
  error: string | null;
  onChange: (config: StudyConfig) => void;
  onRaiseCount: () => void;
}

export default function StudySetupStep({
  kind,
  selected,
  config,
  validation,
  blockedMessage,
  loading,
  error,
  onChange,
  onRaiseCount,
}: StudySetupStepProps) {
  const preview = coveragePreview(selected.map((item) => item.id), config.count);
  const countLabel = kind === 'quiz' ? 'Questions' : 'Cards';

  return (
    <div className={styles.wrap}>
      <p className={styles.summary}>
        From {selected.length} selected {selected.length === 1 ? 'source' : 'sources'}: {selected.map((item) => item.title).join(', ')}
      </p>
      <label className={styles.field}>
        <span>{countLabel}</span>
        <input
          type="number"
          min={1}
          max={kind === 'quiz' ? 50 : 30}
          value={config.count}
          disabled={loading}
          onChange={(event) => onChange({ ...config, count: Number(event.target.value) })}
        />
      </label>
      {!validation.valid && validation.message && (
        <p className={styles.note}>
          {validation.message}{' '}
          {config.count < validation.minimum && validation.minimum > 0 && (
            <button type="button" className={styles.raise} onClick={onRaiseCount}>
              Use {validation.minimum}
            </button>
          )}
        </p>
      )}
      {kind === 'quiz' && (
        <>
          <div className={styles.field}>Question types</div>
          <div className={styles.options}>
            {([
              ['multipleChoice', 'Multiple choice'],
              ['trueFalse', 'True / false'],
              ['matching', 'Matching'],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(config.questionTypes?.[key])}
                  disabled={loading}
                  onChange={(event) => onChange({
                    ...config,
                    questionTypes: { ...config.questionTypes!, [key]: event.target.checked },
                  })}
                />{' '}
                {label}
              </label>
            ))}
          </div>
          <div className={styles.field}>Difficulty</div>
          <div className={styles.options} role="radiogroup" aria-label="Difficulty">
            {QUIZ_DIFFICULTY_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="study-difficulty"
                  checked={config.difficulty === option.value}
                  disabled={loading}
                  onChange={() => onChange({ ...config, difficulty: option.value as QuizDifficulty })}
                />{' '}
                {option.label}
              </label>
            ))}
          </div>
        </>
      )}
      <div className={styles.field}>Visibility</div>
      <VisibilitySelector
        value={config.visibility}
        disabled={loading}
        onChange={(visibility) => onChange({ ...config, visibility })}
      />
      {'note' in preview ? <p className={styles.note}>{preview.note}</p> : <p className={styles.note}>{preview.message}</p>}
      {kind === 'flashcards' && (
        <p className={styles.note}>The current flashcard generator chooses the card count. This number is the target for when multi-source generation is connected.</p>
      )}
      {blockedMessage && <p className={styles.error}>{blockedMessage}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
