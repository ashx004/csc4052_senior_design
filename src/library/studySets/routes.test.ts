import { describe, expect, it } from 'vitest';
import { resolveLegacyFlashcardQuery, studySetRoutes } from './routes';

describe('studySetRoutes', () => {
  it('encodes course and saved-set IDs in every route', () => {
    const routes = studySetRoutes('bio 240');
    expect(routes.hub).toBe('/courses/bio%20240/learning');
    expect(routes.flashcards).toBe('/courses/bio%20240/flashcards');
    expect(routes.flashcard('set/1')).toBe('/courses/bio%20240/flashcards/set%2F1');
    expect(routes.quizzes).toBe('/courses/bio%20240/quizzes');
    expect(routes.quiz('quiz & 1')).toBe('/courses/bio%20240/quizzes/quiz%20%26%201');
  });

  it('sends an old setId link to the viewer and leaves document creation on the library', () => {
    const params = new URLSearchParams('setId=set/1&taskId=task 2');
    expect(resolveLegacyFlashcardQuery('bio 240', params)).toBe('/courses/bio%20240/flashcards/set%2F1?taskId=task%202');
    expect(resolveLegacyFlashcardQuery('bio 240', new URLSearchParams('docId=doc-1&docName=Lecture'))).toBeNull();
  });
});
