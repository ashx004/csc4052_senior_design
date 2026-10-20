/**
 * Builds (or rebuilds) the test student that scripts/chatEval.mjs expects:
 * the classes, instructors, files and quizzes its cases ask about. Run it,
 * then point the eval at the account with the token it writes:
 *
 *   npm run eval:seed -- --token-out /path/eval.env [--credit 2]
 *   node --env-file=.env --env-file=/path/eval.env scripts/chatEval.mjs --url http://localhost:3000
 *
 * The site must be running (files are indexed through its /api/embed-document).
 * Safe to rerun: the account's data is wiped and recreated each time. Never
 * touches any other account. To test cloud AI, add the uid it prints to
 * AI_CLOUD_TESTERS; --credit gives it that many dollars of test credit.
 */
import "./loadEnvironment";
import { writeFileSync } from "node:fs";
import PDFDocument from "pdfkit";

const EMAIL = "catalyst-eval@example.com";
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const SITE = (opt("url") ?? process.env.EVAL_URL ?? "http://localhost:3000").replace(/\/$/, "");

function pdf(title: string, paragraphs: string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 56 });
    const parts: Buffer[] = [];
    doc.on("data", (c: Buffer) => parts.push(c));
    doc.on("end", () => resolve(Buffer.concat(parts)));
    doc.fontSize(18).text(title).moveDown();
    for (const p of paragraphs) doc.fontSize(11).text(p).moveDown(0.6);
    doc.end();
  });
}

const TERM = { term: "Fall 2026", termSeason: "Fall", termYear: 2026, termStartDate: "2026-09-07", termEndDate: "2026-11-20", meetingTimeZone: "America/Chicago" };

const CLASSES = [
  { key: "csc330", classCode: "CSC 330", className: "Programming Languages", facultyName: "Dr. Cherry", facultyEmail: "cherry@latech.edu", facultyOfficeNumber: "NETH 239", classSchedule: "Tuesday/Thursday", time: "2:00 PM - 3:15 PM", meetingDays: ["tue", "thu"], meetingStartTime: "14:00", meetingEndTime: "15:15", status: "in-progress" },
  { key: "csc130", classCode: "CSC 130", className: "Computer Organization", facultyName: "Dr. Turner", facultyEmail: "turner@latech.edu", facultyOfficeNumber: "NETH 210", classSchedule: "Monday/Wednesday", time: "1:00 PM - 2:15 PM", meetingDays: ["mon", "wed"], meetingStartTime: "13:00", meetingEndTime: "14:15", status: "in-progress" },
  { key: "csc325", classCode: "CSC 325", className: "Data Structures and Algorithms", facultyName: "Dr. Min", facultyEmail: "mankimin@LATech.edu", facultyOfficeNumber: "NETH 244", classSchedule: "Monday/Wednesday/Friday", time: "10:00 AM - 10:50 AM", meetingDays: ["mon", "wed", "fri"], meetingStartTime: "10:00", meetingEndTime: "10:50", status: "in-progress" },
  { key: "csc4753", classCode: "CSC 4753", className: "Artificial Intelligence", facultyName: "Dr. Coriell", facultyEmail: "coriell@latech.edu", facultyOfficeNumber: "NETH 120", classSchedule: "Tuesday/Thursday", time: "9:30 AM - 10:45 AM", meetingDays: ["tue", "thu"], meetingStartTime: "09:30", meetingEndTime: "10:45", status: "in-progress" },
  { key: "tst101", classCode: "TST 101", className: "Testing Fundamentals", facultyName: "Dr. Example", facultyEmail: "example@latech.edu", facultyOfficeNumber: "NETH 100", classSchedule: "", time: "", meetingDays: [], meetingStartTime: "", meetingEndTime: "", status: "completed", term: "Spring 2026", termSeason: "Spring" },
];

