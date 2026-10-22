const { clearSessionCookie } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  clearSessionCookie(res);
  return res.status(200).json({ success: true });
};
