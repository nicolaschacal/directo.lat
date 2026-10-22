const { getProfile } = require("../lib/profile");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }

  // Las indicaciones internas para el asistente no se publican.
  const { assistantNotes, ...profile } = await getProfile();
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return res.status(200).json({ success: true, profile });
};
