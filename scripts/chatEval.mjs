#!/usr/bin/env node
// End-to-end regression suite for the AI chat. Signs in as a test student,
// sends each case through the real /api/chat route (routing, tools, output
// guard and all), and checks the reply three ways:
//   - which tools ran (the route's own stream events),
//   - what the reply says (required / forbidden patterns, plus global checks
//     for leaked IDs, tool names and made-up links),
//   - what actually changed in Firestore (events, notes, quizzes, ratings).
// Unlike scripts/evalPrompt.ts (prompt + model only, fixture data), this
// exercises the whole stack against a real account, so it catches wrong
// time zones, duplicate writes and stale data - the bugs found in the
// 2026-09-25 audit.
//
// Usage (dev server running, test account with some classes and files):
//   EVAL_EMAIL=... EVAL_PASSWORD=... node --env-file=.env scripts/chatEval.mjs
// Options:
//   --url http://localhost:3000   the site to test
//   --only id1,id2                run just these cases
//   --repeat 3                    run the whole suite N times (flakiness check)
//   --keep                        skip cleanup of what the run created
//   --verbose                     print every turn's reply
//   --cases path.json             another case file
// Exit code is 1 if any case fails. A JSON report is written next to the
// case file.
//
// Cleanup: everything the run creates (events, typed notes, notebooks,
// study sets, PDFs tagged by the chat, chat sessions, confidence ratings) is
// found by creation time and removed afterwards. Only point this at a TEST
// account.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const BASE_URL = opt("url", process.env.EVAL_URL || "http://localhost:3000").replace(/\/$/, "");
const CASES_PATH = path.resolve(opt("cases", path.join(path.dirname(new URL(import.meta.url).pathname), "chatEval.cases.json")));
const ONLY = opt("only", "") ? new Set(opt("only", "").split(",")) : null;
const REPEAT = Math.max(1, Number(opt("repeat", "1")) || 1);
const KEEP = flag("keep");
const VERBOSE = flag("verbose");
const PROJECT = "studora-933f8";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DEFAULT_TZ = process.env.EVAL_TIMEZONE || "America/Chicago";

const { EVAL_EMAIL, EVAL_PASSWORD, NEXT_PUBLIC_FIREBASE_API_KEY: API_KEY } = process.env;
if (!EVAL_EMAIL || !EVAL_PASSWORD || !API_KEY) {
  console.error("Set EVAL_EMAIL and EVAL_PASSWORD, and run with --env-file=.env (for NEXT_PUBLIC_FIREBASE_API_KEY).");
  process.exit(2);
}

// ── Firebase ─────────────────────────────────────────────────────────────

