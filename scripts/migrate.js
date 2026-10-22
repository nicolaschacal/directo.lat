require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getPool } = require("../lib/db");

// Applies every database/*.sql file once, in order, and records it in
// schema_migrations.
async function main() {
  const pool = getPool();
  const dir = path.join(__dirname, "../database");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const applied = new Set((await pool.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} (ya aplicada)`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`✓ ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }

  console.log("Migración completada.");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
