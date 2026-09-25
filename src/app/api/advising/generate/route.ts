import { NextRequest, NextResponse, } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import { verifyRequestAuth, isInternalRequest } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { SCHEDULE_JOBS, enqueueAdvisingJob, readAdvisingJob } from "@/src/library/advisingJobs";
import {
  buildAcademicProgress,
  TranscriptData,
  CurriculumData,
  CurriculumRequirement,
  courseCodesEquivalent,
  courseCodesStructurallyEquivalent,
  prerequisitesSatisfied,
} from "@/src/library/advisingSchedule";
import { loadCourseOfferingCache, CachedCourseOffering, } from "@/src/library/advisingOfferingCache";
import { buildFutureTerms, buildCourseAvailability, } from "@/src/library/advisingPlanner";
import { generateScheduleWithOllama, } from "@/src/library/advisingOllama";
import { generatedAdvisingScheduleSchema, } from "@/src/library/advisingSchemas";
import { enforceTermCreditLimit, moveCoursesToEarliestTerms, PREFERRED_MAX_CREDITS } from "@/src/library/advisingCreditLimit";


function normalizeCourseCode(courseCode: string): string {
  return courseCode.replace(/\s+/g, "").toUpperCase();
}


function addCourseCode(codes: Set<string>,courseCode: unknown)
{

  if (
    typeof courseCode === "string" && courseCode.trim()
  ) {
    codes.add(courseCode.trim());
  }
}

function groupCourseAvailability(
  courseAvailability: ReturnType<
    typeof buildCourseAvailability
  >
) {

  const grouped: Record<
    string,
    {
      term: string;
      year: number;
      offered: boolean;
    }[]
  > = {};

  for (const item of courseAvailability) {

    if (!grouped[item.courseCode]) {
      grouped[item.courseCode] = [];
    }

    // Only list terms the course IS offered in. Handing the model every
    // term with offered:false entries mixed in made it easier to misread
    // (it placed courses in offered:false terms).
    if (!item.offered) { continue; }

    grouped[item.courseCode].push({
      term: item.term,
      year: item.year,
      offered: item.offered,
    });
  }

  return grouped;
}

function getCourseNumber(courseCode: string): number | null {

  const normalized = normalizeCourseCode(courseCode);

  const match = normalized.match(/^[A-Z]{2,5}(\d{3,4})$/);

  if (!match) { return null; }

  const numberText = match[1];

  /*
    Newer Louisiana Tech-style course codes
    may contain the credit-hour digit at the end.

    Example:
    CSC4933 -> academic course number 493
  */

  if (numberText.length === 4) {
    return Number(numberText.slice(0, 3));
  }

  return Number(numberText);
}



function getCourseSubject(courseCode: string): string | null {

  const normalized = normalizeCourseCode(courseCode);
  const match = normalized.match(/^([A-Z]{2,5})\d{3,4}$/);

  return match?.[1] ?? null;
}



