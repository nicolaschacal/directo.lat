const { query } = require("../../lib/db");
const { requireManager, leadScope } = require("../../lib/auth");

const STATUSES = new Set(["new", "contacted", "followup", "joined", "not_interested"]);

// GET ?status=&state=&zone=&unassigned=1&search=
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  const manager = await requireManager(req, res);
  if (!manager) return;

  try {
    const params = [];
    const where = [leadScope(manager, "l", params)];

    const status = String(req.query?.status || "").trim();
    if (STATUSES.has(status)) {
      params.push(status);
      where.push(`l.status=$${params.length}`);
    }

    const state = String(req.query?.state || "").trim();
    if (state) {
      params.push(state);
      where.push(`l.state=$${params.length}`);
    }

    const zone = String(req.query?.zone || "").trim();
    if (/^[0-9a-f-]{36}$/i.test(zone)) {
      params.push(zone);
      where.push(`l.zone_id=$${params.length}`);
    }

    // Contactos sin coordinador: localidad escrita a mano o sin coordinadores asignados.
    if (manager.isAdmin && String(req.query?.unassigned || "") === "1") {
      where.push(`NOT EXISTS (
        SELECT 1 FROM manager_zones mz JOIN managers m ON m.id=mz.manager_id AND m.active
        WHERE mz.zone_id=l.zone_id)`);
    }

    const search = String(req.query?.search || "").trim().slice(0, 80);
    if (search) {
      params.push(`%${search}%`);
      const digits = search.replace(/\D/g, "");
      params.push(digits ? `%${digits}%` : "%__no_match__%");
      where.push(`(l.full_name ILIKE $${params.length - 1} OR l.locality_text ILIKE $${params.length - 1}
                   OR l.ai_topic ILIKE $${params.length - 1} OR l.phone LIKE $${params.length})`);
    }

    const result = await query(
      `SELECT l.id, l.full_name, l.phone, l.state, l.zone_id, l.locality_text, l.status, l.source,
              l.ai_summary, l.ai_topic, l.ai_primary_concern, l.ai_next_action,
              l.created_at, l.updated_at, l.next_action_at, l.last_contact_at,
              z.name AS zone_name,
              (SELECT due_at FROM followups f WHERE f.lead_id=l.id AND f.status='pending'
               ORDER BY f.due_at LIMIT 1) AS next_followup,
              (SELECT string_agg(m.full_name, ', ' ORDER BY m.full_name)
               FROM manager_zones mz JOIN managers m ON m.id=mz.manager_id AND m.active
               WHERE mz.zone_id=l.zone_id) AS coordinators
       FROM leads l
       LEFT JOIN zones z ON z.id=l.zone_id
       WHERE ${where.join(" AND ")}
       ORDER BY CASE l.status WHEN 'new' THEN 0 WHEN 'followup' THEN 1 ELSE 2 END,
                COALESCE(l.next_action_at, l.updated_at) DESC
       LIMIT 500`,
      params
    );

    return res.status(200).json({ success: true, leads: result.rows });
  } catch (error) {
    console.error("CRM leads error:", error);
    return res.status(500).json({ success: false, message: "No se pudieron cargar los contactos." });
  }
};