async function signIn() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EVAL_EMAIL, password: EVAL_PASSWORD, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sign-in failed: ${data?.error?.message ?? res.status}`);
  return { idToken: data.idToken, uid: data.localId, email: data.email };
}

function plain(v) {
  if (!v || typeof v !== "object") return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(plain);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)]));
  return undefined;
}
const docOf = (d) => ({ id: d.name.split("/").pop(), path: d.name.split("/documents/")[1], ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, plain(v)])) });

function firestore(auth) {
  const H = { Authorization: `Bearer ${auth.idToken}` };
  return {
    async list(p) {
      const out = [];
      let token = "";
      do {
        const res = await fetch(`${FIRESTORE}/users/${auth.uid}/${p}?pageSize=300${token ? `&pageToken=${token}` : ""}`, { headers: H });
        const data = await res.json();
        out.push(...(data.documents ?? []).map(docOf));
        token = data.nextPageToken ?? "";
      } while (token);
      return out;
    },
    async get(p) {
      const res = await fetch(`${FIRESTORE}/users/${auth.uid}${p ? `/${p}` : ""}`, { headers: H });
      return res.ok ? docOf(await res.json()) : null;
    },
    async remove(fullPath) {
      const res = await fetch(`${FIRESTORE}/${fullPath}`, { method: "DELETE", headers: H });
      return res.ok;
    },
  };
}

/** The same shape the pages send (see src/library/chatContext.ts); the
 *  route re-reads class details itself, so this only needs the basics. */
async function buildContext(auth, db) {
  const profile = (await db.get("")) ?? {};
  const classes = [];
  for (const c of await db.list("enrollment")) {
    const resources = await db.list(`enrollment/${c.id}/resources`);
    classes.push({
      classId: c.id,
      className: c.className ?? "",
      classCode: c.classCode ?? "",
      term: c.term ?? "",
      facultyName: c.facultyName ?? "",
      facultyEmail: c.facultyEmail ?? "",
      facultyPhoneNumber: c.facultyPhoneNumber ?? "",
      facultyOfficeNumber: c.facultyOfficeNumber ?? "",
      classSchedule: c.classSchedule ?? "",
      time: c.time ?? "",
      classRoom: c.classRoom ?? "",
      classDescription: c.classDescription ?? "",
      status: c.status === "completed" ? "completed" : "active",
      documents: resources.map((r) => ({
        resourceId: r.id,
        name: r.name ?? "Untitled",
        fileType: r.fileType ?? "",
        category: r.category ?? "",
        url: r.url ?? "",
        vectorIndexed: r.vectorIndexed === true,
        ...(r.indexStatus ? { indexStatus: r.indexStatus } : {}),
        ...(r.resourceKind === "ocr_document" ? { ocrScanned: true } : {}),
      })),
    });
  }
  return { userId: auth.uid, email: auth.email, name: profile.name ?? profile.displayName ?? "", college: profile.college ?? "", classes };
}

// ── Chat ─────────────────────────────────────────────────────────────────

async function chat(auth, context, messages, timeZone, pendingActionIds = []) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` },
    body: JSON.stringify({ messages, context: { ...context, timeZone }, pendingActionIds }),
  });
  if (!res.ok || !res.body) return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, tools: [], text: "", secs: 0 };
  const out = { tools: [], text: "", error: null, done: null };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        if (e.type === "delta") out.text += e.text;
        else if (e.type === "tool") out.tools.push(e.name);
        else if (e.type === "error") out.error = e.error;
        else if (e.type === "done") out.done = e;
      } catch {
        /* partial line */
      }
    }
  }
  out.secs = Math.round((Date.now() - t0) / 100) / 10;
  return out;
}

