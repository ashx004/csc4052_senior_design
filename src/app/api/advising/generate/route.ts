import { NextRequest, NextResponse, } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import {
  buildAcademicProgress,
  TranscriptData,
  CurriculumData,
  CurriculumRequirement,
  courseCodesEquivalent,
  prerequisitesSatisfied,
} from "@/src/library/advisingSchedule";
import { loadCourseOfferingCache, CachedCourseOffering, } from "@/src/library/advisingOfferingCache";
import { buildFutureTerms, buildCourseAvailability, } from "@/src/library/advisingPlanner";
import { generateScheduleWithOllama, } from "@/src/library/advisingOllama";
import { generatedAdvisingScheduleSchema, } from "@/src/library/advisingSchemas";



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



function validateGeneratedSchedule(
  schedule: ReturnType<typeof generatedAdvisingScheduleSchema.parse>,
  courseAvailability: ReturnType<typeof buildCourseAvailability>,
  transcriptCourses: TranscriptData["courses"],
  remainingRequirements: CurriculumRequirement[]
) {

  const alreadyScheduled =
    new Set<string>();


  for (
    const plannedTerm
    of schedule.terms
  ) {

    for (
      const plannedCourse
      of plannedTerm.courses
    ) {

      /*
        Make sure Ollama did not schedule
        an already-completed or active course.
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
            (course.status === "completed" ||course.status === "transfer") &&
            courseCodesEquivalent(plannedCourse.courseCode, course, requirementTitle)
        );


      if (transcriptMatch) {
        throw new Error(
          `Generated schedule attempted to schedule an already completed or in-progress course: ${plannedCourse.courseCode}`
        );
      }


      /*
        Prevent duplicate scheduling.
      */

      const normalized =
        normalizeCourseCode(
          plannedCourse.courseCode
        );


      if (
        alreadyScheduled.has(normalized)
      ) {
        throw new Error(
          `Generated schedule contains duplicate course: ${plannedCourse.courseCode}`
        );
      }


      alreadyScheduled.add(normalized);


      /*
        Course must actually be offered
        in this exact term.
      */

      const offered =
        courseAvailability.some(
          (availability) =>

            availability.term ===
              plannedTerm.term &&

            availability.year ===
              plannedTerm.year &&

            availability.offered ===
              true &&

            courseCodeStringsEquivalent(
                availability.courseCode,
                plannedCourse.courseCode
                )
        );


      if (!offered) {
        throw new Error(
          `${plannedCourse.courseCode} is not listed as offered in ${plannedTerm.term} ${plannedTerm.year}.`
        );
      }
    }
  }
}



export async function POST(
  request: NextRequest
) {

  try {

    /*
      Verify logged-in user.
    */

    const auth =
      await verifyRequestAuth(
        request
      );


    if (!auth) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }


    const userId = auth.uid;



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
        },
        {
          status: 404,
        }
      );
    }

    const transcript = transcriptSnap.data() as TranscriptData;

    const curriculum =  curriculumSnap.data() as CurriculumData;

    /*
      Determine which degree requirements
      have already been satisfied.
    */

    const academicProgress = buildAcademicProgress(transcript, curriculum);

    console.log("FULL PROGRAM REQUIREMENT RESULTS:");
    console.dir(academicProgress.program.requirements, { depth: null });

    if (academicProgress.concentration) {
      console.log("FULL CONCENTRATION REQUIREMENT RESULTS:");
      console.dir(academicProgress.concentration.requirements, { depth: null });
    }


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

          
            console.log("REMAINING REQUIREMENTS:", remainingRequirements);
            console.dir(remainingRequirements, { depth: null } );

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

            console.log("NEEDS-REVIEW REQUIREMENTS:", needsReviewRequirements);
            console.dir(needsReviewRequirements, { depth: null });

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

        console.log("SCHEDULABLE REQUIREMENTS:", schedulableRequirements);
        console.dir(schedulableRequirements, { depth: null });

        console.log("BLOCKED REQUIREMENTS (unmet prerequisites):", blockedRequirements);
        console.dir(blockedRequirements, { depth: null });



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


    console.log("CANDIDATE COURSE CODES:", candidateCourseCodes);
    console.dir(candidateCourseCodes, { depth: null } );


    /* Determine when each candidate is actually offered. */

    const courseAvailability =
      buildCourseAvailability(
        candidateCourseCodes,
        futureTerms,
        courseOfferingCache
      );

    console.log("COURSE AVAILABILITY:");
    console.dir(courseAvailability, { depth: null });

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

    console.log("OLLAMA GENERATED SCHEDULE:");
    console.dir(schedule, { depth: null });

        /*
          Validate important factual rules.
        */

        validateGeneratedSchedule(
          schedule,
          courseAvailability,
          transcript.courses,
          schedulableRequirements
        );

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
      Return to frontend.
    */

    return NextResponse.json({
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

function courseCodeStringsEquivalent(
  firstCode: string,
  secondCode: string
): boolean {

  const first = normalizeCourseCode(firstCode);

  const second = normalizeCourseCode( secondCode);


  if (first === second) {
    return true;
  }


  /*
    Old 3-digit code vs newer
    4-digit course code.

    CSC493  <-> CSC4933
  */

  if (
    first.length + 1 === second.length &&
    second.startsWith(first)
  ) {
    return true;
  }


  if (
    second.length + 1 === first.length &&
    first.startsWith(second)
  ) {
    return true;
  }


  return false;
}