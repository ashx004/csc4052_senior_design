import { z } from "zod";

// gemini's response's structure for advising

export const extractedCourseSchema = z.object({
  courseCode: z
    .string()
    .describe("Course code exactly as displayed, such as CSC 3303"),

  courseTitle: z
    .string()
    .describe("Full course title exactly as displayed"),

  term: z
    .string()
    .describe("Term and year in which the course appears"),

  creditHours: z
    .number()
    .describe("Credit hours"),

  grade: z
    .string()
    .describe("Grade exactly as displayed"),

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

  /*sourceText: z
    .string()
    .describe("Short text from the document supporting this record"), */
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
    .describe("Credit hours"),

  prerequisites: z
    .array(z.string())
    .describe("Prerequisite course codes explicitly shown"),

  corequisites: z
    .array(z.string())
    .describe("Corequisite course codes explicitly shown"),
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

export type AdvisingExtraction = z.infer<
  typeof advisingExtractionSchema
>;