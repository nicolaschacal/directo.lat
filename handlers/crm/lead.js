const { query } = require("../../lib/db");
const { requireManager, canSeeLead } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  const manager = await requireManager(req, res);
  if (!manager) return;

  try {
    const id = String(req.query?.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ success: false, message: "Falta id." });
    // Un coordinador no puede abrir contactos de otra localidad (ni saber si existen).
    if (!(await canSeeLead(manager, id))) {
      return res.status(404).json({ success: false, message: "Contacto no encontrado." });
    }

    const lead = (await query(
      `SELECT l.*, z.name AS zone_name
       FROM leads l LEFT JOIN zones z ON z.id=l.zone_id
       WHERE l.id=$1`,
      [id]
    )).rows[0];
    if (!lead) return res.status(404).json({ success: false, message: "Contacto no encontrado." });

    const [followups, activities, conversations] = await Promise.all([
      query("SELECT * FROM followups WHERE lead_id=$1 ORDER BY due_at DESC", [id]),
      query(
        `SELECT a.*, m.full_name AS manager_name
         FROM activities a LEFT JOIN managers m ON m.id=a.manager_id
         WHERE a.lead_id=$1 ORDER BY a.created_at DESC LIMIT 100`,
        [id]
      ),
      query(
        `SELECT cs.id, cs.started_at, cs.last_message_at,
                COALESCE(json_agg(json_build_object('role', m.role, 'content', m.content, 'created_at', m.created_at)
                         ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]') AS messages
         FROM conversation_sessions cs
         LEFT JOIN conversation_messages m ON m.conversation_id=cs.id
         WHERE cs.lead_id=$1
         GROUP BY cs.id
         ORDER BY cs.started_at DESC`,
        [id]
      )
    ]);

    return res.status(200).json({
      success: true,
      lead,
      followups: followups.rows,
      activities: activities.rows,
      conversations: conversations.rows
    });
  } catch (error) {
    console.error("CRM lead detail error:", error);
    return res.status(500).json({ success: false, message: "No se pudo cargar la ficha." });
  }
};
