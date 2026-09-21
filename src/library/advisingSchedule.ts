export type TranscriptCourse = {
  courseCode: string;
  courseTitle: string | null;
  term: string | null;
  creditHours: number | null;
  grade: string | null;
  status: string;
};

export type TranscriptData = {
  studentName: string | null;
  major: string | null;
  concentration: string | null;
  catalogYear?: string | null;
  courses: TranscriptCourse[];
  warnings?: string[];
};

export type CourseOption = {
  courseCode: string;
  courseTitle: string | null;
  creditHours: number | null;
  minimumGrade?: string | null;
  prerequisites: string[];
  corequisites: string[];
};

export type ElectiveEligibilityRules = {
  allowedCourseCodes: string[];
  allowedSubjectPrefixes: string[];
  minimumCourseLevel: number | null;
  maximumCourseLevel: number | null;
  excludedCourseCodes: string[];
  sourceText: string | null;
};

export type CurriculumRequirement = {
  requirementId: string;
  requirementName: string;
  description: string;

  requirementType:
    | "specific-course"
    | "choose-from-list"

    | "open-elective"
    | "credit-requirement"
    | "other";

  numberRequired: number | null;
  creditsRequired: number | null;

  courseCode: string | null;
  courseTitle: string | null;

  minimumGrade?: string | null;

  prerequisites: string[];
  corequisites: string[];

  courseOptions: CourseOption[];

  optionsExplicitlyListed: boolean;

  eligibilityRules:
    ElectiveEligibilityRules | null;

  sourceText: string;
};

export type Concentration = {
  concentrationName: string;
  description: string;
  totalCredits: number | null;
  requirements: CurriculumRequirement[];
  sourceText: string;
};

export type CurriculumData = {
  programName: string | null;
  degreeName: string | null;
  catalogYear: string | null;
  totalDegreeCredits: number | null;

  requirements: CurriculumRequirement[];

  concentrations: Concentration[];

  warnings?: string[];
};


// helps for differientiating courses w/ 3 number codes and 4 number codes //

function cleanCourseCode(code: string): string {
  return code
    .replace(/\s+/g, "")
    .toUpperCase();
}


