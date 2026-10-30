import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminAccessError, requireAdmin } from "@/src/library/adminAuth";
import { SESSION_COOKIE } from "@/src/library/requestAuthToken";

/** For an admin page: sends a signed-out visitor to sign in and back to `path`; otherwise the reason access is refused, or undefined for an admin. */
export async function adminPageAccess(path: string): Promise<AdminAccessError | undefined> {
  let accessError: AdminAccessError | undefined;

  try {
    const cookieStore = await cookies();
    await requireAdmin({ cookie: cookieStore.get(SESSION_COOKIE)?.value });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      accessError = error;
    } else {
      accessError = new AdminAccessError(
        503,
        "Administrator verification is unavailable.",
      );
    }
  }

  // Next.js redirects throw internally, so keep this outside the try/catch.
  if (accessError?.status === 401) {
    redirect(`/login?redirect=${path}`);
  }

  return accessError;
}
