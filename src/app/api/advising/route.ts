import { NextRequest, NextResponse } from "next/server";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getNextTerm, formatTerm } from "@/src/library/academicTerm";
import { getCourseOfferings } from "@/src/library/courseOfferings";
import { getStudentCourseOfferingSource } from "@/src/library/getStudentUniversitySource";
import { recommendCourses, filterCourses, paginate, getDepartments, StudentEnrollment } from "@/src/library/advising/recommend";
import { getEnrollmentStatus } from "@/src/library/enrollmentStatus";
import { checkRateLimit } from "@/src/library/rateLimit";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;
// "Recommended" is bounded by the student's own department set, but cap it
// defensively so a student enrolled across many departments can't blow up
// the response — it's meant to stay small, unlike otherLikely.
const MAX_RECOMMENDED = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
// Generous for real use (page load + filter/pagination changes) — this
// route is CPU/Firestore work, not GPU-cost-bearing like /api/chat, but
// still shouldn't be hammerable with zero bound.
const RATE_LIMIT_MAX = 30;

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

  const target = getNextTerm();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const department = url.searchParams.get("department") ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "", 10) || DEFAULT_PAGE_SIZE));

  const emptyShape = {
    term: target,
    termLabel: formatTerm(target),
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt: null as string | null,
    recommended: [] as unknown[],
    otherLikely: [] as unknown[],
    otherLikelyTotal: 0,
    page: 1,
    pageSize,
    departments: [] as string[],
    totalConsidered: 0,
  };

  // Lighter than chatContext.ts's buildChatContext — this route only needs
  // classCode/subject, not documents/resources. Also pulls out completed
  // classes (marked via the Classes page's "mark completed instead of
  // deleting" flow) for Advising's own progress summary + Completed courses
  // section — this doesn't depend on course-offering data being available
  // for the student's school, so it's gathered before that check and
  // included in every response shape below, not just the success path.
  // creditHours is self-reported (AddEnrollmentModal) — no external catalog
  // has this data for arbitrary courses, confirmed during the Advising work.
  const enrollments: StudentEnrollment[] = [];
  const completedCourses: { classId: string; classCode: string; className: string; term: string; creditHours?: number }[] = [];
  let totalCreditsCompleted = 0;
  try {
    const enrollmentRef = collection(db, "users", auth.uid, "enrollment");
    const snap = await getDocs(enrollmentRef);
    snap.forEach((d) => {
      const data = d.data();
      // Completed classes still count toward "already taken" for
      // recommendation-exclusion purposes (a finished course shouldn't be
      // re-recommended) — they're just *also* surfaced separately below.
      enrollments.push({ classCode: data.classCode ?? "", subject: data.subject });
      if (getEnrollmentStatus(data) === "completed") {
        const creditHours = typeof data.creditHours === "number" ? data.creditHours : undefined;
        completedCourses.push({
          classId: d.id,
          classCode: data.classCode ?? "",
          className: data.className ?? "",
          term: data.term ?? "",
          creditHours,
        });
        if (creditHours) totalCreditsCompleted += creditHours;
      }
    });
  } catch (error) {
    console.error("Advising: failed to read enrollment:", error);
  }
  const progress = { completedCount: completedCourses.length, totalCreditsCompleted };

  const { source, unsupported, university } = await getStudentCourseOfferingSource(auth.uid);

  if (unsupported || !source) {
    // Distinct from sourceUnavailable below (which means "scrape failed") —
    // this school genuinely has no adapter yet, so say so honestly rather
    // than implying a transient error.
    return NextResponse.json({ ...emptyShape, university, universityUnsupported: true, completedCourses, progress });
  }

  try {
    const snapshot = await getCourseOfferings(source);
    const { recommended, otherLikely, totalConsidered } = recommendCourses(snapshot.courses, enrollments, target);

    // Departments are computed from the full, unfiltered result set so the
    // filter dropdown's options don't shrink as the student narrows down.
    const departments = getDepartments([...recommended, ...otherLikely]);

    const filteredRecommended = filterCourses(recommended, q, department).slice(0, MAX_RECOMMENDED);
    const filteredOtherLikely = filterCourses(otherLikely, q, department);
    const { items: otherLikelyPage, total: otherLikelyTotal } = paginate(filteredOtherLikely, page, pageSize);

    return NextResponse.json({
      term: target,
      termLabel: formatTerm(target),
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: snapshot.fetchedAt.toISOString(),
      recommended: filteredRecommended,
      otherLikely: otherLikelyPage,
      otherLikelyTotal,
      page,
      pageSize,
      departments,
      totalConsidered,
      university,
      completedCourses,
      progress,
    });
  } catch (error) {
    // Total failure (fresh scrape failed AND no stale cache exists) — degrade
    // gracefully with a 200 + empty lists rather than a 500, so the page can
    // render a friendly message instead of an error boundary.
    console.error("Advising: course offering data unavailable:", error);
    return NextResponse.json({ ...emptyShape, university, sourceUnavailable: true, completedCourses, progress });
  }
}
