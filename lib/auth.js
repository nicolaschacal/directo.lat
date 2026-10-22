const jwt = require("jsonwebtoken");
const { query } = require("./db");

const COOKIE_NAME = "escucha_session";

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(";").reduce((acc, item) => {
    const index = item.indexOf("=");
    if (index === -1) return acc;
    const key = item.slice(0, index).trim();
    const value = decodeURIComponent(item.slice(index + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function getSecret() {
  if (!process.env.CRM_JWT_SECRET) {
    throw new Error("CRM_JWT_SECRET no está configurado.");
  }
  return process.env.CRM_JWT_SECRET;
}

function createSessionToken(manager) {
  return jwt.sign(
    { sub: manager.id, email: manager.email, name: manager.full_name, role: manager.role },
    getSecret(),
    { expiresIn: "12h" }
  );
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure ? "; Secure" : ""}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`
  );
}

/**
 * Valida la sesión y vuelve a leer al usuario de la base en cada pedido:
 * si un administrador lo desactiva, le cambia el rol o le quita localidades,
 * el cambio rige de inmediato (no recién cuando vence la sesión).
 *
 * Devuelve { sub, email, name, role, zoneIds, isAdmin } o null (y ya respondió).
 */
async function requireManager(req, res, { adminOnly = false } = {}) {
  let payload;
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ success: false, message: "Sesión requerida." });
      return null;
    }
    payload = jwt.verify(token, getSecret());
  } catch {
    res.status(401).json({ success: false, message: "Sesión inválida o vencida." });
    return null;
  }

  try {
    const result = await query(
      `SELECT m.id, m.email, m.full_name, m.role, m.active,
              COALESCE(array_agg(mz.zone_id) FILTER (WHERE mz.zone_id IS NOT NULL), '{}') AS zone_ids
       FROM managers m
       LEFT JOIN manager_zones mz ON mz.manager_id=m.id
       WHERE m.id=$1
       GROUP BY m.id`,
      [payload.sub]
    );
    const row = result.rows[0];
    if (!row || !row.active) {
      clearSessionCookie(res);
      res.status(401).json({ success: false, message: "Tu usuario no está activo." });
      return null;
    }

    const manager = {
      sub: row.id,
      email: row.email,
      name: row.full_name,
      role: row.role,
      isAdmin: row.role === "admin",
      zoneIds: row.zone_ids || []
    };

    if (adminOnly && !manager.isAdmin) {
      res.status(403).json({ success: false, message: "Solo un administrador puede ver o cambiar esto." });
      return null;
    }
    return manager;
  } catch (error) {
    console.error("Auth error:", error.message);
    res.status(500).json({ success: false, message: "No se pudo validar la sesión." });
    return null;
  }
}

/**
 * Filtro SQL de visibilidad de contactos. El administrador ve todo; un
 * coordinador solo los contactos de sus localidades.
 * Agrega el parámetro que necesite a `params` y devuelve la condición.
 */
function leadScope(manager, alias, params) {
  if (manager.isAdmin) return "TRUE";
  params.push(manager.zoneIds);
  return `${alias}.zone_id = ANY($${params.length}::uuid[])`;
}

async function canSeeLead(manager, leadId) {
  if (manager.isAdmin) return true;
  const result = await query(
    "SELECT 1 FROM leads WHERE id=$1 AND zone_id = ANY($2::uuid[])",
    [leadId, manager.zoneIds]
  );
  return result.rows.length > 0;
}

module.exports = {
  COOKIE_NAME,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  requireManager,
  leadScope,
  canSeeLead
};
