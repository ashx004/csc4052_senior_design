// Who may open a shared note or notebook. Pure, so it is unit-tested; the share
// route does the sign-in and Firestore lookups and hands the results in.

/** anyone: no account needed. signedIn: any Catalyst account. invited: only the listed emails. */
export const SHARE_AUDIENCES = ["anyone", "signedIn", "invited"] as const;
export type ShareAudience = (typeof SHARE_AUDIENCES)[number];

export const MAX_INVITED_EMAILS = 50;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function parseShareAudience(value: unknown): ShareAudience {
  return (SHARE_AUDIENCES as readonly string[]).includes(value as string) ? (value as ShareAudience) : "anyone";
}

/** Emails typed into a box (or sent as a list): split on commas, semicolons, spaces and
 *  new lines, lower-cased, de-duplicated. `invalid` holds what didn't look like an email. */
export function parseInvitedEmails(input: unknown): { emails: string[]; invalid: string[] } {
  const parts = Array.isArray(input) ? input.map(String) : typeof input === "string" ? input.split(/[\s,;]+/) : [];
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of parts.map((p) => p.trim().toLowerCase()).filter(Boolean)) {
    if (!EMAIL.test(part)) invalid.push(part);
    else if (!emails.includes(part)) emails.push(part);
  }
  return { emails, invalid };
}

export interface ShareViewer {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
}

export type ShareAccessResult = { allowed: true } | { allowed: false; reason: "sign-in" | "not-invited" };

export function checkShareAccess(
  share: { audience?: unknown; invitedEmails?: unknown; ownerUid?: unknown },
  viewer: ShareViewer | null
): ShareAccessResult {
  // Shares made before audiences existed were open to anyone with the link.
  const audience = parseShareAudience(share.audience);
  if (audience === "anyone") return { allowed: true };
  if (!viewer) return { allowed: false, reason: "sign-in" };
  if (viewer.uid === share.ownerUid) return { allowed: true };
  if (audience === "signedIn") return { allowed: true };
  const invited = Array.isArray(share.invitedEmails) ? share.invitedEmails.map((e) => String(e).toLowerCase()) : [];
  // An unverified address could be typed by anyone, so only a verified one counts as that person.
  const email = viewer.emailVerified && viewer.email ? viewer.email.toLowerCase() : "";
  return email && invited.includes(email) ? { allowed: true } : { allowed: false, reason: "not-invited" };
}