function buildCandidateCourseCodes(
  remainingRequirements: CurriculumRequirement[],
  courseOfferingCache: CachedCourseOffering[]
): string[] {

  const codes = new Set<string>();


    for (const requirement of remainingRequirements) {

    /*
        TYPE 1:
        Exact required course.
    */
    if (
        requirement.requirementType === "specific-course"
    ) {
        addCourseCode(
        codes,
        requirement.courseCode
        );

        continue;
    }


    /*
        TYPE 2:
        Choose from an explicitly listed group.
    */
    if (
        requirement.requirementType === "choose-from-list"
    ) {

        for (
        const option
        of requirement.courseOptions ?? []
        ) {
        addCourseCode(
            codes,
            option.courseCode
        );
        }

        continue;
    }


    /*
        TYPE 3:
        Flexible elective requirement.
    */

    const rules =
        requirement.eligibilityRules;


    if (!rules) {
        continue;
    }


    for (
        const courseCode
        of rules.allowedCourseCodes ?? []
    ) {
        addCourseCode(
        codes,
        courseCode
        );
    }


    const allowedSubjects =
        new Set(
        (rules.allowedSubjectPrefixes ?? [])
            .map(
            (subject) =>
                subject
                .replace(/\s+/g, "")
                .toUpperCase()
            )
        );


    if (allowedSubjects.size === 0) {
        continue;
    }


    for (
        const cachedCourse
        of courseOfferingCache
    ) {

        const subject =
        getCourseSubject(
            cachedCourse.courseCode
        );

        const courseNumber =
        getCourseNumber(
            cachedCourse.courseCode
        );


        if (
        !subject ||
        courseNumber === null
        ) {
        continue;
        }


        if (
        !allowedSubjects.has(subject)
        ) {
        continue;
        }


        if (
        rules.minimumCourseLevel !== null &&
        courseNumber <
            rules.minimumCourseLevel
        ) {
        continue;
        }


        if (
        rules.maximumCourseLevel !== null &&
        courseNumber >
            rules.maximumCourseLevel
        ) {
        continue;
        }


        const excluded =
        (rules.excludedCourseCodes ?? [])
            .some(
            (excludedCode) =>
                normalizeCourseCode(
                excludedCode
                ) ===
                normalizeCourseCode(
                    cachedCourse.courseCode
                )
            );


        if (excluded) {
        continue;
        }


        addCourseCode(
        codes,
        cachedCourse.courseCode
        );
    }
    }
  return Array.from(codes);
}



/*
  The model's schedule is a draft: it can still put a course in a term where
  it isn't offered, list a course twice, or re-schedule a completed course.
  Rather than failing the whole schedule over one such slip, fix it here in
  code (same idea as enforceTermCreditLimit). Only a course with no upcoming
  offering or a duplicate gets a note; moving a course to a term it's offered
  in, or dropping one already on the transcript, happens silently.

  Moving a course to another term can't break a prerequisite: only
  requirements whose prerequisites are already on the transcript are ever
  sent to the model, so no scheduled course depends on another one.
*/
function repairGeneratedSchedule(
  schedule: ReturnType<typeof generatedAdvisingScheduleSchema.parse>,
  courseAvailability: ReturnType<typeof buildCourseAvailability>,
  futureTerms: ReturnType<typeof buildFutureTerms>,
  transcriptCourses: TranscriptData["courses"],
  remainingRequirements: CurriculumRequirement[]
): string[] {

  const warnings: string[] = [];
  const alreadyScheduled = new Set<string>();
  const misplaced: GeneratedCourse[] = [];

  const isOffered = (courseCode: string, term: { term: string; year: number }) =>
    courseAvailability.some(
      (availability) =>
        availability.term === term.term &&
        availability.year === term.year &&
        availability.offered === true &&
        courseCodesStructurallyEquivalent(availability.courseCode, courseCode)
    );

  for (const plannedTerm of schedule.terms) {

    plannedTerm.courses = plannedTerm.courses.filter((plannedCourse) => {

      /*
        Make sure Ollama did not schedule an already-completed or
        in-progress course. Dropped without a note - the student
        already knows they took it.
      */

      const matchingRequirement = remainingRequirements.find(
        (requirement) => requirement.requirementId === plannedCourse.requirementId
      );

      const requirementTitle =
        matchingRequirement &&
        matchingRequirement.courseCode &&
        normalizeCourseCode(matchingRequirement.courseCode) === normalizeCourseCode(plannedCourse.courseCode)
          ? matchingRequirement.courseTitle
          : matchingRequirement?.courseOptions.find(
              (option) => normalizeCourseCode(option.courseCode) === normalizeCourseCode(plannedCourse.courseCode)
            )?.courseTitle ?? null;

      const transcriptMatch = transcriptCourses.some(
          (course) =>
            (course.status === "completed" || course.status === "transfer" || course.status === "in-progress") &&
            courseCodesEquivalent(plannedCourse.courseCode, course, requirementTitle)
        );

      if (transcriptMatch) {
        return false;
      }

      /*
        Prevent duplicate scheduling.
      */

      const normalized = normalizeCourseCode(plannedCourse.courseCode);

      if (alreadyScheduled.has(normalized)) {
        warnings.push(`Removed a duplicate ${plannedCourse.courseCode} from ${plannedTerm.term} ${plannedTerm.year}.`);
        return false;
      }

      alreadyScheduled.add(normalized);

      /*
        Course must actually be offered
        in this exact term - otherwise re-place it below.
      */

      if (!isOffered(plannedCourse.courseCode, plannedTerm)) {
        misplaced.push({ course: plannedCourse, from: plannedTerm });
        return false;
      }

      return true;
    });
  }

  const termTotal = (term: { term: string; year: number }) =>
    schedule.terms
      .find((t) => t.term === term.term && t.year === term.year)
      ?.courses.reduce((sum, c) => sum + (c.creditHours ?? 3), 0) ?? 0;

  for (const { course, from } of misplaced) {

    const offeredTerms = futureTerms.filter((term) => isOffered(course.courseCode, term));

    if (offeredTerms.length === 0) {
      warnings.push(
        `Removed ${course.courseCode} from ${from.term} ${from.year}: it is not listed as offered in any upcoming term. Check with your advisor about when it will be offered.`
      );
      continue;
    }

    // Earliest offered term with room under the usual limit; otherwise the
    // earliest offered term (enforceTermCreditLimit rebalances after this).
    const destination =
      offeredTerms.find((term) => termTotal(term) + (course.creditHours ?? 3) <= PREFERRED_MAX_CREDITS) ??
      offeredTerms[0];

    let destinationTerm = schedule.terms.find(
      (t) => t.term === destination.term && t.year === destination.year
    );
    if (!destinationTerm) {
      destinationTerm = { term: destination.term, year: destination.year, courses: [] };
      schedule.terms.push(destinationTerm);
    }
    destinationTerm.courses.push(course);
  }

  return warnings;
}

