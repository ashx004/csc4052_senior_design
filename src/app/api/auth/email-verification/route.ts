import { NextRequest } from "next/server";
import { adminAuth } from "@/src/library/firebaseAdmin";
import { getIdToken } from "@/src/library/firestoreRest";
import { generateVerificationLink } from "@/src/library/email/firebaseAuthActions";
import { sendEmail } from "@/src/library/email/resend";
import { emailVerificationTemplate } from "@/src/library/email/templates";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const idToken = getIdToken(request);

    if (!idToken) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const user = await adminAuth.getUser(decodedToken.uid);

        if (!user.email) {
            return Response.json(
                { error: "This account does not have an email address." }, { status: 400 }
            );
        }

        if (user.emailVerified) {
            return Response.json({ sent: false, reason: "already-verified" });
        }

        const actionUrl = await generateVerificationLink(user.email);

        const email = emailVerificationTemplate({
            actionUrl,
            recipientName: user.displayName,
        });

        const result = await sendEmail({
            to: user.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
        });

        return Response.json({ sent: true, id: result?.id });
    }
    catch (error) {
        const code = typeof error === "object" && error && "code" in error
        ? String(error.code) : "";

        if (code.startsWith("auth/")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        console.error("[auth/email-verification] failed: ", error);
        return Response.json(
            { error: "Unable to send verification email." },
            { status: 500}
        );
    }
}
