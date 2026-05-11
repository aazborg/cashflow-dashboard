import nodemailer from "nodemailer";

/**
 * SMTP-Konfiguration über ENV:
 *   SMTP_HOST          smtp.gmail.com
 *   SMTP_PORT          587
 *   SMTP_USER          mario.grabner@mynlp.at
 *   SMTP_PASSWORD      16-stelliges Google-App-Passwort
 *                      (https://myaccount.google.com/apppasswords)
 *
 * Optional:
 *   SMTP_SECURE        "true" für TLS auf Port 465 (Default: STARTTLS auf 587)
 */
function buildTransport() {
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "SMTP_USER und SMTP_PASSWORD müssen gesetzt sein (Google App-Passwort).",
    );
  }
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export interface SendMailInput {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SentMailInfo {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export async function sendMail(input: SendMailInput): Promise<SentMailInfo> {
  const transport = buildTransport();
  const info = await transport.sendMail({
    from: input.from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });
  return {
    messageId: info.messageId,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
  };
}
