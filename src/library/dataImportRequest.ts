// Browser side of "Import my data" (api/account/data-import). Types mirror
// the route's responses; kept here so the settings UI doesn't import server code.

export type ImportDecision = "import" | "skip" | "merge" | "copy";

export type ImportClassPreview = {
  sourceId: string;
  classCode: string;
  className: string;
  term: string;
  counts: { documents: number; indexedDocuments: number; quizSets: number; flashcardSets: number; practiceSets: number };
  files: number;
  conflict: { id: string; className: string } | null;
};

export type ImportPreview = {
  generatedAt: string | null;
  fromAnotherAccount: boolean;
  classes: ImportClassPreview[];
};

export type ImportClassResult = {
  sourceId: string;
  className: string;
  action: "imported" | "merged" | "copied" | "skipped" | "failed";
  documents: number;
  quizSets: number;
  flashcardSets: number;
  practiceSets: number;
  files: number;
  searchRestored: number;
  queuedForIndexing: number;
  error?: string;
};

export type ImportSummary = { classes: ImportClassResult[]; queuedJobs: number };

/** Thrown when the connection drops mid-import. The server keeps going, so
 *  the classes usually appear shortly after. */
export class ImportStillRunningError extends Error {}

async function send(
  idToken: string,
  file: File,
  mode: "preview" | "import",
  decisions: Record<string, ImportDecision> | undefined,
  fetcher: typeof fetch,
): Promise<unknown> {
  const body = new FormData();
  body.set("file", file);
  body.set("mode", mode);
  if (decisions) body.set("decisions", JSON.stringify(decisions));

  let response: Response;
  try {
    response = await fetcher("/api/account/data-import", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { Authorization: `Bearer ${idToken}` },
      body,
    });
  } catch (error) {
    if (mode === "import") throw new ImportStillRunningError("Lost connection during import.", { cause: error });
    throw new Error("Couldn't reach Catalyst. Check your connection and try again.", { cause: error });
  }

  // A proxy timeout (Cloudflare 524, gateway 502/504) on a long import: the
  // server is still restoring.
  if (mode === "import" && [502, 504, 524].includes(response.status)) {
    throw new ImportStillRunningError("The import is taking longer than the connection allows.");
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof json?.error === "string" ? json.error : "Unable to import your data. Please try again.");
  }
  return json;
}

export function previewDataImport(idToken: string, file: File, fetcher: typeof fetch = fetch): Promise<ImportPreview> {
  return send(idToken, file, "preview", undefined, fetcher) as Promise<ImportPreview>;
}

export function runDataImport(
  idToken: string,
  file: File,
  decisions: Record<string, ImportDecision>,
  fetcher: typeof fetch = fetch,
): Promise<ImportSummary> {
  return send(idToken, file, "import", decisions, fetcher) as Promise<ImportSummary>;
}

/** What a class gets when the student hasn't chosen: existing classes are skipped. */
export function defaultDecision(cls: ImportClassPreview): ImportDecision {
  return cls.conflict ? "skip" : "import";
}
