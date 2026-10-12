import { NextRequest, NextResponse } from "next/server";
import { buildAccountDataExport, AccountDataExportError } from "@/src/library/accountDataExport";
import { accountExportFilename } from "@/src/library/accountDataExportFormat";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Downloads a complete, owner-authorized data export. The route derives the
 * subject solely from the verified Firebase token, never a UID query/body
 * parameter, so a signed-in user cannot export another account's records.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const archive = await buildAccountDataExport(auth.uid);
    return new NextResponse(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"${accountExportFilename()}\"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AccountDataExportError) {
      return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    }
    // Do not log the archive, object paths, or exception text here. Export
    // exceptions can carry infrastructure/object details and this route
    // handles user-supplied documents.
    console.error("[account/data-export] failed", {
      category: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Unable to create a data export. Please try again." }, { status: 500 });
  }
}
