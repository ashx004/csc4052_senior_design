import "./loadEnvironment";
const BASE = "http://localhost:3199";
const UID = "nT9nTJ6vNxQddCGhaMzeDCaA8bm1";
const usd = (m: number) => `$${(m / 1e6).toFixed(6)}`;
(async () => {
  const { adminAuth, adminDb } = await import("../src/library/firebaseAdmin");
  const { getWallet, creditPurchase } = await import("../src/library/billing/wallet");
  if ((await getWallet(UID)).balanceMicros < 1_000_000) await creditPurchase(UID, 2_000_000, { eventId: `eval-seed-${Date.now()}`, paidMicros: 0 });
  const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: await adminAuth.createCustomToken(UID), returnSecureToken: true }) });
  const { idToken } = await ex.json();
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` };
  const enr = await adminDb.collection(`users/${UID}/enrollment`).get();
  const c325 = enr.docs.find((d) => d.data().classCode === "CSC 325")!;
  const res = await c325.ref.collection("resources").get();
  const doc = res.docs.find((d) => d.data().name === "Sorting Algorithms.pdf")!;
  const arrays = res.docs.find((d) => d.data().name === "Arrays: Amortized Analysis.pdf")!;
  const context = { userId: UID, email: "catalyst-eval@example.com", classes: [{ classId: c325.id, className: "Data Structures and Algorithms", classCode: "CSC 325", term: "Fall 2026", documents: [] }] };
  const quiz29 = { kind: "quiz_result", courseId: c325.id, quizName: "Sorting quiz", score: 9, total: 29, questions: Array.from({ length: 29 }, (_, i) => ({ question: `Question ${i + 1} about sorting?`, selectedAnswer: i < 9 ? "right" : "wrong", correctAnswer: "right", isCorrect: i < 9 })) };
  const usageIds = async () => new Set((await adminDb.collection("aiUsage").where("uid", "==", UID).get()).docs.map((d) => d.id));
  const read = async (r: Response) => { const t = await r.text(); return t.length > 160 ? t.slice(0, 160) + "…" : t; };
  const steps: [string, () => Promise<string>][] = [
    ["main chat", async () => read(await fetch(BASE + "/api/chat", { method: "POST", headers: H, body: JSON.stringify({ messages: [{ role: "user", content: "Explain radix sort in two sentences." }], context, ephemeral: true }) }))],
    ["sidebar chat (quiz, 29 Qs)", async () => read(await fetch(BASE + "/api/chat", { method: "POST", headers: H, body: JSON.stringify({ messages: [{ role: "user", content: "What should I review based on the questions I missed?" }], context, pageContext: quiz29, panelContextKey: "audit-quiz-panel" }) }))],
    ["quiz (8 Qs)", async () => read(await fetch(BASE + "/api/generate-quiz", { method: "POST", headers: H, body: JSON.stringify({ docUrl: doc.data().url, docName: doc.data().name, courseId: c325.id, questionCount: 8, questionTypes: { multipleChoice: true, trueFalse: true } }) }))],
    ["flashcards", async () => read(await fetch(BASE + "/api/generate-flashcards", { method: "POST", headers: H, body: JSON.stringify({ docUrl: doc.data().url, docName: doc.data().name, courseId: c325.id }) }))],
    ["practice", async () => read(await fetch(BASE + "/api/generate-practice", { method: "POST", headers: H, body: JSON.stringify({ docUrl: doc.data().url, docName: doc.data().name, kind: "fill_blank", count: 4 }) }))],
    ["discover question", async () => read(await fetch(BASE + "/api/discover/learn-question", { method: "POST", headers: H, body: JSON.stringify({ count: 2, courses: [{ courseCode: "CSC 325", courseName: "Data Structures" }] }) }))],
    ["document indexing", async () => read(await fetch(BASE + "/api/embed-document", { method: "POST", headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET! }, body: JSON.stringify({ userId: UID, courseId: c325.id, resourceId: arrays.id }) }))],
  ];
  console.log("step".padEnd(28), "calls", "balance drop".padStart(14), "logged charges".padStart(15), "  match  stuck-hold  result");
  for (const [name, run] of steps) {
    const before = await getWallet(UID);
    const ids = await usageIds();
    const t0 = Date.now();
    const out = await run();
    let after = await getWallet(UID);
    for (let i = 0; i < 20 && after.heldMicros > 0; i++) { await new Promise((r) => setTimeout(r, 1500)); after = await getWallet(UID); }
    await new Promise((r) => setTimeout(r, 4000));
    after = await getWallet(UID);
    const fresh = (await adminDb.collection("aiUsage").where("uid", "==", UID).get()).docs.filter((d) => !ids.has(d.id)).map((d) => d.data());
    const logged = fresh.reduce((s, r) => s + (r.chargeMicros ?? 0), 0);
    const drop = before.balanceMicros - after.balanceMicros;
    const feats = [...new Set(fresh.map((r) => r.feature))].join("+");
    console.log(name.padEnd(28), String(fresh.length).padStart(5), usd(drop).padStart(14), usd(logged).padStart(15), drop === logged ? "   yes " : "   NO  ", usd(after.heldMicros).padStart(10), ` ${((Date.now() - t0) / 1000).toFixed(0)}s ${feats} | ${out.replace(/\s+/g, " ").slice(0, 70)}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
