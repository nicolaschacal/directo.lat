const { query } = require("./db");

const DEFAULT_DAYS = 90;

async function getRetentionDays() {
  try {
    const row = (await query("SELECT value FROM crm_settings WHERE key='retention'")).rows[0];
    const days = Number(row?.value?.conversationDays);
    return Number.isInteger(days) && days >= 7 && days <= 365 ? days : DEFAULT_DAYS;
  } catch {
    return DEFAULT_DAYS;
  }
}

/**
 * Borra las conversaciones (y sus mensajes) sin actividad hace más de N días.
 * Los contactos quedan: conservan nombre, teléfono, localidad, notas y el
 * resumen de la IA, pero ya no la conversación completa.
 * También borra sesiones vacías (abrieron el chat y no escribieron) y los
 * correos ya enviados o vencidos de la cola.
 */
async function purgeOldConversations() {
  const days = await getRetentionDays();
  const result = await query(
    `DELETE FROM conversation_sessions WHERE last_message_at < now() - make_interval(days => $1)`,
    [days]
  );
  // Visitas que abrieron el chat y no escribieron nada.
  await query(
    `DELETE FROM conversation_sessions cs
     WHERE cs.lead_id IS NULL AND cs.last_message_at < now() - interval '1 day'
       AND NOT EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id=cs.id)`
  );
  await query(
    `DELETE FROM email_jobs
     WHERE (status='sent' AND sent_at < now() - interval '30 days')
        OR (status='failed' AND attempts >= 5 AND created_at < now() - interval '30 days')`
  );
  return result.rowCount;
}

module.exports = { DEFAULT_DAYS, getRetentionDays, purgeOldConversations };