// ── Expected times ───────────────────────────────────────────────────────
// Cases describe times the way a student would ("next Tuesday 14:00"), in
// the case's time zone; these resolve them to the UTC the app should store.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function localParts(date, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long", hourCycle: "h23" })
      .formatToParts(date)
      .map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day, wd: WEEKDAYS.indexOf(p.weekday.toLowerCase()) };
}
function zoneOffsetMs(ms, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
/** "{today}", "{tomorrow}", "{next:tuesday}", "{this:sunday}" + " HH:MM" -> UTC ISO. */
function resolveLocal(spec, timeZone, now = new Date()) {
  const m = /^\{(today|tomorrow|next:\w+|this:\w+)\}(?:\s+(\d{1,2}):(\d{2}))?$/.exec(spec.trim());
  if (!m) throw new Error(`Bad time spec "${spec}"`);
  const today = localParts(now, timeZone);
  let add = 0;
  if (m[1] === "tomorrow") add = 1;
  else if (m[1] !== "today") {
    const [kind, day] = m[1].split(":");
    const target = WEEKDAYS.indexOf(day.toLowerCase());
    add = (target - today.wd + 7) % 7;
    if (kind === "next" && add === 0) add = 7;
  }
  const guess = Date.UTC(today.y, today.m - 1, today.d + add, Number(m[2] ?? 0), Number(m[3] ?? 0));
  let ms = guess - zoneOffsetMs(guess, timeZone);
  ms = guess - zoneOffsetMs(ms, timeZone);
  return new Date(ms).toISOString();
}

// ── Checks ───────────────────────────────────────────────────────────────

const TOOL_NAMES = /\b(list_notes|read_note|create_note|edit_note|organize_notes|delete_note|get_course_\w+|update_course_details|set_self_confidence|list_calendar_events|create_calendar_event|update_calendar_event|delete_calendar_event|read_document|search_documents|load_tools|list_study_sets|list_enrolled_classes)\b/;
const FAKE_LINKS = /\]\(\/download\/|\]\(#\)|canvas\.latech|blackboard\.latech/i;

async function checkDb(db, check, tz, run) {
  const re = (s) => new RegExp(s, "i");
  if (check.event) {
    // Only events this run created: the account may already have look-alikes.
    const before = new Set((globalThis.__evalEventsBefore ?? []).map((x) => x.id));
    const e = (await db.list("events")).find((x) => !before.has(x.id) && re(check.event.title).test(x.title ?? ""));
    if (!e) return `no event matching /${check.event.title}/`;
    if (check.event.start && e.startTime !== resolveLocal(check.event.start, tz)) return `event starts ${e.startTime}, expected ${resolveLocal(check.event.start, tz)}`;
    if (check.event.end && e.endTime !== resolveLocal(check.event.end, tz)) return `event ends ${e.endTime}, expected ${resolveLocal(check.event.end, tz)}`;
  }
  if (check.eventAbsent && (await db.list("events")).some((x) => re(check.eventAbsent).test(x.title ?? ""))) return `event /${check.eventAbsent}/ still exists`;
  if (check.eventCount) {
    const n = (await db.list("events")).filter((x) => re(check.eventCount.title).test(x.title ?? "")).length;
    if (n !== check.eventCount.count) return `${n} events match /${check.eventCount.title}/, expected ${check.eventCount.count}`;
  }
  if (check.note) {
    const n = (await db.list("notes")).find((x) => x.title === check.note.title && !x.hidden);
    if (!n) return `no note titled "${check.note.title}"`;
    if (check.note.contains && !re(check.note.contains).test(n.plainText ?? "")) return `note "${check.note.title}" doesn't contain /${check.note.contains}/`;
    if (check.note.notContains && re(check.note.notContains).test(n.plainText ?? "")) return `note "${check.note.title}" still contains /${check.note.notContains}/`;
  }
  if (check.noteAbsent && (await db.list("notes")).some((x) => x.title === check.noteAbsent && !x.hidden)) return `note "${check.noteAbsent}" still exists`;
  if (check.quizQuestions !== undefined) {
    const set = (run.done?.generatedStudySets ?? []).find((s) => s.kind === "quiz");
    if (!set) return "no quiz was created";
    const quiz = await db.get(`enrollment/${set.courseId}/quizSets/${set.id}`);
    if ((quiz?.questions ?? []).length !== check.quizQuestions) return `quiz has ${(quiz?.questions ?? []).length} questions, expected ${check.quizQuestions}`;
  }
  if (check.selfRating) {
    const cls = (await db.list("enrollment")).find((c) => c.classCode === check.selfRating.classCode);
    const doc = cls && (await db.get(`courseConfidence/${cls.id}`));
    if (doc?.level !== check.selfRating.level) return `${check.selfRating.classCode} rating is ${doc?.level}, expected ${check.selfRating.level}`;
  }
  if (check.courseField) {
    const cls = (await db.list("enrollment")).find((c) => c.classCode === check.courseField.classCode);
    if (cls?.[check.courseField.field] !== check.courseField.equals) return `${check.courseField.classCode}.${check.courseField.field} is "${cls?.[check.courseField.field]}", expected "${check.courseField.equals}"`;
  }
  return null;
}

const CLAIMED_DONE = /\b(i've|i have|has been|have been|was|is now)\s+(deleted|removed|moved|rescheduled|updated|changed|rewritten|rewrote)\b/i;

async function runCase(c, auth, db, context, internalIds) {
  const tz = c.timeZone ?? DEFAULT_TZ;
  const messages = [];
  let run;
  const cardsById = new Map();
  for (const turn of c.turns ?? [c.q]) {
    messages.push({ role: "user", content: turn });
    run = await chat(auth, context, messages, tz, [...cardsById.keys()]);
    for (const card of run.done?.pendingActions ?? []) cardsById.set(card.id, card);
    messages.push({ role: "assistant", content: run.text });
    if (VERBOSE) console.log(`  [${c.id}] > ${turn}\n  [${c.id}] < (${run.tools.join(", ") || "no tools"}) ${run.text.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  const fail = [];
  if (run.error) fail.push(`error: ${run.error}`);
  if (!run.text.trim()) fail.push("empty reply");
  if (c.tools && !c.tools.some((t) => run.tools.includes(t))) fail.push(`expected a tool from [${c.tools}], got [${run.tools}]`);
  for (const t of c.noTools ?? []) if (run.tools.includes(t)) fail.push(`should not call ${t}`);
  for (const m of c.must ?? []) if (!new RegExp(m, "i").test(run.text)) fail.push(`missing /${m}/`);
  for (const m of c.mustNot ?? []) if (new RegExp(m, "i").test(run.text)) fail.push(`forbidden /${m}/`);
  if (internalIds.some((id) => run.text.includes(id))) fail.push("leaked an internal ID");
  if (TOOL_NAMES.test(run.text)) fail.push("mentioned a tool name");
  if (FAKE_LINKS.test(run.text)) fail.push("made-up link");
  if (c.sets !== undefined && (run.done?.generatedStudySets ?? []).length !== c.sets) fail.push(`${(run.done?.generatedStudySets ?? []).length} study sets, expected ${c.sets}`);
  if (c.files !== undefined && (run.done?.generatedFiles ?? []).length !== c.files) fail.push(`${(run.done?.generatedFiles ?? []).length} files, expected ${c.files}`);
  if (c.maxSeconds && run.secs > c.maxSeconds) fail.push(`took ${run.secs}s (limit ${c.maxSeconds}s)`);
  // Deletes, moves, rewrites and class edits wait for a Confirm card
  // (src/library/pendingActions.ts): check nothing changed yet, then press
  // Confirm (or Cancel) the way the student would.
  const cards = [...cardsById.values()];
  if (c.confirm || c.cancel) {
    if (cards.length !== 1) fail.push(`${cards.length} confirm cards, expected 1`);
    if (c.dbBeforeConfirm) {
      const problem = await checkDb(db, c.dbBeforeConfirm, tz, run);
      if (problem) fail.push(`changed before Confirm: ${problem}`);
    }
    if (CLAIMED_DONE.test(run.text) && !/Nothing has changed yet/.test(run.text)) fail.push("said it was done before Confirm");
    for (const card of cards) {
      const res = await fetch(`${BASE_URL}/api/chat/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.idToken}` },
        body: JSON.stringify({ id: card.id, decision: c.cancel ? "cancel" : "confirm" }),
      });
      const data = await res.json().catch(() => ({}));
      const expected = c.cancel ? "cancelled" : "done";
      if (data.status !== expected) fail.push(`card "${card.title}" ended ${data.status ?? res.status} (${data.message ?? ""}), expected ${expected}`);
      if (VERBOSE) console.log(`  [${c.id}] card: ${card.title} | ${card.details.join(" | ")} -> ${data.status}`);
    }
  } else if (cards.length && c.noCards) {
    fail.push(`unexpected confirm card: ${cards.map((k) => k.title).join(", ")}`);
  }
  if (c.db) {
    const problem = await checkDb(db, c.db, tz, run);
    if (problem) fail.push(`db: ${problem}`);
  }
  return { id: c.id, secs: run.secs, tools: run.tools, fail, reply: run.text };
}

// ── Cleanup ──────────────────────────────────────────────────────────────

async function cleanup(auth, db, since) {
  const newer = (d, ...fields) => fields.some((f) => typeof d[f] === "string" && d[f] >= since);
  let removed = 0;
  const rm = async (p) => (removed += (await db.remove(p)) ? 1 : 0);
  const before = new Set((globalThis.__evalEventsBefore ?? []).map((e) => e.id));
  for (const e of await db.list("events")) if (!before.has(e.id)) await rm(e.path);
  for (const n of await db.list("notes")) {
    if (newer(n, "createdAt")) {
      for (const p of await db.list(`notes/${n.id}/pages`)) await rm(p.path);
      await rm(n.path);
    }
  }
  for (const b of await db.list("notebooks")) if (newer(b, "createdAt")) await rm(b.path);
  for (const c of await db.list("enrollment")) {
    for (const kind of ["flashcardSets", "quizSets"]) {
      for (const s of await db.list(`enrollment/${c.id}/${kind}`)) {
        if (!newer(s, "createdAt")) continue;
        for (const a of await db.list(`enrollment/${c.id}/${kind}/${s.id}/${kind === "quizSets" ? "attempts" : "cardEngagement"}`)) await rm(a.path);
        await rm(s.path);
      }
    }
    for (const r of await db.list(`enrollment/${c.id}/resources`)) {
      if (!newer(r, "uploadedAt")) continue;
      const key = new URLSearchParams((r.url ?? "").split("?")[1] ?? "").get("key");
      if (key) await fetch(`${BASE_URL}/api/delete?key=${encodeURIComponent(key)}&resourceId=${r.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${auth.idToken}` } });
      for (const ch of await db.list(`enrollment/${c.id}/resources/${r.id}/chunks`)) await rm(ch.path);
      await rm(r.path);
    }
  }
  const ratingsBefore = globalThis.__evalRatingsBefore ?? new Map();
  for (const r of await db.list("courseConfidence")) if (!ratingsBefore.has(r.id)) await rm(r.path);
  for (const s of await db.list("chatSessions")) if (newer(s, "createdAt")) await rm(s.path);
  for (const p of await db.list("pendingActions")) if (newer(p, "createdAt")) await rm(p.path);
  return removed;
}

// Put back any class details a case changed (e.g. an office correction), after
// every case, so repeated runs start from the same data.
const EDITABLE = ["facultyName", "facultyEmail", "facultyPhoneNumber", "facultyOfficeNumber", "classSchedule", "time", "classRoom", "term", "className", "classDescription"];
async function restoreCourses(auth, db, coursesBefore) {
  for (const c of await db.list("enrollment")) {
    const before = coursesBefore.get(c.id);
    const changed = before && EDITABLE.filter((k) => before[k] !== c[k]);
    if (!changed?.length) continue;
    const fields = Object.fromEntries(changed.map((k) => [k, before[k] === undefined ? { nullValue: null } : { stringValue: String(before[k]) }]));
    await fetch(`${FIRESTORE}/users/${auth.uid}/enrollment/${c.id}?${changed.map((k) => `updateMask.fieldPaths=${k}`).join("&")}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${auth.idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    console.log(`        (restored ${c.classCode}: ${changed.join(", ")})`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

const cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf-8")).filter((c) => !ONLY || ONLY.has(c.id));
const since = new Date().toISOString();
const auth = await signIn();
const db = firestore(auth);
const context = await buildContext(auth, db);
const internalIds = [auth.uid, ...context.classes.flatMap((c) => [c.classId, ...c.documents.map((d) => d.resourceId)])];
globalThis.__evalEventsBefore = await db.list("events");
globalThis.__evalRatingsBefore = new Map((await db.list("courseConfidence")).map((r) => [r.id, r]));
const coursesBefore = new Map((await db.list("enrollment")).map((c) => [c.id, c]));

console.log(`Chat eval: ${cases.length} case(s) x ${REPEAT} against ${BASE_URL} as ${auth.email}\n`);
const results = [];
// --repeat runs the whole suite again (cases depend on earlier ones, e.g.
// cal-move needs cal-add's event), cleaning up between passes so a second
// "Eval office hours" never exists alongside the first.
for (let pass = 0; pass < REPEAT; pass++) {
  const passSince = new Date().toISOString();
  if (REPEAT > 1) console.log(`-- pass ${pass + 1} of ${REPEAT}`);
  for (const c of cases) {
    const res = await runCase(c, auth, db, context, internalIds).catch((e) => ({ id: c.id, secs: 0, tools: [], fail: [`crashed: ${e.message}`], reply: "" }));
    results.push({ ...res, pass: pass + 1 });
    const mark = res.fail.length ? "FAIL" : "pass";
    console.log(`${mark}  ${res.id.padEnd(18)} ${String(res.secs).padStart(5)}s  [${res.tools.join(", ")}]${res.fail.length ? `\n        - ${res.fail.join("\n        - ")}` : ""}`);
    await restoreCourses(auth, db, coursesBefore);
  }
  if (pass < REPEAT - 1) console.log(`   (between passes: removed ${await cleanup(auth, db, passSince)} test document(s))\n`);
}

if (!KEEP) console.log(`\ncleanup: removed ${await cleanup(auth, db, since)} test document(s)`);

const failed = results.filter((r) => r.fail.length);
const reportPath = CASES_PATH.replace(/\.json$/, `.report-${since.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(reportPath, JSON.stringify({ baseUrl: BASE_URL, startedAt: since, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed. Report: ${path.relative(process.cwd(), reportPath)}`);
process.exit(failed.length ? 1 : 0);
