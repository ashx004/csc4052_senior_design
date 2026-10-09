import { NextRequest, NextResponse } from "next/server";
import { firestoreGet, getIdToken } from "@/src/library/firestoreRest";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { extractSyllabusInfo } from "@/src/library/syllabusExtract";
import { SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

// Reads one of the student's course files and PROPOSES course details; the
// browser shows them for review and saves what the student accepts.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    const idToken = getIdToken(request);
    if (!auth || !idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limit = checkRateLimit(`syllabus:${auth.uid}`, RATE_WINDOW_MS, RATE_MAX);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests - please wait a moment." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const { courseId, resourceId } = await request.json();
    if (typeof courseId !== "string" || typeof resourceId !== "string" || !courseId || !resourceId) {
      return NextResponse.json({ error: "courseId and resourceId are required" }, { status: 400 });
    }

    const enrollmentPath = `users/${auth.uid}/enrollment`;
    const [enrollment, resource] = await Promise.all([
      firestoreGet(idToken, enrollmentPath, courseId),
      firestoreGet(idToken, `${enrollmentPath}/${courseId}/resources`, resourceId),
    ]);
    if (!enrollment || !resource) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const url = typeof resource.url === "string" ? resource.url : "";
    const fileType = typeof resource.fileType === "string" ? resource.fileType.toLowerCase() : "";
    if (!url || !SUPPORTED_DOCUMENT_TYPES.includes(fileType)) {
      return NextResponse.json({ error: "That file type can't be read. Try a PDF, Word document, text file or photo." }, { status: 415 });
    }

    const info = await extractSyllabusInfo(request, { url, fileType }, {
      classCode: String(enrollment.classCode ?? ""),
      className: String(enrollment.className ?? ""),
      term: String(enrollment.term ?? ""),
    });
    return NextResponse.json({ info, name: String(resource.name ?? "") });
  } catch (error) {
    console.error("Syllabus extraction failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't read the syllabus." }, { status: 500 });
  }
}
