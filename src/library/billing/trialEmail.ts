import { createHash } from "node:crypto";

/**
 * One inbox, one key: "J.Doe+catalyst@gmail.com" and "jdoe@gmail.com" reach
 * the same person, so they share one free trial. Gmail ignores dots and
 * everything after "+"; most other providers honor "+" tags too.
 */
export function normalizeEmail(email: string): string {
  const [rawLocal, rawDomain] = email.trim().toLowerCase().split("@");
  if (!rawLocal || !rawDomain) return email.trim().toLowerCase();
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0];
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

/** The stored key: a hash, so the trial list holds no readable email addresses. */
export function trialKey(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}