type GeneratedCourse = {
  course: ReturnType<typeof generatedAdvisingScheduleSchema.parse>["terms"][number]["courses"][number];
  from: { term: string; year: number };
};



const GENERATE_RATE_LIMIT_WINDOW_MS = 60_000;
const GENERATE_RATE_LIMIT_MAX = 10;

// Schedule generation runs as a background job (see advisingJobs.ts), the
// same way document extraction does: the browser gets a fast "queued" answer,
// /api/advising-jobs/worker runs the generation below, and the student can
// leave the page meanwhile - a popup tells them when it's done.
export async function POST(request: NextRequest) {
  if (isInternalRequest(request)) {
    return processGeneration(request);
  }
  return enqueueGeneration(request);
}

// Browser-facing: kicks off a background generation job.
async function enqueueGeneration(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(`generate:${auth.uid}`, GENERATE_RATE_LIMIT_WINDOW_MS, GENERATE_RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  await enqueueAdvisingJob(request, SCHEDULE_JOBS, auth.uid);
  return NextResponse.json({ queued: true, status: "queued" }, { status: 202 });
}

// Browser-facing: polled until the job finishes, and read on page load to
// resume a job the student left running (or show their last schedule).
export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status, data } = await readAdvisingJob(request, SCHEDULE_JOBS, auth.uid);

  const saved = status === "complete"
    ? (await adminDb.collection("users").doc(auth.uid).collection("advising").doc("schedule").get()).data()
    : undefined;

  return NextResponse.json({
    status,
    lastError: data?.lastError ?? null,
    schedule: saved?.schedule ?? null,
  });
}