const FILES: { course: string; name: string; type: string; body: () => Promise<Buffer> }[] = [
  {
    course: "csc130", name: "Binary Addition.pdf", type: "pdf",
    body: () => pdf("Binary Addition", [
      "Binary numbers use base 2: each digit (bit) is 0 or 1, and each position is a power of two.",
      "Adding two bits follows four rules: 0 + 0 = 0, 0 + 1 = 1, 1 + 0 = 1, and 1 + 1 = 10, which writes 0 and carries 1 to the next column.",
      "A half adder adds two bits and produces a sum (XOR) and a carry (AND). A full adder also takes a carry in, so full adders chain into a ripple-carry adder.",
      "Overflow happens when the result needs more bits than the register holds. In two's complement, overflow occurs when adding two numbers of the same sign gives a result of the opposite sign.",
      "Example: 1011 (11) + 0110 (6) = 10001 (17); in a 4-bit register the leading 1 is lost, which is an unsigned overflow.",
    ]),
  },
  { course: "csc130", name: "tset file.zip", type: "zip", body: async () => Buffer.from("PK\u0003\u0004 not a real archive") },
  {
    course: "csc325", name: "Sorting Algorithms.pdf", type: "pdf",
    body: () => pdf("Sorting Algorithms", [
      "Comparison sorts decide order only by comparing pairs of keys. Merge sort, heap sort and quicksort (on average) run in O(n log n).",
      "Decision tree lower bound: any comparison sort can be modeled as a binary decision tree with at least n! leaves, so its height is at least log2(n!) = Omega(n log n). No comparison sort can beat n log n in the worst case.",
      "Radix sort avoids comparisons: it sorts integers digit by digit, from the least significant digit to the most, using a stable counting sort on each digit. With d digits in base k it runs in O(d(n + k)).",
      "Bucket sort spreads keys uniformly distributed over [0, 1) into n buckets, sorts each bucket (for example with insertion sort), and concatenates them. Its expected time is O(n).",
      "Counting sort counts occurrences of each key in a small range and is stable, which is why radix sort uses it.",
    ]),
  },
  {
    course: "csc325", name: "Arrays: Amortized Analysis.pdf", type: "pdf",
    body: () => pdf("Arrays: Amortized Analysis", [
      "A dynamic array grows when it runs out of room. The doubling strategy allocates an array twice as large and copies every element over.",
      "A single append can cost O(n) when it triggers a copy, but copies happen at sizes 1, 2, 4, 8, ..., so n appends copy fewer than 2n elements in total.",
      "Amortized analysis spreads that cost over all operations: with doubling, append costs O(1) amortized. Growing by a fixed amount instead (say +10) makes appends O(n) amortized.",
      "The accounting method charges each append 3 units: one to insert it, and two saved to pay for copying it and one older element at the next doubling.",
    ]),
  },
  {
    course: "csc330", name: "L4 - Type Systems.pdf", type: "pdf",
    body: () => pdf("L4 - Type Systems", [
      "A type system assigns types to expressions and rejects programs that would misuse values. Static typing checks types at compile time (Java, C); dynamic typing checks them at run time (Python, JavaScript).",
      "Strong vs weak typing describes how freely a language converts between types. Implicit conversion, called coercion, happens automatically, such as an int widened to a double in 3 + 2.5.",
      "Casting is an explicit conversion the programmer writes, like (int) 3.9 in Java, which truncates to 3. Narrowing casts can lose information; widening conversions are safe.",
      "Type inference lets the compiler work out types without annotations, as in Haskell or var in Java.",
      "Type equivalence can be structural (same shape) or nominal (same declared name).",
    ]),
  },
];

const QUIZZES = ["Skip Lists", "Divide and Conquer", "Arrays and Amortized"].map((name, i) => ({
  name,
  questions: [{ id: `q${i}`, type: "multiple_choice", question: `Sample question about ${name}?`, options: ["A", "B", "C", "D"], correctAnswer: "A" }],
}));

async function main() {
  const { adminAuth, adminDb } = await import("../src/library/firebaseAdmin");
  const { putObject } = await import("../src/library/gcsStorage");
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET is needed to index the files.");

  // The account, created once and reused, its data wiped each run.
  const user = await adminAuth.getUserByEmail(EMAIL).catch(() => adminAuth.createUser({ email: EMAIL, emailVerified: true, displayName: "Eval Student" }));
  const uid = user.uid;
  const root = adminDb.doc(`users/${uid}`);
  await adminDb.recursiveDelete(root);
  const { deleteChunksForUser } = await import("../src/library/vectorStore");
  await deleteChunksForUser(uid).catch(() => undefined);
  await root.set({
    name: "Eval Student", email: EMAIL, college: "Louisiana Tech University", universityName: "Louisiana Tech University",
    joinedAt: new Date("2026-09-01"), termsAcceptedAt: new Date(), termsVersion: (await import("../src/library/legalVersion")).TERMS_VERSION,
    tutorialsOptedOut: true,
  });

  const courseIds: Record<string, string> = {};
  for (const [i, c] of CLASSES.entries()) {
    const { key, meetingDays, ...fields } = c;
    const ref = await root.collection("enrollment").add({ ...TERM, ...fields, meetingDays, createCalendarEvents: false, sortOrder: i, color: "#5b7fa6" });
    courseIds[key] = ref.id;
  }

  for (const f of FILES) {
    const courseId = courseIds[f.course];
    const key = `users/${uid}/classes/${courseId}/${Date.now()}_${f.name}`;
    await putObject(key, await f.body(), f.type === "pdf" ? "application/pdf" : "application/zip");
    const ref = await root.collection(`enrollment/${courseId}/resources`).add({
      name: f.name, url: `/api/download?key=${encodeURIComponent(key)}`, fileType: f.type, category: "notes",
      uploadedAt: new Date(Date.now() - 86_400_000), lastViewedAt: new Date(),
    });
    if (f.type !== "pdf") continue;
    const res = await fetch(`${SITE}/api/embed-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ userId: uid, courseId, resourceId: ref.id }),
    });
    console.log(`indexed ${f.name}: ${res.status} ${(await res.text()).slice(0, 80)}`);
  }

  for (const q of QUIZZES) {
    await root.collection(`enrollment/${courseIds.csc325}/quizSets`).add({
      ...q, questionCount: q.questions.length, visibility: "private", pinned: false,
      createdAt: new Date(Date.now() - 86_400_000), updatedAt: new Date(Date.now() - 86_400_000),
    });
  }

  const credit = Number(opt("credit") ?? 0);
  if (credit > 0) {
    const { creditPurchase } = await import("../src/library/billing/wallet");
    // Test credit, not a purchase: no money moved. Labelled so the ledger says so.
    await creditPurchase(uid, Math.round(credit * 1e6), { eventId: `eval-seed-${Date.now()}`, paidMicros: 0 });
  }

  const tokenOut = opt("token-out");
  if (tokenOut) {
    const custom = await adminAuth.createCustomToken(uid);
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
    });
    const { idToken } = (await res.json()) as { idToken: string };
    writeFileSync(tokenOut, `EVAL_ID_TOKEN=${idToken}\n`, { mode: 0o600 });
  }
  console.log(`Eval account ready: ${EMAIL} (uid ${uid}), ${CLASSES.length} classes, ${FILES.length} files, ${QUIZZES.length} quizzes.`);
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
