import { NextRequest } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/src/library/firebaseAdmin";
import { generatePasswordResetLink } from "@/src/library/email/firebaseAuthActions";
import { sendEmail } from "@/src/library/email/resend";
import { passwordResetTemplate } from "@/src/library/email/templates";

export const runtime = "nodejs";

const ResetRequestSchema = z.object({
  email: z.string().trim().email().max(320),
});

// The same response is returned for invalid, unknown, and known addresses so
// this unauthenticated route cannot be used to discover which addresses have
// Catalyst accounts.
const GENERIC_RESPONSE = {
  message: "If an account exists for that email address, a reset link has been sent.",
};

export async function POST(request: NextRequest) {
  const parsed = ResetRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json(GENERIC_RESPONSE);

  const emailAddress = parsed.data.email.toLowerCase();

  try {
    const user = await adminAuth.getUserByEmail(emailAddress);
    const actionUrl = await generatePasswordResetLink(user.email!);
    const email = passwordResetTemplate({
      actionUrl,
      recipientName: user.displayName,
    });

    await sendEmail({
      to: user.email!,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";

    // `auth/user-not-found` is expected for a reset request. Keep all other
    // errors server-side as well, since a different client response can leak
    // whether this address has an account.
    if (code !== "auth/user-not-found") {
      console.error("[auth/password-reset] Failed:", error);
    }
  }

  return Response.json(GENERIC_RESPONSE);
}