// Internal-only: does the actual generation. Called server-to-server by
// /api/advising-jobs/worker with the student's uid. Replies with
// retryable: false for problems with the student's saved documents, which
// another attempt can't fix.
async function processGeneration(
  request: NextRequest
) {

  try {

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required", retryable: false }, { status: 400 });
    }



    /*
      Firestore locations containing
      the extracted transcript/curriculum.
    */

    const transcriptRef =
      adminDb
        .collection("users")
        .doc(userId)
        .collection("transcript")
        .doc("data");


    const curriculumRef =
      adminDb
        .collection("users")
        .doc(userId)
        .collection("curriculum")
        .doc("data");



    /*
      Load both.
    */

    const [
      transcriptSnap,
      curriculumSnap,
    ] =
      await Promise.all([
        transcriptRef.get(),
        curriculumRef.get(),
      ]);



    if (!transcriptSnap.exists) {

      return NextResponse.json(
        {
          error:
            "Transcript information was not found. Please process your advising documents first.",
          retryable: false,
        },
        {
          status: 404,
        }
      );
    }



    if (!curriculumSnap.exists) {

      return NextResponse.json(
        {
          error:
            "Curriculum information was not found. Please process your advising documents first.",
          retryable: false,
        },
        {
          status: 404,
        }
      );
    }

    const transcript = transcriptSnap.data() as TranscriptData;

    // Same rule as /api/advising/extract, for transcripts saved before it
    // existed: an "IP" grade always means in-progress.
    for (const course of transcript.courses) {
      if (course.grade?.trim().toUpperCase() === "IP") course.status = "in-progress";
    }
    const curriculum = curriculumSnap.data() as CurriculumData;

    console.log(
      "DEBUG transcript:",
      transcript.courses.length, "courses |",
      transcript.courses.filter((c) => c.status === "completed").length, "completed |",
      transcript.courses.filter((c) => c.status === "in-progress").length, "in-progress |",
      transcript.courses.filter((c) => c.status === "transfer").length, "transfer |",
      "warnings:", JSON.stringify(transcript.warnings ?? [])
    );
    console.log("DEBUG curriculum codes:", curriculum.requirements.slice(0, 15).map((r) => r.courseCode));

    console.log(
      "DEBUG rows:\n" +
      transcript.courses
        .map((c) => `${c.courseCode} | ${c.term} | ${c.creditHours} | ${c.grade} | ${c.status}`)
        .join("\n")
    );

    if ((transcript.warnings ?? []).some((w: string) => w.startsWith("TRANSCRIPT_CREDIT_MISMATCH"))) {
      return NextResponse.json(
        { error: "Some courses on your transcript may not have been read correctly. Please review your transcript before generating a schedule.", retryable: false },
        { status: 409 }
      );
    }

    if (!transcript.courses.some((c) => ["completed", "transfer", "in-progress"].includes(c.status))) {
      return NextResponse.json(
        { error: "No completed courses were found on your transcript, so a schedule can't be generated. Please re-upload your transcript.", retryable: false },
        { status: 409 }
      );
    }


    /*
      Determine which degree requirements
      have already been satisfied.
    */

    const academicProgress = buildAcademicProgress(transcript, curriculum);

    /*
      Collect ONLY remaining requirements.

      This includes main degree requirements
      plus the student's selected concentration.
    */

        const remainingRequirements:
          CurriculumRequirement[] = [
            ...academicProgress.program.requirements
              .filter((result) => result.status === "remaining")
              .map((result) => result.requirement),
            ...(
              academicProgress.concentration
                ? academicProgress.concentration.requirements
                    .filter((result) => result.status === "remaining")
                    .map((result) => result.requirement)
                : []
            ),
          ];


            const needsReviewRequirements = [
              ...academicProgress.program.requirements
                .filter((result) => result.status === "needs-review"),
              ...(
                academicProgress.concentration
                  ? academicProgress.concentration.requirements
                      .filter((result) => result.status === "needs-review")
                  : []
              ),
            ];

        /*
          Split into requirements that are actually schedulable right now
          versus ones whose prerequisites aren't yet satisfied. This check
          happens in code — using the same reliable course-code matching as
          everywhere else — rather than leaving Ollama to guess from the raw
          prerequisites array and transcript, which was producing false
          "prerequisite not completed" results due to code-format mismatches
          (e.g. old 3-digit vs new 4-digit course codes).
        */

        const schedulableRequirements: CurriculumRequirement[] = [];

        const blockedRequirements: {
          requirement: CurriculumRequirement;
          unmetPrerequisites: string[];
        }[] = [];

        for (const requirement of remainingRequirements) {

          if (!requirement.prerequisites || requirement.prerequisites.length === 0) {
            schedulableRequirements.push(requirement);
            continue;
          }

          const { satisfied, unmetPrerequisites } = prerequisitesSatisfied(
            requirement.prerequisites,
            transcript.courses
          );

          if (satisfied) {
            schedulableRequirements.push(requirement);
          } else {
            blockedRequirements.push({ requirement, unmetPrerequisites });
          }
        }

    /* Load known course-offering information. */

    const courseOfferingCache = await loadCourseOfferingCache();


    /*
      Build the next academic terms.

      Existing code already starts after
      the latest in-progress transcript term.
    */

    const futureTerms = buildFutureTerms(transcript.courses, 8);

    /*
      Build all SAFE candidate courses.

      This includes:
      - exact required courses
      - choose-from-list options
      - explicitly approved elective courses
      - courses matching explicit elective rules
    */

    const candidateCourseCodes =
      buildCandidateCourseCodes(
        schedulableRequirements,
        courseOfferingCache
      );


    /* Determine when each candidate is actually offered. */

    const courseAvailability =
      buildCourseAvailability(
        candidateCourseCodes,
        futureTerms,
        courseOfferingCache
      );


    const groupedAvailability = groupCourseAvailability(courseAvailability);

        /*
          Prerequisites have already been verified in code (schedulableRequirements
          only contains requirements whose prerequisites are satisfied). Strip the
          field before handing requirements to Ollama so it can't re-litigate this
          using its own unreliable string comparison against raw transcript codes
          — which was producing contradictory, incorrect "prerequisite not met"
          warnings even when our own check had already confirmed it was met.
        */

        const requirementsForOllama = schedulableRequirements.map(
          (requirement) => ({
            ...requirement,
            prerequisites: [],
          })
        );

        const ollamaResponse =
          await generateScheduleWithOllama({
            transcriptCourses: transcript.courses,
            remainingRequirements: requirementsForOllama,
            futureTerms,
            courseAvailability: groupedAvailability,
          });



    /* Convert JSON string to object. */

    const rawSchedule = JSON.parse(ollamaResponse);

    /* Validate Ollama's JSON structure. */

    const schedule = generatedAdvisingScheduleSchema.parse(rawSchedule);


        /*
          Fix any placements that break the factual rules (not offered,
          duplicate, already completed) instead of failing the schedule.
        */

        const repairWarnings = repairGeneratedSchedule(
          schedule,
          courseAvailability,
          futureTerms,
          transcript.courses,
          schedulableRequirements
        );
        schedule.warnings = [...schedule.warnings, ...repairWarnings];

        schedule.terms = moveCoursesToEarliestTerms(schedule, futureTerms, courseAvailability);

        const limited = enforceTermCreditLimit(schedule, futureTerms, courseAvailability);
        schedule.terms = limited.terms;
        schedule.warnings = [...schedule.warnings, ...limited.warnings];

        /*
          Add warnings for requirements we deliberately withheld from Ollama
          because their prerequisites aren't met yet — these are trustworthy
          because they came from our own code-based check, not the model's
          own (sometimes wrong) reasoning about the transcript.
        */

            const prerequisiteWarnings = blockedRequirements.map(
              ({ requirement, unmetPrerequisites }) =>
                `Cannot schedule ${requirement.courseCode ?? requirement.requirementName} (${requirement.requirementName}) because the prerequisite${
                  unmetPrerequisites.length > 1 ? "s" : ""
                } ${unmetPrerequisites.join(", ")} ${
                  unmetPrerequisites.length > 1 ? "have" : "has"
                } not been completed.`
            );

            const needsReviewWarnings = needsReviewRequirements.map((result) =>
              `Requirement "${result.requirement.requirementName}" could not be automatically scheduled: ${result.reason}`
            );

            schedule.warnings = [...schedule.warnings,...prerequisiteWarnings,...needsReviewWarnings,];


        /*
          Save latest schedule.
        */

        const scheduleRef =
          adminDb
            .collection("users")
            .doc(userId)
            .collection("advising")
            .doc("schedule");


    await scheduleRef.set({
      schedule,

      generatedAt: FieldValue.serverTimestamp(),
    });



    /*
      Report back to the worker. The page reads the saved schedule through GET.
    */

    return NextResponse.json({
      success: true,
      message: "Schedule generated successfully.",
      schedule,
      academicProgress,
    });


  } catch (error) {

    console.error("Schedule generation failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The schedule could not be generated.",
      },

      {
        status: 500,
      }
    );
  }
}

