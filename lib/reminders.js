const { getPool, query } = require("./db");
const { queueAndTrySend, sendQueuedEmail, getNotifyEmail } = require("./email");
const { purgeOldConversations } = require("./retention");

/**
 * Tarea periódica (cada hora en servidor propio; cron diario en Vercel):
 * - recuerda a cada coordinador los contactos pendientes de su localidad;
 * - reintenta correos fallidos;
 * - borra conversaciones con más de 90 días sin actividad.
 */
async function processReminders() {
  const client = await getPool().connect();
  let locked = false;

  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(934512) AS locked");
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return { skipped: true, reason: "another_worker_running" };

    const due = await query(`
      SELECT f.id, f.title, f.due_at, l.full_name, l.state, l.locality_text, l.zone_id, z.name AS zone_name,
             COALESCE((SELECT array_agg(m.email) FROM manager_zones mz
                       JOIN managers m ON m.id=mz.manager_id AND m.active
                       WHERE mz.zone_id=l.zone_id), '{}') AS coordinator_emails
      FROM followups f
      JOIN leads l ON l.id=f.lead_id
      LEFT JOIN zones z ON z.id=l.zone_id
      WHERE f.status='pending'
        AND f.due_at <= now() + interval '24 hours'
        AND (f.reminder_sent_at IS NULL OR f.reminder_sent_at < now() - interval '20 hours')
      ORDER BY f.due_at
    `);

    // Cada coordinador recibe solo lo de sus localidades; lo que no tiene
    // coordinador va al correo general del equipo.
    const general = await getNotifyEmail();
    const byRecipient = new Map();
    for (const item of due.rows) {
      const recipients = item.coordinator_emails.length ? item.coordinator_emails : [general].filter(Boolean);
      for (const email of recipients) {
        const key = email.toLowerCase();
        if (!byRecipient.has(key)) byRecipient.set(key, []);
        byRecipient.get(key).push(item);
      }
    }

    for (const [recipient, items] of byRecipient) {
      const body = [
        `Contactos pendientes: ${items.length}`,
        "",
        ...items.flatMap((item) => [
          `- ${item.title}`,
          `  Localidad: ${[item.zone_name || item.locality_text, item.state].filter(Boolean).join(", ") || "Sin indicar"}`,
          `  Vence: ${new Date(item.due_at).toLocaleString("es-VE", { timeZone: process.env.APP_TIMEZONE || "America/Caracas" })}`,
          ""
        ]),
        "Los teléfonos y el detalle de cada conversación están en el panel → Contactos."
      ].join("\n");

      await queueAndTrySend({
        recipient,
        subject: `${items.length} contacto(s) pendiente(s) de llamar`,
        bodyText: body
      });
    }

    if (due.rows.length && byRecipient.size) {
      await query("UPDATE followups SET reminder_sent_at=now() WHERE id = ANY($1::uuid[])", [due.rows.map((row) => row.id)]);
    }

    const jobs = await query(`
      SELECT * FROM email_jobs
      WHERE status IN ('pending','failed') AND next_attempt_at <= now() AND attempts < 5
      ORDER BY created_at
      LIMIT 20
    `);
    for (const job of jobs.rows) {
      await sendQueuedEmail(job);
    }

    const purged = await purgeOldConversations().catch((error) => {
      console.error("Retención:", error.message);
      return 0;
    });

    return { skipped: false, reminders: due.rows.length, retriedEmails: jobs.rows.length, purgedConversations: purged };
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(934512)").catch(() => {});
    client.release();
  }
}

module.exports = { processReminders };
