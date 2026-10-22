const { processReminders } = require("../../lib/reminders");

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  if (!authorized(req)) {
    return res.status(401).json({ success: false, message: "No autorizado." });
  }

  try {
    const result = await processReminders();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("CRM cron error:", error);
    return res.status(500).json({ success: false, message: "Falló el procesamiento de recordatorios." });
  }
};
