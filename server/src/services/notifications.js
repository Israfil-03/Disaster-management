import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  SMTP_FROM,
} = process.env;

let transporterPromise = null;

function createTransporter() {
  if (!SMTP_HOST) {
    return null;
  }
  try {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: SMTP_SECURE ? SMTP_SECURE === 'true' : Number(SMTP_PORT || 587) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      tls: { rejectUnauthorized: false },
    });
  } catch (error) {
    console.error('Failed to create SMTP transporter:', error.message);
    return null;
  }
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(createTransporter());
  }
  return transporterPromise;
}

export async function sendVolunteerNotification({ to, subject, text, html }) {
  if (!to) return { skipped: true, reason: 'missing-recipient' };
  const transporter = await getTransporter();
  if (!transporter) {
    console.info('[notify] SMTP not configured. Message skipped:', { to, subject });
    return { skipped: true, reason: 'smtp-not-configured' };
  }
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM || 'AadhyaPath <no-reply@aadhyapath.example.com>',
      to,
      subject,
      text,
      html,
    });
    return { sent: true, id: info.messageId };
  } catch (error) {
    console.error('Failed to send notification:', error.message);
    return { sent: false, error: error.message };
  }
}
