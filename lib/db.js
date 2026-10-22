const { Pool } = require("pg");

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está configurada.");
  }

  if (!pool) {
    const useSSL = String(process.env.DB_SSL || "").toLowerCase() === "true";
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getPool, query, withTransaction };
