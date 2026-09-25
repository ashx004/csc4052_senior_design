import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_EMAIL_PRIVATE_KEY);

type email_fields = {
    to: string;
    subject: string;
    html: string;
}

export async function sendEmail(input: email_fields) {
    const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: [input.to],
        subject: input.subject,
        html: input.html
    });

    if (error) { 
        throw new Error(error.message);
    }

    return data
}