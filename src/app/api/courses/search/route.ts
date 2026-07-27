import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getCourseOfferings } from "@/src/library/courseOfferings";
import { getStudentCourseOfferingSource } from "@/src/library/getStudentUniversitySource";
import { checkRateLimit } from "@/src/library/rateLimit";

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;
const RATE_LIMIT_WINDOW_MS = 60_000;
// Autocomplete fires on every keystroke (debounced client-side, but that's
// not a security boundary) — generous enough for real typing bursts, still
// bounded.
const RATE_LIMIT_MAX = 60;

// Backs the classCode/className autocomplete in AddEnrollmentModal — a
// simple text search over the full (cached) course catalog, independent of
// any student/term personalization (unlike /api/advising, this isn't
// scoped to "likely offered next term").
export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(auth.uid, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }

  try {
    const { source } = await getStudentCourseOfferingSource(auth.uid);
    if (!source) return NextResponse.json({ results: [] }); // unsupported university — no-op is a reasonable fallback for autocomplete

    const snapshot = await getCourseOfferings(source);
    const results = snapshot.courses
      .filter((c) => c.courseCode.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
      .map((c) => ({ courseCode: c.courseCode, title: c.title }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Course search failed:", error);
    return NextResponse.json({ results: [] });
  }
}
