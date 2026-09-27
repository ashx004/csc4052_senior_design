import { NextRequest } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/src/library/firebaseAdmin";
import { getIdToken } from "@/src/library/firestoreRest";
import { generateEmailChangeLink } from "@/src/library/email/firebaseAuthActions";
import { sendEmail } from "@/src/library/email/resend";
import { emailChangeTemplate } from "@/src/library/email/templates";

export const runtime = "nodejs";

const RECENT_SIGN_IN_MAX_AGE_SECONDS = 5 * 60;
const EmailChangeRequestSchema = z.object({
  newEmail: z.string().trim().email().max(320),
});

export async function POST(request: NextRequest) {
  const idToken = getIdToken(request);
  if (!idToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = EmailChangeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid new email address." }, { status: 400 });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken, true);
    const authTime = decodedToken.auth_time;
    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (typeof authTime !== "number" || nowInSeconds - authTime > RECENT_SIGN_IN_MAX_AGE_SECONDS) {
      return Response.json(
        { error: "Recent sign-in is required before changing your email." },
        { status: 401 }
      );
    }

    const user = await adminAuth.getUser(decodedToken.uid);
    if (!user.email) {
      return Response.json({ error: "This account does not have an email address." }, { status: 400 });
    }

    const newEmail = parsed.data.newEmail.toLowerCase();
    if (user.email.toLowerCase() === newEmail) {
      return Response.json({ error: "The new email must be different from your current email." }, { status: 400 });
    }

    const actionUrl = await generateEmailChangeLink(user.email, newEmail);
    const email = emailChangeTemplate({
      actionUrl,
      recipientName: user.displayName,
      newEmail,
    });

    const result = await sendEmail({
      to: newEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    return Response.json({ sent: true, id: result?.id });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";

    if (code === "auth/email-already-exists") {
      return Response.json({ error: "That email address is already in use." }, { status: 409 });
    }
    if (code.startsWith("auth/")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[auth/email-change] Failed:", error);
    return Response.json({ error: "Unable to send the email-change confirmation." }, { status: 500 });
  }
}
