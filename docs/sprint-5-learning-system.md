# Sprint 5: state of the learning system (Cameron <-> Iris sync)

Written so Cameron can send it to Iris. Covers what each of us has built, where the
two pieces touch, and what to agree on before merging.

## What Iris has (branch `Iris_sprint5_weakConcept_flashcard_quiz_improve`, not merged to main yet)

- Quiz difficulty levels `review | exam | challenge`, each a Bloom's-taxonomy mix
  (`src/library/quizDifficulty.ts`), asked for in `QuizSetupModal` and stored on the
  quiz as `difficulty`.
- Quiz generation rewritten around a per-question Bloom plan (`quizGeneration.ts`),
  plus a quality evaluator (`quizEval.ts`, `scripts/quizQualityEval.ts`).
- She already works around an open Ollama bug: JSON **schema** `format` together with
  `think:false` crashes qwen3.6 (ollama/ollama#17434), so quiz generation uses JSON mode.

## What Cameron has added on `cams_sprint_5`

New and separate from the quiz code, so it should not collide with the above:

| Area | Where |
| --- | --- |
| Practice types: fill in the blank, word problems, click-and-drag with a timer | `src/library/practice/*`, `src/components/practice/*` |
| Pages | `/courses/[id]/practice` (hub + generator), `/courses/[id]/practice/[setId]` (play + results) |
| API | `POST /api/generate-practice`, `POST /api/grade-practice` |
| Data | `users/{uid}/enrollment/{courseId}/practiceSets/{setId}` and its `attempts` subcollection |
| Chat transparency | live reasoning + tool steps, Stop button (`thoughtRelay`, `chatLive`, `chatRuns`, `/api/chat/stop`) |
| Syllabus | exams -> calendar, editable dates, "Edit syllabus details" (`syllabusCalendar*`) |

## Where we touch

1. **Difficulty vocabulary.** Practice uses the same three level names and labels as
   Iris's quiz levels (`review`, `exam`, `challenge`; "Review", "Exam-style", "Challenge").
   Practice currently carries a short prompt note per level (`practice/generation.ts`);
   once her branch is merged it could call `buildBloomPlan` and share
   `quizDifficulty.ts` so both systems mean the same thing by "Challenge".
2. **`structuredGeneration.ts`.** One small change: the `feature` option also accepts
   `"practice"` (it uses the quiz think setting and its own `X-Catalyst-Feature` header).
   Iris's branch does not edit this file.
3. **`api/chat/route.ts`.** Both branches edit it in different places (hers: one import
   and one `difficulty` field; Cameron's: streaming, tools, stop). A merge tree check
   of the two branches shows no conflicts.
4. **Mastery and study plan.** Practice attempts are saved but are **not** fed into the
   mastery engine, weak-concept suggestions or study plan. That engine is built around
   quiz attempts (`learningProgressService.submitQuizResult`) and is Iris's area, so
   hooking practice in should be agreed with her first. The practice attempt document is
   `{ score, total, percent, durationMs, points?, results: [{ itemId, score, response, seconds? }], completedAt }`.
   Each item has a stable `id`, so per-question results can be mapped to concepts later.

## Things Iris should know

- **The qwen3.6 crashes she reported are fixed on the server.** The cause was Ollama's
  flash-attention code (cold-start crashes in 4 of 10 loads with it on, none in 10 with
  it off). The server now runs with flash attention off and an f16 KV cache. Cost: a few
  percent of the model sits in CPU RAM and replies are slightly slower. She can retest.
- Whether the JSON-schema + `think:false` workaround is still needed is worth re-checking
  now that the model is stable, but it is a separate open Ollama issue.

## Open questions for Iris

1. Share `quizDifficulty.ts` between quizzes and practice after her merge?
2. Should practice results count toward mastery / weak concepts, and through which API?
3. Do generated practice sets belong on the study-plan suggestion cards the way quizzes do?
