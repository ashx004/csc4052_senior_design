/** Story 2 quiz-quality comparison. Run from the repository root:
 *   node --env-file=.env --import tsx scripts/quizQualityEval.ts generate [--models=a,b]
 *   node --env-file=.env --import tsx scripts/quizQualityEval.ts summarize <run-dir>/scoring.csv
 *
 * generate: every document × every level × every model, 5 multiple-choice
 * questions per quiz, new prompt only. Documents: scripts/fixtures/queue-lab.txt
 * plus every .txt in scripts/fixtures/quiz-eval/ (add 2 class documents there).
 * Writes raw.json, scoring.csv (fill the last three columns with Y/N) and
 * auto-summary.md to scripts/quiz-eval-results/<timestamp>/.
 *
 * Tell Cameron before running: any model other than the resident
 * OLLAMA_MODEL_MAIN gets loaded on the shared Primary GPU and evicts it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveOllamaBaseUrl } from "../src/library/ollamaClient";
import { generateQuizWithValidation } from "../src/library/quizGeneration";
import { QUIZ_DIFFICULTIES, buildBloomPlan } from "../src/library/quizDifficulty";
import { SCORE_COLUMNS, copiedRatio, parseCsv, summarizeScores, toCsv } from "../src/library/quizEval";

const QUESTIONS_PER_QUIZ = 5;
const FIXTURES = path.join(process.cwd(), "scripts/fixtures");
const modelsArg = process.argv.find((arg) => arg.startsWith("--models="));
const MODELS = (modelsArg ? modelsArg.slice("--models=".length) : "qwen3.6:35b-a3b,qwen3:30b-a3b").split(",").map((m) => m.trim()).filter(Boolean);

interface Run {
  model: string;
  document: string;
  difficulty: string;
  seconds: number;
  planned: string[];
  reported: string[];
  copied: number[];
  error?: string;
}

function loadDocuments() {
  const evalDir = path.join(FIXTURES, "quiz-eval");
  const extra = existsSync(evalDir)
    ? readdirSync(evalDir).filter((f) => f.endsWith(".txt")).sort().map((f) => path.join(evalDir, f))
    : [];
  return [path.join(FIXTURES, "queue-lab.txt"), ...extra].map((file) => ({
    name: path.basename(file),
    text: readFileSync(file, "utf8").slice(0, 50_000), // same cap as /api/generate-quiz
  }));
}

function mix(levels: string[]): string {
  const counts = new Map<string, number>();
  for (const level of levels) counts.set(level || "(none)", (counts.get(level || "(none)") ?? 0) + 1);
  return [...counts].map(([level, n]) => `${level} ${n}`).join(", ");
}

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

async function generate() {
  const docs = loadDocuments();
  if (docs.length < 3) console.warn(`Only ${docs.length} document(s): add 2 class documents as .txt files in scripts/fixtures/quiz-eval/.`);
  const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL || "", process.env.OLLAMA_PRIMARY_FALLBACK_URL);
  const outDir = path.join(process.cwd(), "scripts/quiz-eval-results", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(outDir, { recursive: true });

  const runs: Run[] = [];
  const sheet: (string | number)[][] = [[
    "id", "model", "document", "difficulty", "ai_level", "question", "options", "correct_answer", "explanation", "copied_ratio",
    ...SCORE_COLUMNS,
  ]];
  const raw: unknown[] = [];

  for (const model of MODELS) {
    // resolveModelFromKey reads this on every call, so one process can switch models.
    process.env.OLLAMA_MODEL_MAIN = model;
    for (const doc of docs) {
      for (const difficulty of QUIZ_DIFFICULTIES) {
        const started = Date.now();
        const planned = buildBloomPlan(difficulty, QUESTIONS_PER_QUIZ);
        try {
          const quiz = await generateQuizWithValidation(doc.text, QUESTIONS_PER_QUIZ, { multipleChoice: true }, baseUrl, undefined, [], difficulty);
          const seconds = (Date.now() - started) / 1000;
          const copied = quiz.questions.map((q) => copiedRatio(q.question, doc.text));
          runs.push({ model, document: doc.name, difficulty, seconds, planned, reported: quiz.questions.map((q) => q.bloomLevel ?? ""), copied });
          raw.push({ model, document: doc.name, difficulty, seconds, planned, questions: quiz.questions });
          quiz.questions.forEach((q, i) => {
            sheet.push([
              sheet.length, model, doc.name, difficulty, q.bloomLevel ?? "", q.question, q.options.join(" | "),
              q.correctAnswer, q.explanation ?? "", copied[i].toFixed(2), "", "", "",
            ]);
          });
          console.log(`✓ ${model} | ${doc.name} | ${difficulty} | ${quiz.questions.length} questions | ${seconds.toFixed(1)}s`);
        } catch (error) {
          const seconds = (Date.now() - started) / 1000;
          const message = error instanceof Error ? error.message : String(error);
          runs.push({ model, document: doc.name, difficulty, seconds, planned, reported: [], copied: [], error: message });
          raw.push({ model, document: doc.name, difficulty, seconds, planned, error: message });
          console.log(`✗ ${model} | ${doc.name} | ${difficulty} | ${message}`);
        }
      }
    }
  }

  const lines = [
    "# Quiz quality eval — automatic measures",
    "",
    "| Model | Level | Quizzes OK | Avg seconds | Avg copied ratio | Planned levels | AI-reported levels |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const model of MODELS) {
    for (const difficulty of QUIZ_DIFFICULTIES) {
      const group = runs.filter((r) => r.model === model && r.difficulty === difficulty);
      const ok = group.filter((r) => !r.error);
      lines.push(`| ${model} | ${difficulty} | ${ok.length}/${group.length} | ${average(ok.map((r) => r.seconds)).toFixed(1)} | ${average(ok.flatMap((r) => r.copied)).toFixed(2)} | ${mix(ok.flatMap((r) => r.planned))} | ${mix(ok.flatMap((r) => r.reported))} |`);
    }
  }

  writeFileSync(path.join(outDir, "raw.json"), JSON.stringify(raw, null, 2));
  writeFileSync(path.join(outDir, "scoring.csv"), toCsv(sheet));
  writeFileSync(path.join(outDir, "auto-summary.md"), lines.join("\n") + "\n");
  console.log(`\nWrote ${outDir}\nNext: fill ${SCORE_COLUMNS.join(", ")} with Y/N in scoring.csv, then run "summarize".`);
}

function summarize(csvPath: string | undefined) {
  if (!csvPath) throw new Error("Usage: summarize <path to filled scoring.csv>");
  const table = summarizeScores(parseCsv(readFileSync(csvPath, "utf8")));
  const lines = [
    "# Quiz quality eval — human checklist (yes / answered)",
    "",
    "| Model | Level | Questions | Correct Bloom level | Believable wrong answers | Only one right answer |",
    "|---|---|---|---|---|---|",
    ...table.map((r) => `| ${r.model} | ${r.difficulty} | ${r.scored} | ${r.level_correct} | ${r.distractors_plausible} | ${r.one_right_answer} |`),
  ];
  const out = path.join(path.dirname(csvPath), "scores-summary.md");
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.log(`\nWrote ${out}`);
}

async function main() {
  const command = process.argv[2];
  if (command === "generate") await generate();
  else if (command === "summarize") summarize(process.argv[3]);
  else console.log('Usage: scripts/quizQualityEval.ts generate [--models=a,b] | summarize <scoring.csv>');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
