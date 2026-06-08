import { logger } from "@/lib/logger";

type SendEmailPayload = {
  to: string;
  subject: string;
  html: string;
};

type SmtpStatus = {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  from?: string;
  user?: string;
  missing: string[];
};

const log = logger("email");

function getSmtpConfig() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromAddress = process.env.SMTP_FROM;
  const secureValue = process.env.SMTP_SECURE;
  const secure =
    secureValue !== undefined && secureValue !== "false"
      ? secureValue === "true"
      : smtpPort === 465;

  const missing = [
    !smtpHost ? "SMTP_HOST" : null,
    !fromAddress ? "SMTP_FROM" : null,
    smtpUser && !smtpPass ? "SMTP_PASS" : null,
  ].filter(Boolean) as string[];

  return {
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    pass: smtpPass,
    from: fromAddress,
    secure,
    missing,
  };
}

function getNodemailer() {
  try {
    const runtimeRequire = eval("require") as (moduleName: string) => any;
    return runtimeRequire("nodemailer") as {
      createTransport: (config: Record<string, unknown>) => any;
    };
  } catch {
    throw new Error("Nodemailer is not installed. Run npm install in the backend project.");
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildEmailHtml(title: string, message: string) {
  return `
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f8fb;padding:28px;color:#111827">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e5e7eb">
        <p style="margin:0 0 10px;color:#0f766e;font-weight:700">AI Quiz Master</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${escapeHtml(title)}</h1>
        <div style="font-size:16px;line-height:1.7;color:#374151;white-space:pre-line">${escapeHtml(message)}</div>
      </div>
    </div>
  `;
}

export function getSmtpStatus(): SmtpStatus {
  const config = getSmtpConfig();
  return {
    configured: config.missing.length === 0,
    host: config.host,
    port: config.port,
    secure: config.secure,
    from: config.from,
    user: config.user,
    missing: config.missing,
  };
}

export async function verifyEmailTransporter() {
  const config = getSmtpConfig();
  if (config.missing.length > 0) {
    throw new Error(`Missing SMTP configuration: ${config.missing.join(", ")}`);
  }

  const nodemailer = getNodemailer();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? {
          user: config.user,
          pass: config.pass,
        }
      : undefined,
    tls: {
      rejectUnauthorized: false,
      minVersion: "TLSv1.2",
    },
  });

  await transporter.verify();
  return transporter;
}

export async function sendEmail(payload: SendEmailPayload) {
  if (!payload.to || !payload.subject || !payload.html) {
    throw new Error("Missing email fields: to, subject and html are required.");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(payload.to)) {
    throw new Error(`Invalid recipient email format: ${payload.to}`);
  }

  const transporter = await verifyEmailTransporter();
  const config = getSmtpConfig();
  log.info("Sending email", { to: payload.to, subject: payload.subject });

  const info = await transporter.sendMail({
    from: config.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  log.info("Email sent", {
    to: payload.to,
    messageId: info.messageId,
    response: info.response,
  });
}

