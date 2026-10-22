require("dotenv").config();
const bcrypt = require("bcryptjs");
const { query, getPool } = require("../lib/db");

async function main() {
  const email = (process.env.CRM_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.CRM_ADMIN_PASSWORD || "";
  const fullName = process.env.CRM_ADMIN_NAME || "Administrador";

  if (!email || password.length < 10) {
    throw new Error("Definí CRM_ADMIN_EMAIL y una CRM_ADMIN_PASSWORD de al menos 10 caracteres.");
  }

  const hash = await bcrypt.hash(password, 12);

  await query(
    `INSERT INTO managers (email, password_hash, full_name, role)
     VALUES ($1,$2,$3,'admin')
     ON CONFLICT (email)
     DO UPDATE SET password_hash=EXCLUDED.password_hash,
                   full_name=EXCLUDED.full_name,
                   role='admin',
                   active=true,
                   updated_at=now()`,
    [email, hash, fullName]
  );

  console.log(`Administrador creado/actualizado: ${email}`);
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
