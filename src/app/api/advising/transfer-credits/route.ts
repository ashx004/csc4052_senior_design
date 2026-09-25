import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { extractedCourseSchema } from "@/src/library/advisingSchemas";
import { z } from "zod";

// The student enters these manually, so every course here is by
// definition transfer credit — status is forced server-side rather than
// trusted from the client, and term isn't meaningful for transfer rows
// the same way it is for in-house terms.
const manualTransferCourseSchema = extractedCourseSchema
  .omit({ status: true, term: true })
  .extend({
    courseCode: z.string().trim().min(1, "Course code is required."),
    creditHours: z.number().min(0).max(20).nullable(),
  });

const requestBodySchema = z.object({
  courses: z.array(manualTransferCourseSchema).min(1, "At least one course is required."),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);

    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.uid;

    const rawBody = await request.json();
    const parsed = requestBodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "The submitted transfer courses were invalid.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const newCourses = parsed.data.courses.map((course) => ({
      ...course,
      term: null,
      status: "transfer" as const,
    }));

    const transcriptRef = adminDb
      .collection("users")
      .doc(userId)
      .collection("transcript")
      .doc("data");

    const transcriptSnap = await transcriptRef.get();

    if (!transcriptSnap.exists) {
      return NextResponse.json(
        { error: "No transcript found. Please process your advising documents first." },
        { status: 404 }
      );
    }

    const existingData = transcriptSnap.data() ?? {};
    const existingCourses = Array.isArray(existingData.courses) ? existingData.courses : [];

    // Avoid duplicate entries if the student re-submits the same course
    // (e.g. re-opening the form after a page refresh).
    const isDuplicate = (a: (typeof newCourses)[number], b: any) =>
      a.courseCode.trim().toUpperCase() === String(b.courseCode ?? "").trim().toUpperCase() &&
      b.status === "transfer";

    const coursesToAdd = newCourses.filter(
      (newCourse) => !existingCourses.some((existing: any) => isDuplicate(newCourse, existing))
    );

    await transcriptRef.set(
      {
        courses: [...existingCourses, ...coursesToAdd],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      message: "Transfer credit was saved successfully.",
      addedCount: coursesToAdd.length,
      skippedDuplicates: newCourses.length - coursesToAdd.length,
    });
  } catch (error) {
    console.error("Manual transfer credit save failed:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The transfer credit could not be saved." },
      { status: 500 }
    );
  }
}