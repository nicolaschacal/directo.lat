// Runtime configuration for integrations (AI, email).
//
// Values set from the dashboard (Configuración → Integraciones) are stored in
// crm_settings under the key "integrations". Secrets are encrypted at rest with
// AES-256-GCM. Anything not set in the panel falls back to environment
// variables, so existing .env installs keep working unchanged.

const crypto = require("crypto");
const { query } = require("./db");

const SETTINGS_KEY = "integrations";
const CACHE_MS = 30 * 1000;

const DEFAULT_PROVIDER = "gemini";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";

// Fields that must never leave the server in clear text.
const SECRET_FIELDS = {
  ai: ["apiKey"],
  email: ["password"]
};

let cache = null;
let cacheAt = 0;

function encryptionKey() {
  const base = process.env.SETTINGS_ENCRYPTION_KEY || process.env.CRM_JWT_SECRET;
  if (!base) throw new Error("Falta SETTINGS_ENCRYPTION_KEY o CRM_JWT_SECRET para cifrar credenciales.");
  return crypto.createHash("sha256").update(String(base)).digest();
}

function encrypt(plain) {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

function decrypt(payload) {
  if (!payload || typeof payload !== "string" || !payload.startsWith("v1:")) return "";
  try {
    const [, iv, tag, data] = payload.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

async function readStored() {
  try {
    const result = await query("SELECT value FROM crm_settings WHERE key=$1 LIMIT 1", [SETTINGS_KEY]);
    const value = result.rows[0]?.value || {};
    return {
      ai: value.ai || {},
      email: value.email || {}
    };
  } catch {
    return { ai: {}, email: {} };
  }
}

async function writeStored(stored) {
  await query(
    `INSERT INTO crm_settings(key,value,updated_at)
     VALUES ($1,$2::jsonb,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [SETTINGS_KEY, JSON.stringify(stored)]
  );
  invalidateConfig();
}

function pick(panelValue, envValue, fallback = "") {
  if (panelValue !== undefined && panelValue !== null && panelValue !== "") {
    return { value: panelValue, source: "panel" };
  }
  if (envValue !== undefined && envValue !== null && envValue !== "") {
    return { value: envValue, source: "env" };
  }
  return { value: fallback, source: fallback === "" ? "none" : "default" };
}

function bool(value) {
  if (typeof value === "boolean") return value;
  return String(value || "").toLowerCase() === "true";
}

async function buildConfig() {
  const stored = await readStored();
  const env = process.env;

  const provider = stored.ai.provider || env.AI_PROVIDER || DEFAULT_PROVIDER;
  const envAIKey = provider === "openai" ? env.OPENAI_API_KEY : provider === "anthropic" ? env.ANTHROPIC_API_KEY : provider === "custom" ? env.AI_API_KEY : env.GEMINI_API_KEY;
  const aiKey = pick(decrypt(stored.ai.apiKey), envAIKey);
  const legacyGemini = !stored.ai.provider && Boolean(env.GEMINI_API_KEY || stored.ai.apiKey);
  const fallbackProvider = stored.ai.fallbackProvider || env.AI_FALLBACK_PROVIDER || (legacyGemini ? "gemini" : "");
  const fallbackEnvKey = fallbackProvider === "openai" ? env.OPENAI_FALLBACK_API_KEY : fallbackProvider === "anthropic" ? env.ANTHROPIC_FALLBACK_API_KEY : fallbackProvider === "custom" ? env.AI_FALLBACK_API_KEY : env.GEMINI_API_KEY;
  const fallbackApiKey = pick(decrypt(stored.ai.fallbackApiKey), fallbackEnvKey || (legacyGemini ? aiKey.value : ""));
  const smtpHost = pick(stored.email.host, env.SMTP_HOST);
  const smtpPassword = pick(decrypt(stored.email.password), env.SMTP_PASSWORD);

  return {
    ai: {
      provider, apiKey: aiKey.value,
      model: stored.ai.model || env.AI_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL,
      baseUrl: stored.ai.baseUrl || env.AI_BASE_URL || "",
      fallbackProvider, fallbackApiKey: fallbackApiKey.value,
      fallbackModel: stored.ai.fallbackModel || env.AI_FALLBACK_MODEL || env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL,
      fallbackBaseUrl: stored.ai.fallbackBaseUrl || env.AI_FALLBACK_BASE_URL || "",
      sources: { apiKey: aiKey.source, fallbackApiKey: fallbackApiKey.source }
    },
    email: {
      host: smtpHost.value,
      port: Number(stored.email.port || env.SMTP_PORT || 587),
      secure: stored.email.secure !== undefined ? bool(stored.email.secure) : bool(env.SMTP_SECURE),
      user: stored.email.user || env.SMTP_USER || "",
      password: smtpPassword.value,
      from: stored.email.from || env.SMTP_FROM || stored.email.user || env.SMTP_USER || "",
      notifyTo: stored.email.notifyTo || env.NOTIFY_EMAIL || "",
      sources: { host: smtpHost.source, password: smtpPassword.source }
    }
  };
}

async function getRuntimeConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  cache = await buildConfig();
  cacheAt = Date.now();
  return cache;
}

function invalidateConfig() {
  cache = null;
  cacheAt = 0;
}

module.exports = {
  SECRET_FIELDS,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  encrypt,
  decrypt,
  readStored,
  writeStored,
  getRuntimeConfig,
  invalidateConfig
};
