import nodemailer, { Transporter } from "nodemailer";

let cached: Transporter | null = null;

function build(): Transporter {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  // Zero-config preview: doesn't hit the network, just serializes the message.
  return nodemailer.createTransport({ jsonTransport: true });
}

export async function sendMail(opts: { to: string; subject: string; text: string }) {
  cached ??= build();
  const info = await cached.sendMail({ from: process.env.MAIL_FROM || "billing@apophis.in", ...opts });
  if (!process.env.SMTP_HOST) {
    console.log(`📧 [preview] → ${opts.to} | ${opts.subject}`);
  }
  return info;
}

export const isLiveMail = () => !!process.env.SMTP_HOST;
