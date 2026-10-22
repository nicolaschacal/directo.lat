const nodemailer = require("nodemailer");
const { query } = require("./db");
const { getRuntimeConfig } = require("./config");

let transporter = null;
let transporterKey = "";

function buildTransport(email) {
  return nodemailer.createTransport({
    host: email.host,
    port: Number(email.port || 587),
    secure: Boolean(email.secure),
    auth: { user: email.user, pass: email.password }
  });
}

async function getTransporter() {
  const { email } = await getRuntimeConfig();
  if (!email.host || !email.user || !email.password) return null;

  const key = JSON.stringify([email.host, email.port, email.secure, email.user, email.password]);
  if (!transporter || key !== transporterKey) {
    transporter = buildTransport(email);
    transporterKey = key;
  }
  return { transport: transporter, from: email.from || email.user };
}

async function getNotifyEmail() {
  const { email } = await getRuntimeConfig();
  return email.notifyTo || "";
}

async function queueEmail({ leadId = null, recipient, subject, bodyText }) {
  const result = await query(
    `INSERT INTO email_jobs (lead_id, recipient, subject, body_text)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [leadId, recipient, subject, bodyText]
  );
  return result.rows[0];
}

async function sendQueuedEmail(job) {
  const mailer = await getTransporter();
  if (!mailer) return { sent: false, reason: "smtp_not_configured" };

  try {
    await mailer.transport.sendMail({
      from: mailer.from,
      to: job.recipient,
      subject: job.subject,
      text: job.body_text
    });

    await query(
      `UPDATE email_jobs
       SET status='sent', sent_at=now(), attempts=attempts+1, last_error=NULL
       WHERE id=$1`,
      [job.id]
    );

    return { sent: true };
  } catch (error) {
    await query(
      `UPDATE email_jobs
       SET status='failed', attempts=attempts+1, last_error=$2,
           next_attempt_at=now() + interval '30 minutes'
       WHERE id=$1`,
      [job.id, String(error.message || error).slice(0, 1000)]
    );
    return { sent: false, reason: "send_failed" };
  }
}

async function queueAndTrySend(payload) {
  const job = await queueEmail(payload);
  const result = await sendQueuedEmail(job);
  return { job, ...result };
}

module.exports = { queueEmail, sendQueuedEmail, queueAndTrySend, buildTransport, getNotifyEmail };
