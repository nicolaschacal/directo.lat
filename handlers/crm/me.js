const { requireManager } = require("../../lib/auth");
const { query } = require("../../lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  const manager = await requireManager(req, res);
  if (!manager) return;
  const zones = manager.zoneIds.length
    ? (await query("SELECT id,state,name FROM zones WHERE id = ANY($1::uuid[]) ORDER BY state,name", [manager.zoneIds])).rows
    : [];
  return res.status(200).json({ success: true, manager: { ...manager, zones } });
};
