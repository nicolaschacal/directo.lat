// Configuración → Equipo y Mi cuenta.
// GET  → lista de usuarios del panel (admin) o solo el propio usuario.
// POST → { action: "create" | "update" | "reset-password" | "change-password", ... }

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query, withTransaction } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");

const ROLES = ["admin", "coordinator"];

function cleanZoneIds(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 300);
}

async function setZones(client, managerId, zoneIds) {
  await client.query("DELETE FROM manager_zones WHERE manager_id=$1", [managerId]);
  if (zoneIds.length) {
    await client.query(
      `INSERT INTO manager_zones (manager_id, zone_id)
       SELECT $1, z.id FROM zones z WHERE z.id = ANY($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [managerId, zoneIds]
    );
  }
}

function clean(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function tempPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

async function activeAdminCount(excludeId = null) {
  const result = await query(
    "SELECT count(*) FROM managers WHERE role='admin' AND active AND ($1::uuid IS NULL OR id<>$1)",
    [excludeId]
  );
  return Number(result.rows[0].count);
}

module.exports = async (req, res) => {
  const manager = await requireManager(req, res);
  if (!manager) return;
  const isAdmin = manager.isAdmin;

  if (req.method === "GET") {
    try {
      const result = await query(
        `SELECT m.id, m.email, m.full_name, m.phone, m.role, m.active, m.created_at,
                COALESCE((SELECT json_agg(json_build_object('id', z.id, 'state', z.state, 'name', z.name) ORDER BY z.state, z.name)
                          FROM manager_zones mz JOIN zones z ON z.id=mz.zone_id
                          WHERE mz.manager_id=m.id), '[]') AS zones
         FROM managers m
         WHERE $1::boolean OR m.id=$2
         ORDER BY m.active DESC, m.role, m.full_name`,
        [isAdmin, manager.sub]
      );
      return res.status(200).json({ success: true, members: result.rows, me: manager.sub, isAdmin });
    } catch (error) {
      console.error("Team read error:", error);
      return res.status(500).json({ success: false, message: "No se pudo cargar el equipo." });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }

  const action = clean(req.body?.action, 30);

  try {
    if (action === "change-password") {
      const current = String(req.body?.currentPassword || "");
      const next = String(req.body?.newPassword || "");
      if (next.length < 10) {
        return res.status(400).json({ success: false, message: "La nueva contraseña debe tener al menos 10 caracteres." });
      }
      const row = (await query("SELECT password_hash FROM managers WHERE id=$1", [manager.sub])).rows[0];
      if (!row || !(await bcrypt.compare(current, row.password_hash))) {
        return res.status(400).json({ success: false, message: "La contraseña actual no es correcta." });
      }
      await query("UPDATE managers SET password_hash=$1, updated_at=now() WHERE id=$2", [await bcrypt.hash(next, 12), manager.sub]);
      return res.status(200).json({ success: true, message: "Contraseña actualizada." });
    }

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Solo un administrador puede gestionar el equipo." });
    }

    if (action === "create") {
      const email = clean(req.body?.email).toLowerCase();
      const name = clean(req.body?.name, 160);
      const role = ROLES.includes(req.body?.role) ? req.body.role : "coordinator";
      const phone = clean(req.body?.phone, 40) || null;
      const zoneIds = cleanZoneIds(req.body?.zoneIds) || [];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: "Ingresa un correo válido." });
      }
      if (!name) return res.status(400).json({ success: false, message: "Ingresa el nombre." });

      const password = tempPassword();
      const hash = await bcrypt.hash(password, 12);
      const member = await withTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO managers (email,password_hash,full_name,phone,role,active)
           VALUES ($1,$2,$3,$4,$5,true)
           ON CONFLICT (email) DO NOTHING
           RETURNING id,email,full_name,phone,role,active,created_at`,
          [email, hash, name, phone, role]
        );
        if (!result.rows[0]) return null;
        if (role === "coordinator") await setZones(client, result.rows[0].id, zoneIds);
        return result.rows[0];
      });
      if (!member) {
        return res.status(409).json({ success: false, message: "Ya existe un usuario con ese correo." });
      }
      return res.status(200).json({ success: true, member, temporaryPassword: password });
    }

    const id = clean(req.body?.id, 60);
    if (!id) return res.status(400).json({ success: false, message: "Falta el usuario." });

    if (action === "update") {
      const target = (await query("SELECT id,role,active FROM managers WHERE id=$1", [id])).rows[0];
      if (!target) return res.status(404).json({ success: false, message: "Usuario no encontrado." });

      const role = ROLES.includes(req.body?.role) ? req.body.role : target.role;
      const active = req.body?.active === undefined ? target.active : Boolean(req.body.active);
      const losesAdmin = target.role === "admin" && target.active && (role !== "admin" || !active);
      if (losesAdmin && (await activeAdminCount(id)) === 0) {
        return res.status(400).json({ success: false, message: "Tiene que quedar al menos un administrador activo." });
      }
      if (id === manager.sub && !active) {
        return res.status(400).json({ success: false, message: "No puedes desactivar tu propio usuario." });
      }

      const zoneIds = cleanZoneIds(req.body?.zoneIds);
      const name = clean(req.body?.name, 160);
      const phone = req.body?.phone === undefined ? undefined : clean(req.body.phone, 40) || null;
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE managers SET role=$1, active=$2,
             full_name=COALESCE(NULLIF($4,''), full_name),
             phone=CASE WHEN $5 THEN $6 ELSE phone END,
             updated_at=now()
           WHERE id=$3`,
          [role, active, id, name, phone !== undefined, phone ?? null]
        );
        if (role === "admin") await client.query("DELETE FROM manager_zones WHERE manager_id=$1", [id]);
        else if (zoneIds) await setZones(client, id, zoneIds);
      });
      return res.status(200).json({ success: true });
    }

    if (action === "reset-password") {
      const password = tempPassword();
      const result = await query(
        "UPDATE managers SET password_hash=$1, updated_at=now() WHERE id=$2 RETURNING email",
        [await bcrypt.hash(password, 12), id]
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, message: "Usuario no encontrado." });
      return res.status(200).json({ success: true, temporaryPassword: password });
    }

    return res.status(400).json({ success: false, message: "Acción desconocida." });
  } catch (error) {
    console.error("Team update error:", error);
    return res.status(500).json({ success: false, message: "No se pudo completar la acción." });
  }
};
