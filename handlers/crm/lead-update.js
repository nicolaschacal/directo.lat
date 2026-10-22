const { withTransaction } = require("../../lib/db");
const { requireManager, canSeeLead } = require("../../lib/auth");

const VALID_STATUSES = new Set(["new", "contacted", "followup", "joined", "not_interested"]);

// POST { id, status?, notes?, nextActionAt?, zoneId? (solo administrador) }
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  const manager = await requireManager(req, res);
  if (!manager) return;

  try {
    const { id, status, notes, nextActionAt, zoneId } = req.body || {};
    if (!id || !(await canSeeLead(manager, id))) {
      return res.status(404).json({ success: false, message: "Contacto no encontrado." });
    }
    if (status && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: "Estado inválido." });
    }
    const changeZone = zoneId !== undefined;
    if (changeZone && !manager.isAdmin) {
      return res.status(403).json({ success: false, message: "Solo un administrador puede cambiar la localidad." });
    }

    const updated = await withTransaction(async (client) => {
      let zoneState = null;
      if (changeZone && zoneId) {
        const zone = (await client.query("SELECT id,state FROM zones WHERE id=$1", [zoneId])).rows[0];
        if (!zone) throw Object.assign(new Error("Localidad inválida."), { status: 400 });
        zoneState = zone.state;
      }

      const result = await client.query(
        `UPDATE leads
         SET status=COALESCE($2,status),
             notes=COALESCE($3,notes),
             next_action_at=CASE WHEN $4 THEN $5::timestamptz ELSE next_action_at END,
             zone_id=CASE WHEN $6 THEN $7::uuid ELSE zone_id END,
             state=CASE WHEN $6 AND $8::text IS NOT NULL THEN $8 ELSE state END,
             last_contact_at=CASE WHEN $2 IN ('contacted','followup','joined') THEN now() ELSE last_contact_at END,
             updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [
          id,
          status || null,
          notes === undefined ? null : String(notes).slice(0, 4000),
          nextActionAt !== undefined,
          nextActionAt || null,
          changeZone,
          zoneId || null,
          zoneState
        ]
      );
      if (!result.rows[0]) throw Object.assign(new Error("Contacto no encontrado."), { status: 404 });

      // Al marcarlo como contactado (o cerrado), se cierran las tareas pendientes de primer contacto.
      if (status && status !== "new") {
        await client.query(
          `UPDATE followups SET status='completed', completed_at=now(), updated_at=now()
           WHERE lead_id=$1 AND status='pending' AND type='capture_contact'`,
          [id]
        );
      }

      await client.query(
        `INSERT INTO activities (lead_id,manager_id,type,description,metadata)
         VALUES ($1,$2,'lead_updated',$3,$4::jsonb)`,
        [
          id,
          manager.sub,
          changeZone ? "Se cambió la localidad del contacto." : "Ficha actualizada.",
          JSON.stringify({ status: status || null, nextActionAt: nextActionAt || null, zoneId: changeZone ? zoneId || null : undefined })
        ]
      );
      return result.rows[0];
    });

    return res.status(200).json({ success: true, lead: updated });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error("CRM lead update error:", error);
    return res.status(500).json({ success: false, message: "No se pudo actualizar la ficha." });
  }
};
