const { query } = require("../../lib/db");
const { requireManager, leadScope } = require("../../lib/auth");

// Resumen del panel. El administrador ve los números globales;
// el coordinador, solo los de sus localidades.
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  const manager = await requireManager(req, res);
  if (!manager) return;

  try {
    const params = [];
    const scope = leadScope(manager, "l", params);

    const leadStats = await query(
      `SELECT
         count(*) FILTER (WHERE l.created_at >= now() - interval '30 days')::int AS leads_30d,
         count(*) FILTER (WHERE l.status='new')::int AS leads_new,
         count(*) FILTER (WHERE l.status='joined')::int AS leads_joined,
         (SELECT count(*) FROM followups f JOIN leads l2 ON l2.id=f.lead_id
          WHERE f.status='pending' AND f.due_at <= now()
            AND l2.id IN (SELECT l.id FROM leads l WHERE ${scope}))::int AS overdue_followups
       FROM leads l
       WHERE ${scope}`,
      params
    );

    const stages = await query(
      `SELECT l.status, count(*)::int AS count FROM leads l WHERE ${scope} GROUP BY l.status`,
      params
    );

    const summary = { ...leadStats.rows[0] };

    if (manager.isAdmin) {
      const [conv, unassigned, topics] = await Promise.all([
        query(`SELECT
                 count(*) FILTER (WHERE started_at >= now() - interval '30 days')::int AS conversations_30d,
                 count(*) FILTER (WHERE started_at >= now() - interval '7 days')::int AS conversations_7d,
                 count(*) FILTER (WHERE state IS NOT NULL AND started_at >= now() - interval '30 days')::int AS located_30d
               FROM conversation_sessions cs
               WHERE EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id=cs.id AND m.role='user')`),
        query(`SELECT count(*)::int AS count FROM leads l
               WHERE l.status='new' AND NOT EXISTS (
                 SELECT 1 FROM manager_zones mz JOIN managers m ON m.id=mz.manager_id AND m.active
                 WHERE mz.zone_id=l.zone_id)`),
        query(`SELECT ai_topic AS topic, count(*)::int AS count FROM leads
               WHERE ai_topic IS NOT NULL AND created_at >= now() - interval '90 days'
               GROUP BY ai_topic ORDER BY count DESC LIMIT 8`)
      ]);
      Object.assign(summary, conv.rows[0], { unassigned_new: unassigned.rows[0].count });
      return res.status(200).json({ success: true, summary, stages: stages.rows, topics: topics.rows });
    }

    return res.status(200).json({ success: true, summary, stages: stages.rows, topics: [] });
  } catch (error) {
    console.error("CRM summary error:", error);
    return res.status(500).json({ success: false, message: "No se pudo cargar el resumen." });
  }
};
