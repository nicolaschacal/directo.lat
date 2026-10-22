// Configuración → Captación y privacidad (solo administrador).
const { query } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");
const { DEFAULT_CAPTURE, getCaptureSettings } = require("../../lib/capture");
const { getRetentionDays } = require("../../lib/retention");

async function upsert(key, value) {
  await query(
    `INSERT INTO crm_settings(key,value,updated_at) VALUES ($1,$2::jsonb,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [key, JSON.stringify(value)]
  );
}

module.exports = async (req, res) => {
  const manager = await requireManager(req, res, { adminOnly: true });
  if (!manager) return;

  try {
    if (req.method === "GET") {
      const [capture, retentionDays] = await Promise.all([getCaptureSettings(), getRetentionDays()]);
      return res.status(200).json({ success: true, capture, retentionDays });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Método no permitido." });
    }

    const body = req.body?.capture || {};
    const value = {
      ...DEFAULT_CAPTURE,
      contactOffer: body.contactOffer !== false,
      autoDetect: body.autoDetect !== false
    };
    const days = Number(req.body?.retentionDays);
    if (!Number.isInteger(days) || days < 7 || days > 365) {
      return res.status(400).json({ success: false, message: "La retención debe estar entre 7 y 365 días." });
    }
    await upsert("capture", value);
    await upsert("retention", { conversationDays: days });
    return res.status(200).json({ success: true, capture: value, retentionDays: days });
  } catch (error) {
    console.error("CRM capture settings error:", error);
    return res.status(500).json({ success: false, message: "No se pudo guardar la configuración." });
  }
};
