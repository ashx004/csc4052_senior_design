/** Story 2 quiz-quality comparison. Run from the repository root:
 *   node --env-file=.env --import tsx scripts/quizQualityEval.ts generate [--models=a,b]
 *   node --env-file=.env --import tsx scripts/quizQualityEval.ts summarize <run-dir>/scoring.csv
 *   node --env-file=.env --import tsx scripts/quizQualityEval.ts coverage <a.txt> <b.txt> [more.txt] [--count=10]
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
import { generateAcrossSources } from "../src/library/generation/orchestrator";
import { quoteIsGrounded, verifyGrounding } from "../src/library/generation/verify";
import { PER_SOURCE_CHAR_BUDGET } from "../src/library/sources/resolveSources";
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

/**
 * Multi-source coverage: one quiz from several fixtures through the same
 * generateAcrossSources call the route makes. Prints requested vs produced
 * per source and the share of questions whose sourceQuote is really in that
 * source's text. Exits non-zero if any source produced no questions.
 */
async function coverage(args: string[]) {
  const files = args.filter((a) => !a.startsWith("--"));
  if (files.length < 2) throw new Error("Usage: coverage <fixture.txt> <fixture.txt> [more.txt] [--count=10]");
  const countArg = args.find((a) => a.startsWith("--count="));
  const count = countArg ? Number(countArg.slice("--count=".length)) : 10;
  if (!Number.isInteger(count) || count < 1) throw new Error(`Bad --count: ${countArg}`);

  const sources = files.map((file) => ({
    title: path.basename(file),
    resourceId: null,
    sourceKey: null,
    text: readFileSync(file, "utf8").trim().slice(0, PER_SOURCE_CHAR_BUDGET),
    pages: [],
    viaRetrieval: false,
  }));
  const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL || "", process.env.OLLAMA_PRIMARY_FALLBACK_URL);

  // Counted inside the generate callback, keyed by the source being generated,
  // so nothing depends on the order or shuffling of the final item list.
  // Backfill makes several calls per source; the counts add up.
  const stats = new Map<unknown, { raw: number; rejected: number; leaks: number }>();

  const started = Date.now();
  const result = await generateAcrossSources({
    sources,
    count,
    // Keep in sync with api/generate-quiz/route.ts. Mirrored: shuffle:false (source order kept). NOT mirrored: the
    // route passes the caller's difficulty (parseQuizDifficulty, default only when absent), modelKey and avoid
    // questions; this eval passes undefined / none.
    shuffle: false,
    generate: async (source, quota, alreadyAsked) => {
      const quiz = await generateQuizWithValidation(source.text, quota, { multipleChoice: true }, baseUrl, undefined, alreadyAsked, undefined);
      const { kept } = verifyGrounding(quiz.questions, source.text);
      // A quote that also appears in ANOTHER source (overlapping fixtures)
      // could be credited to the wrong document.
      const leaks = kept.filter((q) => sources.some((other) => other !== source && quoteIsGrounded(q.sourceQuote ?? "", other.text))).length;
      const entry = stats.get(source) ?? { raw: 0, rejected: 0, leaks: 0 };
      entry.raw += quiz.questions.length;
      entry.rejected += quiz.questions.length - kept.length;
      entry.leaks += leaks;
      stats.set(source, entry);
      return { topicName: quiz.topicName, items: quiz.questions };
    },
  });
  const seconds = (Date.now() - started) / 1000;

  const lines = [`Multi-source coverage: ${sources.length} sources, ${count} questions requested, ${result.items.length} produced, ${seconds.toFixed(1)}s`, ""];
  const empty: string[] = [];
  result.audit.forEach((entry, i) => {
    const s = stats.get(sources[i]) ?? { raw: 0, rejected: 0, leaks: 0 };
    lines.push(`${entry.title}: requested ${entry.requested}, produced ${entry.produced} | valid after schema+dedupe ${s.raw}, grounding rejected ${s.rejected} | quote also found in another source ${s.leaks}`);
    if (entry.produced === 0) empty.push(entry.title);
  });
  console.log(lines.join("\n"));

  if (empty.length > 0) {
    console.error(`\nFAIL: no questions produced for: ${empty.join(", ")}`);
    process.exit(1);
  }
}

async function main() {
  const command = process.argv[2];
  if (command === "generate") await generate();
  else if (command === "coverage") await coverage(process.argv.slice(3));
  else if (command === "summarize") summarize(process.argv[3]);
  else console.log('Usage: scripts/quizQualityEval.ts generate [--models=a,b] | summarize <scoring.csv> | coverage <a.txt> <b.txt> [--count=N]');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
