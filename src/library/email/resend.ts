import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_EMAIL_PRIVATE_KEY);

export async function sendEmail(input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    idempotencyKey?: string;
}) {
    const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);

    if (error) { 
        throw new Error(error.message);
    }

    return data
}
