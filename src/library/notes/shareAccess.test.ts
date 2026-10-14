import { describe, expect, it } from "vitest";
import { checkShareAccess, parseInvitedEmails, parseShareAudience } from "./shareAccess";

describe("parseShareAudience", () => {
  it("defaults to anyone, so old links keep working", () => {
    expect(parseShareAudience(undefined)).toBe("anyone");
    expect(parseShareAudience("nonsense")).toBe("anyone");
    expect(parseShareAudience("invited")).toBe("invited");
  });
});

describe("parseInvitedEmails", () => {
  it("splits on commas, spaces and new lines, lower-cases and de-duplicates", () => {
    expect(parseInvitedEmails("A@x.edu, b@x.edu;\nb@X.edu  c@x.edu").emails).toEqual(["a@x.edu", "b@x.edu", "c@x.edu"]);
  });

  it("reports what is not an email", () => {
    expect(parseInvitedEmails("a@x.edu nope b@").invalid).toEqual(["nope", "b@"]);
  });

  it("accepts a list too", () => {
    expect(parseInvitedEmails(["a@x.edu", "A@x.edu"]).emails).toEqual(["a@x.edu"]);
  });
});

describe("checkShareAccess", () => {
  const share = { ownerUid: "owner", invitedEmails: ["friend@x.edu"] };

  it("lets anyone open an open or old share, signed in or not", () => {
    expect(checkShareAccess({ ...share, audience: "anyone" }, null)).toEqual({ allowed: true });
    expect(checkShareAccess({ ownerUid: "owner" }, null)).toEqual({ allowed: true });
  });

  it("asks a signed-out visitor to sign in", () => {
    expect(checkShareAccess({ ...share, audience: "signedIn" }, null)).toEqual({ allowed: false, reason: "sign-in" });
    expect(checkShareAccess({ ...share, audience: "invited" }, null)).toEqual({ allowed: false, reason: "sign-in" });
  });

  it("lets any account into a signed-in share", () => {
    expect(checkShareAccess({ ...share, audience: "signedIn" }, { uid: "u2" })).toEqual({ allowed: true });
  });

  it("lets only a verified, listed email into an invited share", () => {
    const invited = { ...share, audience: "invited" };
    expect(checkShareAccess(invited, { uid: "u2", email: "Friend@x.edu", emailVerified: true })).toEqual({ allowed: true });
    expect(checkShareAccess(invited, { uid: "u2", email: "friend@x.edu", emailVerified: false })).toEqual({ allowed: false, reason: "not-invited" });
    expect(checkShareAccess(invited, { uid: "u3", email: "other@x.edu", emailVerified: true })).toEqual({ allowed: false, reason: "not-invited" });
  });

  it("always lets the owner in", () => {
    expect(checkShareAccess({ ...share, audience: "invited" }, { uid: "owner" })).toEqual({ allowed: true });
  });
});
