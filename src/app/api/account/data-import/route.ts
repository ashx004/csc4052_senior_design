import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AccountDataImportError,
  importAccountData,
  importByteLimit,
  parseImportArchive,
  previewAccountImport,
} from "@/src/library/accountDataImport";
import { isAccountDeletionInProgress } from "@/src/library/accountDeletionGuard";
import { checkRateLimit } from "@/src/library/rateLimit";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

const DecisionsSchema = z.record(z.string().max(1500), z.enum(["import", "skip", "merge", "copy"]));

/**
 * Imports a "Download my data" ZIP into the signed-in account.
 *
 * multipart/form-data with `file` (the ZIP) and `mode`:
 *  - "preview": checks the file and lists its classes, flagging any that
 *    already exist here. Writes nothing.
 *  - "import":  restores the classes, using `decisions` (JSON, class id ->
 *    "import" | "skip" | "merge" | "copy") for each one.
 *
 * Like the export, the target account comes only from the verified token: an
 * archive from another account is restored into this one, never into its own.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE });

  // Preview and import each upload the whole ZIP, so both count.
  const limit = checkRateLimit(`data-import:${auth.uid}`, 10 * 60_000, 10);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many import attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { ...PRIVATE, "Retry-After": String(limit.retryAfterSeconds ?? 600) } },
    );
  }

  // Reject an oversized upload before reading it. Allow a little room for the
  // multipart framing around the file.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > importByteLimit() + 1024 * 1024) {
    return NextResponse.json({ error: "This export is larger than the import limit." }, { status: 413, headers: PRIVATE });
  }

  try {
    if (await isAccountDeletionInProgress(auth.uid)) {
      return NextResponse.json({ error: "This account is being deleted." }, { status: 410, headers: PRIVATE });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const mode = form?.get("mode");
    if (!(file instanceof Blob) || (mode !== "preview" && mode !== "import")) {
      return NextResponse.json({ error: "Choose your Catalyst export ZIP to import." }, { status: 400, headers: PRIVATE });
    }

    const archive = await parseImportArchive(Buffer.from(await file.arrayBuffer()));
    if (mode === "preview") {
      return NextResponse.json(await previewAccountImport(auth.uid, archive), { headers: PRIVATE });
    }

    let decisions: Record<string, "import" | "skip" | "merge" | "copy"> = {};
    const rawDecisions = form?.get("decisions");
    if (typeof rawDecisions === "string" && rawDecisions) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawDecisions);
      } catch {
        parsed = null;
      }
      const result = DecisionsSchema.safeParse(parsed);
      if (!result.success) {
        return NextResponse.json({ error: "The import choices were invalid. Please try again." }, { status: 400, headers: PRIVATE });
      }
      decisions = result.data;
    }

    const summary = await importAccountData(auth.uid, archive, decisions);

    // Best-effort immediate pickup of queued documents; the worker process
    // drains anything left over (same as api/embed-document).
    if (summary.queuedJobs > 0 && process.env.INTERNAL_API_SECRET) {
      const { resolveInternalUrl } = await import("@/src/library/pdfExtract");
      fetch(resolveInternalUrl(request, "/api/document-jobs/worker"), {
        method: "POST",
        headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET },
      }).catch(() => console.error("[account/data-import] failed to start the document worker"));
    }

    return NextResponse.json(summary, { headers: PRIVATE });
  } catch (error) {
    if (error instanceof AccountDataImportError) {
      return NextResponse.json({ error: error.publicMessage }, { status: error.status, headers: PRIVATE });
    }
    // As in the export route: no exception text, it can carry object paths.
    console.error("[account/data-import] failed", { category: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Unable to import your data. Please try again." }, { status: 500, headers: PRIVATE });
  }
}