function splitCourseCode(code: string): {
  subject: string;
  number: string;
} | null {

  const cleaned = cleanCourseCode(code);

  const match = cleaned.match(/^([A-Z]+)(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    subject: match[1],
    number: match[2],
  };
}


export function courseCodesEquivalent(
  curriculumCode: string,
  transcriptCourse: TranscriptCourse,
  curriculumTitle?: string | null
): boolean {

  const curriculum = splitCourseCode(curriculumCode);
  const transcript = splitCourseCode(
    transcriptCourse.courseCode
  );

  if (!curriculum || !transcript) {
    return false;
  }

  // exact course-code match
  if (
    curriculum.subject === transcript.subject &&
    curriculum.number === transcript.number
  ) {
    return true;
  }

  // subjects must always match
  if (curriculum.subject !== transcript.subject) {
    return false;
  }

  // old 3-digit curriculum code vs newer 4-digit transcript code
  if (
    curriculum.number.length === 3 &&
    transcript.number.length === 4 &&
    transcript.number.startsWith(curriculum.number)
  ) {

    const finalDigit =
      Number(transcript.number.slice(-1));

    if (
      transcriptCourse.creditHours === null ||
      finalDigit !== transcriptCourse.creditHours
    ) {
      return false;
    }

    // Extra protection against false matches such as:
    // CSC 403 "Senior Capstone I"
    // CSC 4033 "Software Design and Engineering"
    if (
        curriculumTitle &&
        transcriptCourse.courseTitle
        ) {
        const normalizeTitle = (title: string) =>
            title
            .toUpperCase()
            .replace(/&/g, " AND ")
            .replace(/\bMGMT\b/g, "MANAGEMENT")
            .replace(/\bADV\b/g, "ADVANCED")
            .replace(/\bSCI\b/g, "SCIENCE")
            .replace(/\bENGR\b/g, "ENGINEERING")
            .replace(/\bTECH\b/g, "TECHNICAL")
            .replace(/\./g, "")
            .replace(/[^A-Z0-9]+/g, " ")
            .trim();

        const curriculumNormalized =
            normalizeTitle(curriculumTitle);

        const transcriptNormalized =
            normalizeTitle(
            transcriptCourse.courseTitle
            );

        if (
            curriculumNormalized !==
            transcriptNormalized
        ) {
            return false;
        }
        }

    return true;
  }

  return false;
}



function gradeRank(
  grade: string | null
): number | null {

  if (!grade) { return null; }

  const normalized = grade.trim().toUpperCase();

  switch (normalized) {
    case "A":
      return 4;

    case "B":
      return 3;

    case "C":
      return 2;

    case "D":
      return 1;

    case "F":
      return 0;

    case "P":
      return 2;

    default:
      return null;
  }
}


function satisfiesMinimumGrade(
  course: TranscriptCourse,
  minimumGrade?: string | null
): boolean {

  if (!minimumGrade) { return true; }

  const courseRank = gradeRank(course.grade);
  const minimumRank = gradeRank(minimumGrade);

  if ( courseRank === null || minimumRank === null )
  {
    return false;
  }

  return courseRank >= minimumRank;
}


function satisfiesCompletedRequirement(
  course: TranscriptCourse,
  minimumGrade?: string | null
): boolean {
  return ( course.status === "completed" && satisfiesMinimumGrade( course, minimumGrade ));
}

// separate the transcript statuses | completed & in-progress //

function findCompletedCourse(
  courseCode: string,
  transcriptCourses: TranscriptCourse[],
  courseTitle?: string | null,
  minimumGrade?: string | null
): TranscriptCourse | undefined {

  return transcriptCourses.find(
    (course) =>
      satisfiesCompletedRequirement(course, minimumGrade) &&
      courseCodesEquivalent(courseCode, course, courseTitle)
  );
}

function findInProgressCourse(
  courseCode: string,
  transcriptCourses: TranscriptCourse[],
  courseTitle?: string | null
): TranscriptCourse | undefined {

  return transcriptCourses.find(
    (course) =>
      course.status === "in-progress" &&
      courseCodesEquivalent(
        courseCode,
        course,
        courseTitle
      )
  );
}


// evaluate required courses //

export function evaluateRequirement(
  requirement: CurriculumRequirement,
  transcriptCourses: TranscriptCourse[]
) {

  /*
    TYPE 1:
    One specific required course
  */

  if (requirement.requirementType === "specific-course") {

    if (!requirement.courseCode) {
      return {
        requirement,
        status: "needs-review" as const,
        reason:
          "Specific-course requirement does not contain a course code.",
      };
    }

    const completedMatch = findCompletedCourse(requirement.courseCode, 
        transcriptCourses, requirement.courseTitle, requirement.minimumGrade);

    if (completedMatch) {
      return {
        requirement,
        status: "completed" as const,
        transcriptCourses: [
          completedMatch,
        ],
      };
    }

    const inProgressMatch =
      findInProgressCourse(
        requirement.courseCode,
        transcriptCourses,
        requirement.courseTitle
      );

    if (inProgressMatch) {
      return {
        requirement,
        status: "in-progress" as const,
        transcriptCourses: [
          inProgressMatch,
        ],
      };
    }

    return {
      requirement,
      status: "remaining" as const,
      transcriptCourses: [],
    };
  }


  /*
    TYPE 2:
    Choose one or more courses from
    an explicit list.

    Example:
      ENGL 210 OR 211 OR 212
  */

  if (
    requirement.requirementType ===
    "choose-from-list"
  ) {

    if (
      !requirement.courseOptions ||
      requirement.courseOptions.length === 0
    ) {

      return {
        requirement,
        status: "needs-review" as const,
        reason:
          "No course options were provided for this choice requirement.",
      };
    }


    const completedOptions =
      requirement.courseOptions
        .map((option) => {

          const match =
            findCompletedCourse(
              option.courseCode,
              transcriptCourses,
              option.courseTitle,
              option.minimumGrade
            );

          if (!match) {
            return null;
          }

          return {
            option,
            transcriptCourse: match,
          };
        })
        .filter(
          (
            item
          ): item is {
            option: CourseOption;
            transcriptCourse: TranscriptCourse;
          } => item !== null
        );


    const inProgressOptions =
      requirement.courseOptions
        .map((option) => {

          const match =
            findInProgressCourse(
              option.courseCode,
              transcriptCourses
            );

          if (!match) {
            return null;
          }

          return {
            option,
            transcriptCourse: match,
          };
        })
        .filter(
          (
            item
          ): item is {
            option: CourseOption;
            transcriptCourse: TranscriptCourse;
          } => item !== null
        );


    const numberRequired =
      requirement.numberRequired ?? 1;

    const completedCount =
      completedOptions.length;

    const activeCount =
      completedOptions.length +
      inProgressOptions.length;


    if (
      completedCount >= numberRequired
    ) {

      return {
        requirement,
        status: "completed" as const,
        completedOptions,
        inProgressOptions,
        remainingCount: 0,
      };
    }


    if (
      activeCount >= numberRequired
    ) {

      return {
        requirement,
        status: "in-progress" as const,
        completedOptions,
        inProgressOptions,
        remainingCount: 0,
      };
    }


    return {
      requirement,
      status: "remaining" as const,
      completedOptions,
      inProgressOptions,

      remainingCount:
        Math.max(
          numberRequired -
            activeCount,
          0
        ),
    };
  }


  /*
    TYPE 3:
    Broad/general requirements.

    We do NOT automatically guess which
    courses satisfy these yet.
  */

  if (
    requirement.requirementType ===
      "open-elective" ||

    requirement.requirementType ===
      "credit-requirement" ||

    requirement.requirementType ===
      "other"
  ) {

    return {
      requirement,
      status: "needs-review" as const,

      reason:
        "This requirement cannot yet be evaluated safely from exact course-code matching.",
    };
  }


  return {
    requirement,
    status: "needs-review" as const,
    reason:
      "Unknown requirement type.",
  };
}

export function evaluateRequirements(
  requirements: CurriculumRequirement[],
  transcriptCourses: TranscriptCourse[]
) {

  return requirements.map(
    (requirement) =>
      evaluateRequirement(
        requirement,
        transcriptCourses
      )
  );
}


// find the correct concentration //

function normalizeConcentrationName(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/\bCONCENTRATION\b/g, "")
    .replace(/\bTRACK\b/g, "")
    .replace(/\bSPECIALIZATION\b/g, "")
    .replace(/\bEMPHASIS\b/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function findStudentConcentration(
  transcriptConcentration: string | null,
  concentrations: Concentration[]
): Concentration | null {

  if (!transcriptConcentration) { return null; }

  const target = normalizeConcentrationName(transcriptConcentration);

  const match = concentrations.find(
    (concentration) => normalizeConcentrationName(concentration.concentrationName) === target
  );

  return match ?? null;
}

function sumTranscriptCredits(
  courses: TranscriptCourse[],
  statuses: string[]
): number {

  return courses.reduce(
    (total, course) => {

      if (
        !statuses.includes(course.status) ||
        course.creditHours === null
      ) {
        return total;
      }

      return total + course.creditHours;
    },
    0
  );
}


function sumRequirementCreditsByStatus(
  results: ReturnType<
    typeof evaluateRequirements
  >,
  statuses: string[]
): number {

  return results.reduce(
    (total, result) => {

      if (
        !statuses.includes(result.status)
      ) {
        return total;
      }

      const credits = result.requirement.creditsRequired;

      if (credits === null) {
        return total;
      }

      return total + credits;
    },
    0
  );
}


function normalizeRequirementName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// complete academic progress object build //

export function buildAcademicProgress(
  transcript: TranscriptData,
  curriculum: CurriculumData
) {

  const initialProgramRequirements =
    evaluateRequirements(
      curriculum.requirements ?? [],
      transcript.courses ?? []
    );


  const concentration =
    findStudentConcentration(
      transcript.concentration,
      curriculum.concentrations ?? []
    );


  const concentrationRequirements =
    concentration
      ? evaluateRequirements(
          concentration.requirements ?? [],
          transcript.courses ?? []
        )
      : [];


  const programRequirements =
    evaluateBroadProgramRequirements(
      initialProgramRequirements,
      transcript,
      concentration,
      concentrationRequirements
    );


  return {

    student: {
      studentName:
        transcript.studentName,

      major:
        transcript.major,

      concentration:
        transcript.concentration,
    },


    program: {
      requirements:
        programRequirements,
    },


    concentration:
      concentration
        ? {
            name:
              concentration.concentrationName,

            totalCredits:
              concentration.totalCredits,

            requirements:
              concentrationRequirements,
          }
        : null,
  };
}


function evaluateBroadProgramRequirements(
  programResults: ReturnType<
    typeof evaluateRequirements
  >,
  transcript: TranscriptData,
  concentration: Concentration | null,
  concentrationResults: ReturnType<
    typeof evaluateRequirements
  >
) {

  const completedTranscriptCredits =
    sumTranscriptCredits(
      transcript.courses,
      ["completed"]
    );

  const inProgressTranscriptCredits =
    sumTranscriptCredits(
      transcript.courses,
      ["in-progress"]
    );


  const completedConcentrationCredits =
    sumRequirementCreditsByStatus(
      concentrationResults,
      ["completed"]
    );

  const activeConcentrationCredits =
    sumRequirementCreditsByStatus(
      concentrationResults,
      [
        "completed",
        "in-progress",
      ]
    );


  const hasTransferUncertainty =
    (transcript.warnings ?? []).some(
      (warning) =>
        warning
          .toLowerCase()
          .includes("transfer")
    );


  return programResults.map(
    (result) => {

      const requirement =
        result.requirement;

      const normalizedName =
        normalizeRequirementName(
          requirement.requirementName
        );


      /*
        MINOR / CONCENTRATION
      */

      if (
        requirement.requirementType ===
            "open-elective" &&
        concentration &&
        ( normalizedName.includes("CONCENTRATION") || normalizedName.includes("MINOR") )
        ) {

        const requiredCredits =
          requirement.creditsRequired ??
          concentration.totalCredits ??
          0;


        if (
          completedConcentrationCredits >=
          requiredCredits
        ) {
          return {
            requirement,
            status: "completed" as const,

            completedCredits:
              completedConcentrationCredits,

            requiredCredits,

            remainingCredits: 0,
          };
        }


        if (
          activeConcentrationCredits >=
          requiredCredits
        ) {
          return {
            requirement,
            status: "in-progress" as const,

            completedCredits:
              completedConcentrationCredits,

            activeCredits:
              activeConcentrationCredits,

            requiredCredits,

            remainingCredits: 0,
          };
        }


        return {
          requirement,
          status: "remaining" as const,

          completedCredits:
            completedConcentrationCredits,

          activeCredits:
            activeConcentrationCredits,

          requiredCredits,

          remainingCredits:
            Math.max(
              requiredCredits -
                activeConcentrationCredits,
              0
            ),
        };
      }

        /*
    GENERIC OPEN ELECTIVE REQUIREMENT
  */

  if (
    requirement.requirementType ===
    "open-elective"
  ) {

    if (
      requirement.optionsExplicitlyListed &&
      requirement.courseOptions.length > 0
    ) {

      const completedOptions =
        requirement.courseOptions
          .map((option) => {

            const match =
              transcript.courses.find(
                (course) =>
                  course.status ===
                    "completed" &&
                  courseCodesEquivalent(
                    option.courseCode,
                    course,
                    option.courseTitle
                  )
              );

            if (!match) {
              return null;
            }

            return {
              option,
              transcriptCourse: match,
            };
          })
          .filter(
            (
              item
            ): item is {
              option: CourseOption;
              transcriptCourse: TranscriptCourse;
            } => item !== null
          );


      const completedCredits =
        completedOptions.reduce(
          (total, item) =>
            total +
            (
              item.transcriptCourse
                .creditHours ?? 0
            ),
          0
        );


      const requiredCredits =
        requirement.creditsRequired ??
        0;


      const requiredCount =
        requirement.numberRequired ??
        0;


      const enoughCredits =
        requiredCredits === 0 ||
        completedCredits >=
          requiredCredits;


      const enoughCourses =
        requiredCount === 0 ||
        completedOptions.length >=
          requiredCount;


      if (
        enoughCredits &&
        enoughCourses
      ) {

        return {
          requirement,

          status:
            "completed" as const,

          completedOptions,

          completedCredits,

          requiredCredits,

          remainingCredits: 0,
        };
      }


      return {
        requirement,

        status:
          "remaining" as const,

        completedOptions,

        completedCredits,

        requiredCredits,

        remainingCredits:
          Math.max(
            requiredCredits -
              completedCredits,
            0
          ),

        remainingCount:
          Math.max(
            requiredCount -
              completedOptions.length,
            0
          ),
      };
    }


    return {
      requirement,

      status:
        "needs-review" as const,

      reason:
        "The curriculum requires an elective, but it does not explicitly list the exact courses that may satisfy it.",
    };
  }

      /*
        TOTAL SEMESTER HOURS
      */

      if (
        requirement.requirementType === "credit-requirement" && requirement.creditsRequired !== null
      ) {

        const requiredCredits = requirement.creditsRequired;
        const activeCredits = completedTranscriptCredits + inProgressTranscriptCredits;

        /*
          We intentionally do not call the
          120-hour requirement complete when
          transfer credits might exist but were
          not extracted as individual courses.
        */

        if (hasTransferUncertainty) {

          return {
            requirement,
            status: "needs-review" as const,
            reason:
              "Total degree credits cannot be finalized because transfer credit may not be represented in the extracted course rows.",
            completedCreditsFromTranscript: completedTranscriptCredits,
            inProgressCreditsFromTranscript: inProgressTranscriptCredits,
            activeCreditsFromTranscript: activeCredits,
            requiredCredits,
          };
        }


        if (
          completedTranscriptCredits >= requiredCredits
        ) {

          return {
            requirement,
            status: "completed" as const,
            completedCredits: completedTranscriptCredits,
            requiredCredits,
            remainingCredits: 0,
          };
        }


        if (
          activeCredits >= requiredCredits
        ) {

          return {
            requirement,
            status: "in-progress" as const,
            completedCredits: completedTranscriptCredits,
            activeCredits,
            requiredCredits,
            remainingCredits: 0,
          };
        }


        return {
          requirement,
          status: "remaining" as const,
          completedCredits: completedTranscriptCredits,
          activeCredits,
          requiredCredits,
          remainingCredits: Math.max(requiredCredits - activeCredits, 0),
        };
      }


      return result;
    }
  );
}