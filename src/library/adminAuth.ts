import "server-only";

import { getRequestAuthToken } from "./requestAuthToken";

export class AdminAccessError extends Error {
  status: 401 | 403 | 503;

  constructor(status: 401 | 403 | 503, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestCredentials = {
  cookie?: string;
  authorization?: string | null;
};

export async function requireAdmin(credentials: RequestCredentials) {
  const token = getRequestAuthToken(credentials);
  if (!token) {
    throw new AdminAccessError(401, "Sign in to continue.");
  }

  let adminAuth;
  try {
    const firebase = await import("./firebaseAdmin");
    adminAuth = firebase.adminAuth;
  } catch {
    throw new AdminAccessError(
      503,
      "Administrator verification is unavailable. Check Firebase Admin configuration.",
    );
  }

  let decodedToken;
  try {
    const checkRevokedSessions = true;
    decodedToken = await adminAuth.verifyIdToken(token, checkRevokedSessions);
  } catch {
    throw new AdminAccessError(
      401,
      "Your session is invalid or expired. Sign in again.",
    );
  }

  if (decodedToken.admin !== true) {
    throw new AdminAccessError(403, "Administrator access is required.");
  }

  // Old tokens can retain the admin claim after the account loses access.
  let currentAccount;
  try {
    currentAccount = await adminAuth.getUser(decodedToken.uid);
  } catch {
    throw new AdminAccessError(
      503,
      "Administrator verification is temporarily unavailable.",
    );
  }

  if (currentAccount.disabled || currentAccount.customClaims?.admin !== true) {
    throw new AdminAccessError(403, "Administrator access has been revoked.");
  }

  return { uid: decodedToken.uid };
}
