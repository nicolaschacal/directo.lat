const { query } = require("./db");

// Entidades federales de Venezuela (23 estados + Distrito Capital).
const STATES = [
  "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo",
  "Cojedes", "Delta Amacuro", "Distrito Capital", "Falcón", "Guárico", "La Guaira",
  "Lara", "Mérida", "Miranda", "Monagas", "Nueva Esparta", "Portuguesa", "Sucre",
  "Táchira", "Trujillo", "Yaracuy", "Zulia"
];

function normalizeState(value) {
  const raw = String(value || "").trim().toLowerCase();
  return STATES.find((state) => state.toLowerCase() === raw) || null;
}

async function listZones({ activeOnly = true } = {}) {
  const result = await query(
    `SELECT z.id, z.state, z.name, z.active,
            (SELECT count(*)::int FROM manager_zones mz
              JOIN managers m ON m.id=mz.manager_id AND m.active
              WHERE mz.zone_id=z.id) AS coordinator_count
     FROM zones z
     ${activeOnly ? "WHERE z.active" : ""}
     ORDER BY z.state, z.name`
  );
  return result.rows;
}

/**
 * Valida la localidad que eligió la persona.
 * Devuelve { state, zoneId, localityText } o lanza un error 400.
 */
async function resolveLocation({ state, zoneId, localityText }, { required = true } = {}) {
  const cleanState = normalizeState(state);
  const cleanText = String(localityText || "").trim().slice(0, 120) || null;

  if (!cleanState) {
    if (!required) return { state: null, zoneId: null, localityText: null };
    const error = new Error("Elige tu estado.");
    error.status = 400;
    throw error;
  }

  if (zoneId) {
    const zone = (await query(
      "SELECT id, state, name FROM zones WHERE id=$1 AND active",
      [String(zoneId).slice(0, 60)]
    ).catch(() => ({ rows: [] }))).rows[0];
    if (zone && zone.state === cleanState) {
      return { state: cleanState, zoneId: zone.id, localityText: null };
    }
  }

  if (required && !cleanText) {
    const error = new Error("Indícanos tu municipio o localidad.");
    error.status = 400;
    throw error;
  }
  return { state: cleanState, zoneId: null, localityText: cleanText };
}

module.exports = { STATES, normalizeState, listZones, resolveLocation };
