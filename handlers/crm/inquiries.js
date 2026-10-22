const { query } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");

// Conversaciones del chat. Solo el administrador las ve todas, incluidas las
// de personas que no dejaron sus datos.
// GET ?state=&zone=&id=  (con id devuelve la conversación completa)
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  const manager = await requireManager(req, res, { adminOnly: true });
  if (!manager) return;

  try {
    const id = String(req.query?.id || "");
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      const messages = await query(
        "SELECT role, content, created_at FROM conversation_messages WHERE conversation_id=$1 ORDER BY created_at",
        [id]
      );
      return res.status(200).json({ success: true, messages: messages.rows });
    }

    const params = [];
    const where = [];
    const state = String(req.query?.state || "").trim();
    if (state) {
      params.push(state);
      where.push(`cs.state=$${params.length}`);
    }
    const zone = String(req.query?.zone || "").trim();
    if (/^[0-9a-f-]{36}$/i.test(zone)) {
      params.push(zone);
      where.push(`cs.zone_id=$${params.length}`);
    }

    const result = await query(
      `SELECT cs.id, cs.lead_id, cs.state, cs.locality_text, cs.started_at, cs.last_message_at,
              z.name AS zone_name, l.full_name, l.status,
              (SELECT content FROM conversation_messages m
               WHERE m.conversation_id=cs.id AND m.role='user'
               ORDER BY m.created_at DESC LIMIT 1) AS last_user_message,
              (SELECT count(*) FROM conversation_messages m WHERE m.conversation_id=cs.id AND m.role='user')::int AS user_messages
       FROM conversation_sessions cs
       LEFT JOIN zones z ON z.id=cs.zone_id
       LEFT JOIN leads l ON l.id=cs.lead_id
       WHERE EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id=cs.id AND m.role='user')
       ${where.length ? "AND " + where.join(" AND ") : ""}
       ORDER BY cs.last_message_at DESC
       LIMIT 300`,
      params
    );

    return res.status(200).json({ success: true, inquiries: result.rows });
  } catch (error) {
    console.error("CRM inquiries error:", error);
    return res.status(500).json({ success: false, message: "No se pudieron cargar las conversaciones." });
  }
};
