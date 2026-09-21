import { z } from "zod";

// gemini's response's structure for advising

export const extractedCourseSchema = z.object({
  courseCode: z
    .string()
    .describe("Course code exactly as displayed on the transcript"),

  courseTitle: z
    .string()
    .nullable()
    .describe("Full course title exactly as displayed, or null if not shown"),

  term: z
    .string()
    .nullable()
    .describe("Term and year in which the course appears, or null if the transcript does not provide a term"),

  creditHours: z
    .number()
    .nullable()
    .describe("Credit hours, or null if not clearly shown"),

  grade: z
    .string()
    .nullable()
    .describe("Grade exactly as displayed, or null if no grade is shown"),

  status: z
    .enum([
      "completed",
      "in-progress",
      "withdrawn",
      "failed",
      "transfer",
      "unknown",
    ])
    .describe("Status of this individual course"),
});

export const courseOptionSchema = z.object({
  courseCode: z
    .string()
    .describe("Course code exactly as displayed"),

  courseTitle: z
    .string()
    .nullable()
    .describe("Course title, or null when not listed"),

  creditHours: z
    .number()
    .nullable()
    .describe("Credit hours"),

  prerequisites: z
    .array(z.string())
    .describe("Prerequisite course codes explicitly shown"),

  corequisites: z
    .array(z.string())
    .describe("Corequisite course codes explicitly shown"),

  minimumGrade: z
    .string()
    .nullable()
    .describe(
      "Minimum grade explicitly required by the curriculum, or null"
    ),
});

export const curriculumRequirementSchema = z.object({
  requirementId: z
    .string()
    .describe("A stable descriptive identifier"),

  requirementName: z.string(),

  description: z
    .string()
    .describe("Requirement wording from the curriculum"),

  requirementType: z.enum([
    "specific-course",
    "choose-from-list",
    "open-elective",
    "credit-requirement",
    "other",
  ]),

  numberRequired: z
    .number()
    .nullable()
    .describe("Number of courses required, or null"),

  creditsRequired: z
    .number()
    .nullable()
    .describe("Number of credits required, or null"),

  courseCode: z
    .string()
    .nullable()
    .describe("Required course code for a specific-course requirement"),

  courseTitle: z.string().nullable(),

  prerequisites: z
    .array(z.string())
    .describe("Prerequisites explicitly tied to this requirement"),

  corequisites: z
    .array(z.string())
    .describe("Corequisites explicitly tied to this requirement"),

  courseOptions: z.array(courseOptionSchema),

  optionsExplicitlyListed: z
    .boolean()
    .describe(
      "True only when the document explicitly provides the eligible courses"
    ),

  sourceText: z
    .string()
    .describe("Short curriculum text supporting this requirement"),

  minimumGrade: z
    .string()
    .nullable()
    .describe(
      "Minimum grade explicitly required by the curriculum, or null"
    ),

  eligibilityRules: z
    .object({
    allowedCourseCodes: z.array(z.string()),
    allowedSubjectPrefixes: z.array(z.string()),
    minimumCourseLevel: z.number().nullable(),
    maximumCourseLevel: z.number().nullable(),
    excludedCourseCodes: z.array(z.string()),
    sourceText: z.string().nullable(),
  })
  .nullable()
  .default(null),

});

export const concentrationSchema = z.object({
  concentrationName: z.string(),

  description: z.string(),

  totalCredits: z.number().nullable(),

  requirements: z.array(curriculumRequirementSchema),

  sourceText: z
    .string()
    .describe("Short document text supporting the concentration"),
});

export const advisingExtractionSchema = z.object({
  transcript: z.object({

    studentName: z.string().nullable(),

    major: z.string().nullable(),

    concentration: z.string().nullable().describe(
        "Student concentration, track, specialization, emphasis, or similar program option exactly as displayed"),

    catalogYear: z.string().nullable(),

    courses: z.array(extractedCourseSchema),
  }),

  curriculum: z.object({
    programName: z.string().nullable(),

    degreeName: z.string().nullable(),

    catalogYear: z.string().nullable(),

    totalDegreeCredits: z.number().nullable(),

    requirements: z.array(curriculumRequirementSchema),

    concentrations: z.array(concentrationSchema),
  }),

  warnings: z
    .array(z.string())
    .describe(
      "Unclear, unreadable, conflicting, or incomplete information requiring review"
    ),
});

export type ElectiveEligibilityRules = {
  allowedCourseCodes: string[];
  allowedSubjectPrefixes: string[];
  minimumCourseLevel: number | null;
  maximumCourseLevel: number | null;
  excludedCourseCodes: string[];
  sourceText: string | null;
};

export const transcriptExtractionSchema = z.object({
  studentName: z.string().nullable(),
  major: z.string().nullable(),
  concentration: z.string().nullable(),
  catalogYear: z.string().nullable(),
  courses: z.array(extractedCourseSchema),
  warnings: z.array(z.string()).default([]),
});

export const curriculumExtractionSchema = z.object({
  programName: z.string().nullable(),
  degreeName: z.string().nullable(),
  catalogYear: z.string().nullable(),
  totalDegreeCredits: z.number().nullable(),
  requirements: z.array(curriculumRequirementSchema),
  concentrations: z.array(concentrationSchema),
  warnings: z.array(z.string()).default([]),
});

export const generatedScheduleCourseSchema = z.object({
  courseCode: z.string(),
  courseTitle: z.string().nullable(),
  creditHours: z.number().nullable(),
  requirementId: z.string().nullable(),
});

export const generatedScheduleTermSchema = z.object({
  term: z.enum([
    "Fall",
    "Winter",
    "Spring",
    "Summer",
  ]),

  year: z.number().int(),

  courses: z.array(generatedScheduleCourseSchema),
});

export const generatedAdvisingScheduleSchema = z.object({
  terms: z.array(generatedScheduleTermSchema),

  warnings: z.array(z.string()).default([]),
});

export type GeneratedAdvisingSchedule = z.infer<
  typeof generatedAdvisingScheduleSchema
>;