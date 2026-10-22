const bcrypt = require("bcryptjs");
const { query } = require("../../lib/db");
const { createSessionToken, setSessionCookie } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Ingresa correo y contraseña." });
    }

    const result = await query(
      `SELECT id,email,password_hash,full_name,role,active
       FROM managers WHERE lower(email)=lower($1) LIMIT 1`,
      [email]
    );

    const manager = result.rows[0];
    if (!manager || !manager.active || !(await bcrypt.compare(password, manager.password_hash))) {
      return res.status(401).json({ success: false, message: "Credenciales incorrectas." });
    }

    const token = createSessionToken(manager);
    setSessionCookie(res, token);

    return res.status(200).json({
      success: true,
      manager: {
        id: manager.id,
        email: manager.email,
        name: manager.full_name,
        role: manager.role
      }
    });
  } catch (error) {
    console.error("CRM login error:", error);
    return res.status(500).json({ success: false, message: "No se pudo iniciar sesión." });
  }
};
