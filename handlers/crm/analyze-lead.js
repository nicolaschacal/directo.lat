const { requireManager, canSeeLead } = require("../../lib/auth");
const { analyzeLead } = require("../../lib/lead-ai");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  const manager = await requireManager(req, res);
  if (!manager) return;

  try {
    const id = String(req.body?.id || "");
    if (!id || !(await canSeeLead(manager, id))) {
      return res.status(404).json({ success: false, message: "Contacto no encontrado." });
    }

    const lead = await analyzeLead(id);
    return res.status(200).json({ success: true, lead });
  } catch (error) {
    console.error("AI lead analysis error:", error);
    return res.status(500).json({ success: false, message: error.message || "No se pudo analizar el contacto." });
  }
};
