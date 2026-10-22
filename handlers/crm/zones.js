// Localidades.
// GET  → lista (el administrador ve todas; el coordinador, las suyas) + estados.
// POST → { action: "create" | "update" | "delete", ... } solo administrador.

const { query } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");
const { STATES, normalizeState } = require("../../lib/zones");

function clean(value, max = 120) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

module.exports = async (req, res) => {
  const manager = await requireManager(req, res);
  if (!manager) return;

  try {
    if (req.method === "GET") {
      const params = [];
      let where = "";
      if (!manager.isAdmin) {
        params.push(manager.zoneIds);
        where = "WHERE z.id = ANY($1::uuid[])";
      }
      const result = await query(
        `SELECT z.id, z.state, z.name, z.active,
                (SELECT count(*)::int FROM leads l WHERE l.zone_id=z.id) AS lead_count,
                COALESCE((SELECT json_agg(json_build_object('id', m.id, 'name', m.full_name) ORDER BY m.full_name)
                          FROM manager_zones mz JOIN managers m ON m.id=mz.manager_id AND m.active
                          WHERE mz.zone_id=z.id), '[]') AS coordinators
         FROM zones z ${where}
         ORDER BY z.state, z.name`,
        params
      );
      return res.status(200).json({ success: true, zones: result.rows, states: STATES });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Método no permitido." });
    }
    if (!manager.isAdmin) {
      return res.status(403).json({ success: false, message: "Solo un administrador puede gestionar localidades." });
    }

    const action = clean(req.body?.action, 20);

    if (action === "create") {
      const state = normalizeState(req.body?.state);
      // Permite cargar varias de una vez: una por línea o separadas por coma.
      const names = String(req.body?.names ?? req.body?.name ?? "")
        .split(/[\n,;]+/)
        .map((n) => clean(n))
        .filter(Boolean)
        .slice(0, 200);
      if (!state) return res.status(400).json({ success: false, message: "Elige un estado." });
      if (!names.length) return res.status(400).json({ success: false, message: "Escribe al menos una localidad." });

      const created = [];
      for (const name of names) {
        const row = (await query(
          `INSERT INTO zones (state,name) VALUES ($1,$2)
           ON CONFLICT (state,name) DO UPDATE SET active=true, updated_at=now()
           RETURNING id,state,name,active`,
          [state, name]
        )).rows[0];
        created.push(row);
      }
      return res.status(200).json({ success: true, zones: created });
    }

    const id = clean(req.body?.id, 60);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ success: false, message: "Falta la localidad." });

    if (action === "update") {
      const name = clean(req.body?.name);
      const active = req.body?.active === undefined ? null : Boolean(req.body.active);
      const result = await query(
        `UPDATE zones SET name=COALESCE(NULLIF($2,''),name), active=COALESCE($3,active), updated_at=now()
         WHERE id=$1 RETURNING id,state,name,active`,
        [id, name, active]
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, message: "Localidad no encontrada." });
      return res.status(200).json({ success: true, zone: result.rows[0] });
    }

    if (action === "delete") {
      // Si tiene contactos, se desactiva (deja de aparecer en el chat) en vez de borrarse.
      const used = (await query("SELECT 1 FROM leads WHERE zone_id=$1 LIMIT 1", [id])).rows.length;
      if (used) {
        await query("UPDATE zones SET active=false, updated_at=now() WHERE id=$1", [id]);
        return res.status(200).json({ success: true, deactivated: true });
      }
      await query("DELETE FROM zones WHERE id=$1", [id]);
      return res.status(200).json({ success: true, deleted: true });
    }

    return res.status(400).json({ success: false, message: "Acción desconocida." });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "Ya existe una localidad con ese nombre en ese estado." });
    console.error("Zones error:", error);
    return res.status(500).json({ success: false, message: "No se pudo completar la acción." });
  }
};
