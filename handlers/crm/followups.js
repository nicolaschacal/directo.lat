const { query, withTransaction } = require("../../lib/db");
const { requireManager, leadScope, canSeeLead } = require("../../lib/auth");

module.exports = async (req, res) => {
  const manager = await requireManager(req, res);
  if (!manager) return;

  if (req.method === "GET") {
    try {
      const status = String(req.query?.status || "pending");
      const params = [status];
      const scope = leadScope(manager, "l", params);
      const result = await query(
        `SELECT f.*, l.full_name, l.phone, l.state, l.locality_text, z.name AS zone_name
         FROM followups f
         JOIN leads l ON l.id=f.lead_id
         LEFT JOIN zones z ON z.id=l.zone_id
         WHERE ($1='' OR f.status=$1) AND ${scope}
         ORDER BY
           CASE WHEN f.status='pending' THEN f.due_at END ASC,
           f.created_at DESC
         LIMIT 300`,
        params
      );
      return res.status(200).json({ success: true, followups: result.rows });
    } catch (error) {
      console.error("CRM followups list error:", error);
      return res.status(500).json({ success: false, message: "No se pudieron cargar los seguimientos." });
    }
  }

  if (req.method === "POST") {
    try {
      const { action, id, leadId, title, notes, dueAt } = req.body || {};

      if (action === "create") {
        if (!leadId || !title || !dueAt) {
          return res.status(400).json({ success: false, message: "Faltan datos del seguimiento." });
        }
        if (!(await canSeeLead(manager, leadId))) {
          return res.status(404).json({ success: false, message: "Contacto no encontrado." });
        }
        const result = await query(
          `INSERT INTO followups
             (lead_id,assigned_manager_id,type,title,notes,due_at)
           VALUES ($1,$2,'manager_contact',$3,$4,$5)
           RETURNING *`,
          [leadId, manager.sub, String(title).slice(0,300), notes ? String(notes).slice(0,1500) : null, dueAt]
        );
        await query(
          "UPDATE leads SET status='followup', next_action_at=$2, updated_at=now() WHERE id=$1",
          [leadId, dueAt]
        );
        return res.status(201).json({ success: true, followup: result.rows[0] });
      }

      if (action === "complete") {
        if (!id) return res.status(400).json({ success: false, message: "Falta id." });
        const owner = (await query("SELECT lead_id FROM followups WHERE id=$1", [id])).rows[0];
        if (!owner || !(await canSeeLead(manager, owner.lead_id))) {
          return res.status(404).json({ success: false, message: "Seguimiento no encontrado." });
        }

        const completed = await withTransaction(async (client) => {
          const result = await client.query(
            `UPDATE followups
             SET status='completed', completed_at=now(), updated_at=now()
             WHERE id=$1
             RETURNING *`,
            [id]
          );
          const followup = result.rows[0];
          if (!followup) throw new Error("NOT_FOUND");

          const next = await client.query(
            `SELECT due_at FROM followups
             WHERE lead_id=$1 AND status='pending'
             ORDER BY due_at LIMIT 1`,
            [followup.lead_id]
          );
          await client.query(
            `UPDATE leads SET next_action_at=$2, updated_at=now()
             WHERE id=$1`,
            [followup.lead_id, next.rows[0]?.due_at || null]
          );
          await client.query(
            `INSERT INTO activities (lead_id,manager_id,type,description)
             VALUES ($1,$2,'followup_completed','Seguimiento marcado como completado.')`,
            [followup.lead_id, manager.sub]
          );
          return followup;
        });

        return res.status(200).json({ success: true, followup: completed });
      }

      return res.status(400).json({ success: false, message: "Acción inválida." });
    } catch (error) {
      if (error.message === "NOT_FOUND") return res.status(404).json({ success: false, message: "Seguimiento no encontrado." });
      console.error("CRM followup update error:", error);
      return res.status(500).json({ success: false, message: "No se pudo actualizar el seguimiento." });
    }
  }

  return res.status(405).json({ success: false, message: "Método no permitido." });
};
