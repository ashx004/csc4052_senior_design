// A throw whose message is written for the student, not for a log.
//
// The generation routes answer 400 with `error.message` for these and only
// these. Everything else — a object storage outage, a Qdrant timeout, a bug in chunk
// selection — keeps the routes' fixed-message 500/502, so internal text can
// never reach the client dressed up as a bad request.

export class SourceSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceSelectionError";
  }
}

export function isSourceSelectionError(error: unknown): error is SourceSelectionError {
  return error instanceof SourceSelectionError;
}
