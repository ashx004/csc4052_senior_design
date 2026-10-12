import { serverTimestamp } from 'firebase/firestore';
import type { StudySetVisibility } from '@/src/library/discover/types';
import type { QuizDifficulty } from '@/src/library/quizDifficulty';
import { primaryKeyOf, sameSourceSet, sourceKeysOf } from './sourceIdentity';

const nowField = () => serverTimestamp();

export type StudySetKind = 'quiz' | 'flashcards';

export interface StudyQuestionTypes {
  multipleChoice: boolean;
  trueFalse: boolean;
  matching: boolean;
}

export interface PersistInput {
  kind: StudySetKind;
  sourceKeys: string[];
  name: string;
  items: unknown[];
  visibility: StudySetVisibility;
  questionTypes?: StudyQuestionTypes;
  difficulty?: QuizDifficulty;
}

export interface PersistResult {
  setId: string;
  appended: boolean;
}

export interface PersistDeps {
  uid: string;
  courseId: string;
  listSets: (collectionName: string) => Promise<Array<{ id: string; sourceDocKey?: string | null; sourceKeys?: string[] | null; cards?: unknown[]; questions?: unknown[] }>>;
  addSet: (collectionName: string, data: Record<string, unknown>) => Promise<string>;
  updateSet: (collectionName: string, id: string, data: Record<string, unknown>) => Promise<void>;
}

export function findAppendTarget(
  existing: Array<{ id: string; sourceDocKey?: string | null; sourceKeys?: string[] | null }>,
  sourceKeys: string[],
): string | null {
  for (const set of existing) {
    if (sameSourceSet(sourceKeysOf(set), sourceKeys)) return set.id;
  }
  return null;
}

function collectionFor(kind: StudySetKind): 'flashcardSets' | 'quizSets' {
  return kind === 'quiz' ? 'quizSets' : 'flashcardSets';
}

export async function persistStudySet(deps: PersistDeps, input: PersistInput): Promise<PersistResult> {
  const collectionName = collectionFor(input.kind);
  const itemsField = input.kind === 'quiz' ? 'questions' : 'cards';
  const existing = await deps.listSets(collectionName);
  const targetId = findAppendTarget(existing, input.sourceKeys);

  if (targetId) {
    const target = existing.find((set) => set.id === targetId)!;
    const current = (input.kind === 'quiz' ? target.questions : target.cards) ?? [];
    const merged = [...current, ...input.items];
    await deps.updateSet(collectionName, targetId, {
      [itemsField]: merged,
      ...(input.kind === 'quiz' ? { questionCount: merged.length } : {}),
      updatedAt: nowField(),
    });
    return { setId: targetId, appended: true };
  }

  const data: Record<string, unknown> = {
    name: input.name,
    sourceDocKey: primaryKeyOf(input.sourceKeys),
    sourceKeys: input.sourceKeys,
    [itemsField]: input.items,
    visibility: input.visibility,
    pinned: true,
    createdAt: nowField(),
    updatedAt: nowField(),
  };
  if (input.kind === 'quiz') {
    data.questionTypes = input.questionTypes;
    data.difficulty = input.difficulty;
    data.questionCount = input.items.length;
  }
  const setId = await deps.addSet(collectionName, data);
  return { setId, appended: false };
}
