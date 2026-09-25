export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

type AuthTemplateInput = {
  actionUrl: string;
  recipientName?: string | null;
};

type DueReminderTemplateInput = {
  assignmentTitle: string;
  dueAtLabel: string;
  leadTimeLabel: string;
  courseName?: string | null;
  recipientName?: string | null;
  calendarUrl?: string | null;
};

const COLORS = {
  navy: "#1A1A30",
  gold: "#B08957",
  goldDark: "#9C7849",
  canvas: "#FAFAF8",
  warm: "#F5F0EB",
  sage: "#DCE8D8",
  text: "#3D3A34",
  muted: "#8A8477",
  border: "#E7E0D8",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? escapeHtml(url.toString()) : "#";
  } catch {
    return "#";
  }
}

function greeting(name?: string | null): string {
  return name?.trim() ? `Hi ${escapeHtml(name.trim())},` : "Hi,";
}

function emailShell(input: {
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  note?: string;
}): string {
  const cta = input.ctaLabel && input.ctaUrl
    ? `<tr>
        <td style="padding: 8px 32px 28px;">
          <a href="${safeUrl(input.ctaUrl)}" style="display: inline-block; border-radius: 8px; background: ${COLORS.navy}; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; line-height: 20px; padding: 13px 22px; text-decoration: none;">${escapeHtml(input.ctaLabel)}</a>
        </td>
      </tr>`
    : "";

  const note = input.note
    ? `<tr><td style="padding: 0 32px 28px; color: ${COLORS.muted}; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px;">${input.note}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: ${COLORS.canvas};">
    <span style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">${escapeHtml(input.preheader)}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: ${COLORS.canvas};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px;">
            <tr>
              <td style="padding: 0 8px 14px; color: ${COLORS.navy}; font-family: Georgia, 'Times New Roman', serif; font-size: 25px; font-weight: 700; letter-spacing: .5px;">Catalyst<span style="color: ${COLORS.gold};">.</span></td>
            </tr>
            <tr>
              <td style="border: 1px solid ${COLORS.border}; border-radius: 14px; background: #ffffff; overflow: hidden;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="height: 8px; background: ${COLORS.gold}; font-size: 0; line-height: 0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="padding: 32px 32px 10px; color: ${COLORS.goldDark}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.3px; line-height: 16px; text-transform: uppercase;">${escapeHtml(input.eyebrow)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 32px 18px; color: ${COLORS.navy}; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; font-weight: 700; letter-spacing: -.3px; line-height: 37px;">${escapeHtml(input.title)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 0 32px 22px; color: ${COLORS.text}; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 25px;">${input.body}</td>
                  </tr>
                  ${cta}
                  ${note}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 12px 0; color: ${COLORS.muted}; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px; text-align: center;">Catalyst helps you keep your coursework moving forward.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailVerificationTemplate(input: AuthTemplateInput): EmailTemplate {
  return {
    subject: "Verify your Catalyst email",
    text: `${input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},\n\n` : ""}Verify your email to finish setting up Catalyst: ${input.actionUrl}\n\nIf you did not create this account, you can safely ignore this email.`,
    html: emailShell({
      preheader: "Verify your email to finish setting up Catalyst.",
      eyebrow: "Account setup",
      title: "Verify your email",
      body: `<p style="margin: 0 0 16px;">${greeting(input.recipientName)}</p><p style="margin: 0;">Welcome to Catalyst. Confirm your email address to finish setting up your account and keep your study tools in sync.</p>`,
      ctaLabel: "Verify email",
      ctaUrl: input.actionUrl,
      note: "If you did not create a Catalyst account, you can safely ignore this email.",
    }),
  };
}

export function passwordResetTemplate(input: AuthTemplateInput): EmailTemplate {
  return {
    subject: "Reset your Catalyst password",
    text: `${input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},\n\n` : ""}Use this link to reset your Catalyst password: ${input.actionUrl}\n\nIf you did not request a password reset, no action is needed.`,
    html: emailShell({
      preheader: "Use this secure link to reset your Catalyst password.",
      eyebrow: "Account security",
      title: "Reset your password",
      body: `<p style="margin: 0 0 16px;">${greeting(input.recipientName)}</p><p style="margin: 0;">We received a request to reset your Catalyst password. Use the secure link below to choose a new one.</p>`,
      ctaLabel: "Reset password",
      ctaUrl: input.actionUrl,
      note: "If you did not request a password reset, you can safely ignore this email. Your password will not change.",
    }),
  };
}

export function emailChangeTemplate(input: AuthTemplateInput & { newEmail: string }): EmailTemplate {
  const newEmail = escapeHtml(input.newEmail);
  return {
    subject: "Confirm your new Catalyst email",
    text: `${input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},\n\n` : ""}Confirm ${input.newEmail} as your new Catalyst email: ${input.actionUrl}\n\nIf you did not request this change, do not use the link.`,
    html: emailShell({
      preheader: "Confirm the new email address for your Catalyst account.",
      eyebrow: "Account security",
      title: "Confirm your new email",
      body: `<p style="margin: 0 0 16px;">${greeting(input.recipientName)}</p><p style="margin: 0 0 16px;">You asked to use the following email address for Catalyst:</p><p style="margin: 0; border-radius: 8px; background: ${COLORS.warm}; color: ${COLORS.navy}; font-weight: 700; padding: 12px 14px;">${newEmail}</p>`,
      ctaLabel: "Confirm new email",
      ctaUrl: input.actionUrl,
      note: "If you did not request this change, do not use the link and consider changing your password.",
    }),
  };
}

export function dueReminderTemplate(input: DueReminderTemplateInput): EmailTemplate {
  const title = escapeHtml(input.assignmentTitle);
  const course = input.courseName?.trim() ? escapeHtml(input.courseName.trim()) : null;
  const dueAt = escapeHtml(input.dueAtLabel);
  const leadTime = escapeHtml(input.leadTimeLabel);
  const subject = `${input.assignmentTitle} is due ${input.leadTimeLabel}`;
  const text = [
    input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},` : "Hi,",
    "",
    `${input.assignmentTitle}${input.courseName?.trim() ? ` for ${input.courseName.trim()}` : ""} is due ${input.dueAtLabel}.`,
    input.calendarUrl ? `Open your calendar: ${input.calendarUrl}` : "",
  ].filter(Boolean).join("\n");

  return {
    subject,
    text,
    html: emailShell({
      preheader: `${input.assignmentTitle} is due ${input.leadTimeLabel}.`,
      eyebrow: "Due-date reminder",
      title: "Keep this on your radar",
      body: `<p style="margin: 0 0 18px;">${greeting(input.recipientName)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid ${COLORS.border}; border-radius: 10px; background: ${COLORS.sage};"><tr><td style="padding: 18px;"><p style="margin: 0 0 5px; color: ${COLORS.navy}; font-size: 17px; font-weight: 700; line-height: 23px;">${title}</p>${course ? `<p style="margin: 0 0 12px; color: ${COLORS.text}; font-size: 14px; line-height: 20px;">${course}</p>` : ""}<p style="margin: 0; color: ${COLORS.text}; font-size: 14px; line-height: 20px;"><strong>Due:</strong> ${dueAt}</p></td></tr></table><p style="margin: 18px 0 0;">This is your ${leadTime} reminder. A little progress now can make the deadline feel much lighter.</p>`,
      ...(input.calendarUrl ? { ctaLabel: "Open calendar", ctaUrl: input.calendarUrl } : {}),
      note: "You are receiving this because email reminders are enabled for your Catalyst account.",
    }),
  };
}
