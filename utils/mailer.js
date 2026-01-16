// utils/mailer.js
const nodemailer = require("nodemailer");

function isMailerDisabled() {
  return (process.env.MAILER_DISABLED || "false") === "true";
}

async function sendMail({ to, subject, html }) {
  if (isMailerDisabled()) return { disabled: true };

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    throw new Error("SMTP env manquants (SMTP_HOST/SMTP_USER/SMTP_PASS).");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({ from, to, subject, html });
  return { ok: true };
}

module.exports = { sendMail, isMailerDisabled };
