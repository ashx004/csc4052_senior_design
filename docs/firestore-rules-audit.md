# Firestore Security Rules Audit

## The real finding (bigger than "add a rule for courseOfferingCache")

This repo has **no `firestore.rules` file** and **no Firebase Admin SDK anywhere** (confirmed: no `firebase-admin` import, no `signInWithCustomToken`, no service-account credential in the codebase). Every Firestore call — client-side in the browser *and* server-side in API routes — goes through the plain Firebase **client** SDK.

That matters because three API routes perform Firestore reads/writes server-side with no signed-in user at all:
- `src/app/api/chat/route.ts` (student profile, chat session data)
- `src/app/api/advising/route.ts` (reads `users/{uid}/enrollment`)
- `src/app/api/embed-document/route.ts` (writes to `.../resources/{id}/chunks`, updates the resource doc)

Firestore security rules only ever see `request.auth` (a real Firebase Auth token) and the request/resource data — they have no visibility into your app's own `verifyRequestAuth`/`x-internal-secret` checks, which are pure Next.js application logic. A server process that never called `signInWith...` has `request.auth == null` for every Firestore call it makes.

**For those three routes to work in production today (confirmed working — I've exercised all of them this session), whatever rules are actually deployed must already allow at least some access with `request.auth == null`.** Since `NEXT_PUBLIC_FIREBASE_API_KEY` is, by design, public (it ships in the client bundle — that's normal and fine for Firebase, the API key was never meant to be secret), **the real security boundary for this app is currently sitting entirely in the application layer** (`verifyRequestAuth`, the `key.startsWith(users/${uid}/)` ownership checks, rate limiting) rather than in Firestore's own rules. If the deployed rules are permissive enough to let the server through, they're very likely *also* permissive enough that anyone who opened devtools and grabbed the public API key could hit Firestore directly with the SDK/REST API and read or write any user's data, completely bypassing the Next.js app (and everything it enforces) altogether. I can't confirm the exact current rules — no Firebase CLI/credentials are available in this environment — but the architecture only leaves two possibilities, and neither is "properly locked down by rules today."

## Two ways to actually fix this

**A. Migrate server-side Firestore access to the Firebase Admin SDK** (the correct long-term fix, not attempted here). Admin SDK calls use a service-account credential and bypass security rules entirely by design — that's what lets you write genuinely strict rules (`allow read, write: if request.auth.uid == userId`) for direct browser access while the server keeps working through its own trusted, secret-key-based path. This closes the gap completely, but it's a real migration: a new secret to provision (a service-account JSON key, generated from the Firebase console — something I can't do without your access) and every server-side Firestore call across `chat`, `advising`, and `embed-document` would need to switch from the client SDK to `firebase-admin`. Given the stakes (security-critical, needs a new secret, touches multiple routes), I did **not** do this unprompted — it's a good candidate for a focused follow-up with your explicit go-ahead, not something to rush as a side effect of a rules audit.

**B. Keep the current architecture, tighten what can be tightened.** Below is a proposed `firestore.rules` file reflecting the intended per-owner access model for everything the *browser* touches directly, plus the `courseOfferingCache` rule flagged earlier in this session. It's written as a starting point for review, **not deployed** — I have no Firebase CLI/credentials in this environment to deploy it even if I wanted to, and guessing wrong on production security rules risks locking out real users. Note its explicit caveat: as written, this would break the three server-side routes above unless they're either exempted with a broader carve-out (weakening the fix) or migrated to Admin SDK first (Option A).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    match /users/{userId} {
      allow read, write: if isOwner(userId);

      match /enrollment/{enrollmentId} {
        allow read, write: if isOwner(userId);

        match /resources/{resourceId} {
          allow read, write: if isOwner(userId);

          match /chunks/{chunkId} {
            allow read, write: if isOwner(userId);
          }
        }
      }

      match /chatSessions/{sessionId} {
        allow read, write: if isOwner(userId);
      }
    }

    // Course-offering cache (src/library/courseOfferings/cache.ts) — shared,
    // read-only reference data, no per-user ownership concept. Only ever
    // written by the scraper/cache logic itself.
    match /courseOfferingCache/{sourceId} {
      allow read: if request.auth != null;
      allow write: if false; // written only via the app's own cache-refresh logic

      match /chunks/{chunkIndex} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }

    // Default-deny everything else.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**⚠️ Do not deploy this as-is without first resolving the server-side-write problem (Option A, or an equivalent).** As written, `allow write: if false` on `courseOfferingCache` and the strict `isOwner()` checks on `chunks`/`resources` would break `embed-document`'s server-side writes and `advising`'s server-side enrollment reads, since those requests have no `request.auth` at all today.

## Recommendation

Given the stakes, I'd treat this as: **(1)** you or someone with Firebase console access confirms what the currently-deployed rules actually say (the one thing I genuinely can't check from here), and **(2)** if they turn out to be permissive/test-mode as this analysis predicts, prioritize the Admin SDK migration (Option A) as a real, separate piece of work — it's the only way to get both "server routes keep working" and "rules are actually strict" at the same time.
