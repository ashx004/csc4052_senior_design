/** Catalyst primary-model bake-off. Run from the repository root with:
 * node --env-file=.env --import tsx scripts/modelBenchmark.ts
 *
 * The parent process runs each model in a fresh child so model-dependent
 * module constants (notably advising) use the intended candidate.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MODELS = [
  "qwen3:30b-a3b",
  "glm-4.7-flash:Q4_K_M",
  "gemma4:26b",
  "qwen3.5:35b-a3b",
  "nemotron-cascade-2:30b",
];
const source = readFileSync(new URL("./fixtures/queue-lab.txt", import.meta.url), "utf8");
const now = () => Number(process.hrtime.bigint()) / 1e9;

function safeName(model: string) { return model.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }
function errText(error: unknown) { return error instanceof Error ? error.message : String(error); }
function docker(...args: string[]) { return execFileSync("docker", args, { encoding: "utf8" }).trim(); }

async function ollamaChat(baseUrl: string, model: string, body: Record<string, unknown>) {
  const started = now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OLLAMA_AUTH_TOKEN}` },
    body: JSON.stringify({ model, stream: false, keep_alive: "20m", options: { temperature: 0, num_ctx: 16384, num_predict: 700 }, ...body }),
    signal: AbortSignal.timeout(300_000),
  });
  const data: any = await response.json();
  if (!response.ok || data.error) throw new Error(`Ollama ${response.status}: ${data.error || JSON.stringify(data).slice(0, 300)}`);
  return {
    content: String(data.message?.content || "").trim(),
    thinking: String(data.message?.thinking || "").trim(),
    toolCalls: data.message?.tool_calls || [],
    wallSeconds: now() - started,
    outputTokens: Number(data.eval_count || 0),
    tokensPerSecond: data.eval_duration ? Number((data.eval_count * 1e9 / data.eval_duration).toFixed(2)) : null,
    promptTokensPerSecond: data.prompt_eval_duration ? Number((data.prompt_eval_count * 1e9 / data.prompt_eval_duration).toFixed(2)) : null,
  };
}

async function runWorker(model: string) {
  process.env.OLLAMA_MODEL_MAIN = model;
  process.env.OLLAMA_MODEL_ADVISING = model;
  process.env.OLLAMA_MAIN_NUM_CTX = "16384";
  process.env.ADVISING_NUM_CTX = "16384";
  process.env.OLLAMA_THINK_QUIZ = "off";
  process.env.OLLAMA_THINK_FLASHCARDS = "off";
  process.env.ADVISING_THINK_MODE = "omit";

  const [{ resolveOllamaBaseUrl }, { buildSystemPrompt }, { generateFlashcardsWithRetry }, { generateQuizWithValidation }, { generateScheduleWithOllama }, { generatedAdvisingScheduleSchema }] = await Promise.all([
    import("../src/library/ollamaClient"), import("../src/library/systemPrompt"), import("../src/library/flashcardGeneration"),
    import("../src/library/quizGeneration"), import("../src/library/advisingOllama"), import("../src/library/advisingSchemas"),
  ]);
  const baseUrl = await resolveOllamaBaseUrl(process.env.OLLAMA_PRIMARY_URL!, process.env.OLLAMA_PRIMARY_FALLBACK_URL);
  const result: any = { model, startedAt: new Date().toISOString(), tests: {}, errors: [] };
  const capture = async (name: string, fn: () => Promise<unknown>) => {
    const started = now();
    try { result.tests[name] = { ok: true, wallSeconds: Number((now() - started).toFixed(2)), ...(await fn() as object) }; }
    catch (error) { result.tests[name] = { ok: false, wallSeconds: Number((now() - started).toFixed(2)), error: errText(error) }; result.errors.push(`${name}: ${errText(error)}`); }
  };

  const context = { userId: "model-eval", email: "student@example.invalid", name: "Jordan", college: "Synthetic Test College", timeZone: "America/Chicago", classes: [{ classId: "csc301", classCode: "CSC 301", className: "Data Structures", term: "Fall 2026", facultyName: "Dr. Rowan Vale", facultyEmail: "", facultyPhoneNumber: "", facultyOfficeNumber: "", documents: [{ resourceId: "queue", name: "Queue Lab.txt", fileType: "txt", category: "notes", url: "/fixture" }] }] };
  const system = buildSystemPrompt(context as any, undefined, false, null);

  const hallucinationCases = [
    { prompt: "What is Dr. Rowan Vale's email address?", forbidden: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i },
    { prompt: "Summarize the findings of the 2025 Northbridge Isotope Learning Study by Dr. Elian Voss and cite its DOI.", forbidden: /10\.\d{4,9}\//i },
    { prompt: "What date is the CSC 301 final exam?", forbidden: /(?:oct|nov|dec)[a-z]*\s+\d{1,2}|\d{1,2}[\/-]\d{1,2}/i },
    { prompt: "Give me the direct download link for Queue Lab.txt.", forbidden: /https?:\/\//i },
  ];
  await capture("hallucination", async () => {
    const trials = [];
    for (const c of hallucinationCases) {
      const r = await ollamaChat(baseUrl, model, { think: true, messages: [{ role: "system", content: system }, { role: "user", content: c.prompt }] });
      trials.push({ prompt: c.prompt, pass: !c.forbidden.test(r.content), response: r.content, tokensPerSecond: r.tokensPerSecond, wallSeconds: r.wallSeconds });
    }
    return { passed: trials.filter(x => x.pass).length, total: trials.length, trials };
  });

  const tools: any[] = [
    { type: "function", function: { name: "create_note", description: "Create a student note only when explicitly requested.", parameters: { type: "object", properties: { title: { type: "string" }, markdown: { type: "string" }, courseId: { type: "string" } }, required: ["title", "markdown"] } } },
    { type: "function", function: { name: "create_calendar_event", description: "Create a calendar event.", parameters: { type: "object", properties: { title: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" } }, required: ["title", "startTime"] } } },
    { type: "function", function: { name: "delete_note", description: "Prepare deletion of a note explicitly requested by the student.", parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } } },
  ];
  const toolCases = [
    { prompt: "Create a note titled Queue recap with one bullet saying FIFO removes the oldest item.", expected: "create_note", validate: (a: any) => a.title === "Queue recap" && /FIFO/i.test(a.markdown || "") },
    { prompt: "Add Queue review to my calendar on October 6, 2026 from 2 PM to 3 PM.", expected: "create_calendar_event", validate: (a: any) => /Queue review/i.test(a.title || "") && /2026-10-06/.test(a.startTime || "") },
    { prompt: "Do not delete my Queue recap note. Just tell me what FIFO means.", expected: null, validate: () => true },
  ];
  await capture("toolCalling", async () => {
    const trials = [];
    for (const c of toolCases) {
      const r = await ollamaChat(baseUrl, model, { think: true, tools, messages: [{ role: "system", content: system }, { role: "user", content: c.prompt }] });
      const call = r.toolCalls[0]?.function;
      const pass = c.expected ? call?.name === c.expected && c.validate(call.arguments || {}) : r.toolCalls.length === 0;
      trials.push({ prompt: c.prompt, expected: c.expected, actual: call?.name || null, arguments: call?.arguments || null, pass, tokensPerSecond: r.tokensPerSecond, wallSeconds: r.wallSeconds, content: r.content });
    }
    return { passed: trials.filter(x => x.pass).length, total: trials.length, trials };
  });

  await capture("flashcards", async () => {
    const started = now();
    const cards = await generateFlashcardsWithRetry(source, baseUrl, undefined);
    const text = JSON.stringify(cards);
    const unique = new Set(cards.questions.map(x => x.question.toLowerCase())).size;
    const keyFacts = ["17", "ZEPHYR-47", "FIFO", "O(1)", "O(V + E)"].filter(x => text.toLowerCase().includes(x.toLowerCase()));
    return { generationSeconds: Number((now() - started).toFixed(2)), count: cards.questions.length, unique, keyFacts, topicName: cards.topicName, sample: cards.questions.slice(0, 3) };
  });

  await capture("quiz", async () => {
    const started = now();
    const quiz = await generateQuizWithValidation(source, 10, { multipleChoice: true }, baseUrl, undefined);
    const text = JSON.stringify(quiz);
    const keyFacts = ["17", "ZEPHYR-47", "FIFO", "O(1)", "O(V + E)"].filter(x => text.toLowerCase().includes(x.toLowerCase()));
    return { generationSeconds: Number((now() - started).toFixed(2)), count: quiz.questions.length, unique: new Set(quiz.questions.map(x => x.question.toLowerCase())).size, keyFacts, topicName: quiz.topicName, sample: quiz.questions.slice(0, 3) };
  });

  const req = (id: string, code: string, title: string, prereq: string[] = []) => ({ requirementId: id, requirementName: title, description: `Complete ${code}`, requirementType: "specific-course", numberRequired: 1, creditsRequired: 3, courseCode: code, courseTitle: title, prerequisites: prereq, corequisites: [], courseOptions: [], optionsExplicitlyListed: true, sourceText: `${code} is required`, minimumGrade: null, eligibilityRules: null });
  const availability: any = {
    "CSC 310": [{ term: "Fall", year: 2026, offered: true }, { term: "Winter", year: 2027, offered: false }],
    "CSC 320": [{ term: "Fall", year: 2026, offered: false }, { term: "Winter", year: 2027, offered: true }],
    "MAT 210": [{ term: "Fall", year: 2026, offered: true }, { term: "Winter", year: 2027, offered: true }],
    "CSC 450": [{ term: "Fall", year: 2026, offered: false }, { term: "Winter", year: 2027, offered: false }],
  };
  await capture("advising", async () => {
    const started = now();
    const raw = await generateScheduleWithOllama({ transcriptCourses: [{ courseCode: "CSC 200", status: "completed" }], remainingRequirements: [req("r310", "CSC 310", "Algorithms"), req("r320", "CSC 320", "Operating Systems", ["CSC 310"]), req("rmat", "MAT 210", "Discrete Math"), req("r450", "CSC 450", "Capstone")], futureTerms: [{ term: "Fall", year: 2026 }, { term: "Winter", year: 2027 }], courseAvailability: availability });
    const parsed = generatedAdvisingScheduleSchema.parse(JSON.parse(raw));
    const scheduled = parsed.terms.flatMap(t => t.courses.map(c => ({ ...c, term: t.term, year: t.year })));
    const invented = scheduled.filter(c => !availability[c.courseCode]);
    const unavailable = scheduled.filter(c => !availability[c.courseCode]?.some((a: any) => a.term === c.term && a.year === c.year && a.offered));
    const overloads = parsed.terms.filter(t => t.courses.reduce((n, c) => n + (c.creditHours || 0), 0) > 13);
    const i310 = scheduled.findIndex(c => c.courseCode === "CSC 310"), i320 = scheduled.findIndex(c => c.courseCode === "CSC 320");
    const prerequisiteOk = i320 < 0 || (i310 >= 0 && (scheduled[i310].year < scheduled[i320].year || (scheduled[i310].year === scheduled[i320].year && ["Fall","Winter","Spring","Summer"].indexOf(scheduled[i310].term) < ["Fall","Winter","Spring","Summer"].indexOf(scheduled[i320].term))));
    return { generationSeconds: Number((now() - started).toFixed(2)), valid: !invented.length && !unavailable.length && !overloads.length && prerequisiteOk, invented, unavailable, overloads: overloads.map(t => `${t.term} ${t.year}`), prerequisiteOk, schedule: parsed };
  });

  await capture("parallelThroughput", async () => {
    const prompt = `Using only this source, explain FIFO in 120-160 words and state the Aster capacity and overflow code.\n\n${source}`;
    const started = now();
    const runs = await Promise.all(Array.from({ length: 4 }, () => ollamaChat(baseUrl, model, { think: false, options: { temperature: 0, num_ctx: 16384, num_predict: 240 }, messages: [{ role: "user", content: prompt }] })));
    const wall = now() - started, tokens = runs.reduce((n, x) => n + x.outputTokens, 0);
    return { wallSeconds: Number(wall.toFixed(2)), outputTokens: tokens, aggregateTokensPerSecond: Number((tokens / wall).toFixed(2)), individualTokensPerSecond: runs.map(x => x.tokensPerSecond) };
  });

  try { result.ollamaPs = docker("exec", "ollama-primary", "ollama", "ps"); } catch (e) { result.ollamaPs = errText(e); }
  try { result.gpus = docker("exec", "ollama-primary", "nvidia-smi", "--query-gpu=index,name,memory.total,memory.used", "--format=csv,noheader"); } catch (e) { result.gpus = errText(e); }
  result.finishedAt = new Date().toISOString();
  return result;
}

async function main() {
  const worker = process.argv.indexOf("--worker");
  if (worker >= 0) {
    const model = process.argv[worker + 1], output = process.argv[worker + 2];
    const result = await runWorker(model);
    writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(`MODEL_RESULT ${model} ${output}`);
    return;
  }
  const script = fileURLToPath(import.meta.url);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = `scripts/model-benchmark-${stamp}`;
  mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const model of MODELS) {
    console.log(`\n=== ${model} ===`);
    try { docker("exec", "ollama-primary", "ollama", "stop", model); } catch {}
    const output = `${outDir}/${safeName(model)}.json`;
    const child = spawnSync(process.execPath, ["--env-file=.env", "--import", "tsx", script, "--worker", model, output], { stdio: "inherit", env: { ...process.env, MODEL_BENCHMARK: "1" }, timeout: 1_800_000 });
    if (child.status !== 0) console.error(`${model} worker exited ${child.status}`);
    try { results.push(JSON.parse(readFileSync(output, "utf8"))); } catch (e) { results.push({ model, fatalError: errText(e) }); }
  }
  const summary = results.map((r: any) => ({ model: r.model, hallucination: r.tests?.hallucination ? `${r.tests.hallucination.passed}/${r.tests.hallucination.total}` : "FAIL", tools: r.tests?.toolCalling ? `${r.tests.toolCalling.passed}/${r.tests.toolCalling.total}` : "FAIL", flashcardsSeconds: r.tests?.flashcards?.generationSeconds ?? null, quizSeconds: r.tests?.quiz?.generationSeconds ?? null, advisingValid: r.tests?.advising?.valid ?? false, advisingSeconds: r.tests?.advising?.generationSeconds ?? null, parallelTokensPerSecond: r.tests?.parallelThroughput?.aggregateTokensPerSecond ?? null, errors: r.errors?.length ?? 1 }));
  writeFileSync(`${outDir}/summary.json`, JSON.stringify({ generatedAt: new Date().toISOString(), context: 16384, parallel: 4, results: summary }, null, 2));
  writeFileSync(`${outDir}/README.md`, `# Catalyst model benchmark\n\nGenerated ${new Date().toISOString()} against Ollama with 16,384-token context and four parallel slots.\n\n| Model | Hallucination | Tools | Flashcards s | Quiz s | Advising valid | Advising s | Parallel tok/s | Errors |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${summary.map((r: any) => `| ${r.model} | ${r.hallucination} | ${r.tools} | ${r.flashcardsSeconds ?? "—"} | ${r.quizSeconds ?? "—"} | ${r.advisingValid ? "yes" : "no"} | ${r.advisingSeconds ?? "—"} | ${r.parallelTokensPerSecond ?? "—"} | ${r.errors} |`).join("\n")}\n`);
  console.table(summary);
  console.log(`Reports: ${outDir}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
