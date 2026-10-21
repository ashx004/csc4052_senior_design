import { createHash } from "node:crypto";
import type { ErrorSource } from "./alertRules";

// Strips the parts of a message or path that change between occurrences of
// the same bug (ids, numbers, quoted values) so they group together.
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/["'`][^"'`]{0,200}["'`]/g, "<str>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "<id>")
    .replace(/\d+/g, "N")
    .trim()
    .slice(0, 300);
}

/** "/courses/abc123def456ghi789jk/quizzes/9" -> "/courses/:id/quizzes/:id". Next's
 *  own route patterns ("/api/courses/[courseId]") pass through unchanged. */
export function normalizeRoute(route: string | undefined): string {
  if (!route) return "";
  const path = route.split(/[?#]/)[0];
  return path
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) || /^[A-Za-z0-9_-]{16,}$/.test(segment) ? ":id" : segment))
    .join("/");
}

export function errorFingerprint(source: ErrorSource, message: string, route?: string): string {
  return createHash("sha256")
    .update(`${source}|${normalizeMessage(message)}|${normalizeRoute(route)}`)
    .digest("hex")
    .slice(0, 20);
}
