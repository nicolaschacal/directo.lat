// Configuración → Integraciones y estado de instalación.
// GET  → configuración visible (sin secretos) + checklist de instalación.
// POST → { action: "save" | "test", section: "ai" | "email", values }

const { query } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");
const {
  SECRET_FIELDS,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  encrypt,
  readStored,
  writeStored,
  getRuntimeConfig
} = require("../../lib/config");
const { buildTransport } = require("../../lib/email");

const SECTIONS = ["ai", "email"];

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function hint(secret) {
  if (!secret) return "";
  const text = String(secret);
  return text.length > 8 ? `••••${text.slice(-4)}` : "••••";
}

async function publicView() {
  const config = await getRuntimeConfig({ fresh: true });
  return {
    ai: {
      configured: Boolean(config.ai.apiKey),
      source: config.ai.sources.apiKey,
      apiKeyHint: hint(config.ai.apiKey),
      model: config.ai.model,
      fallbackModel: config.ai.fallbackModel,
      defaults: { model: DEFAULT_MODEL, fallbackModel: DEFAULT_FALLBACK_MODEL }
    },
    email: {
      configured: Boolean(config.email.host && config.email.user && config.email.password),
      source: config.email.sources.host,
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      user: config.email.user,
      passwordHint: config.email.password ? "••••••••" : "",
      from: config.email.from,
      notifyTo: config.email.notifyTo
    }
  };
}

async function setupChecklist(view) {
  const safeCount = async (sql) => {
    try {
      const result = await query(sql);
      return Number(result.rows[0]?.count || 0);
    } catch {
      return null;
    }
  };

  const [managers, zones, knowledge, profileRow] = await Promise.all([
    safeCount("SELECT count(*) FROM managers WHERE active"),
    safeCount("SELECT count(*) FROM zones WHERE active"),
    safeCount("SELECT count(*) FROM knowledge_items WHERE status='active'"),
    query("SELECT value FROM crm_settings WHERE key='profile'").then((r) => r.rows[0]?.value || null).catch(() => null)
  ]);

  const profileCustomized = Boolean(
    profileRow && profileRow.name && profileRow.name !== "Mi candidatura" && (profileRow.shortDescription || profileRow.logoUrl)
  );

  return [
    { id: "database", label: "Base de datos conectada", done: managers !== null, required: true, target: null },
    { id: "profile", label: "Perfil público completo (nombre, foto y descripción)", done: profileCustomized, required: true, target: "business" },
    { id: "ai", label: "Clave de IA configurada", done: view.ai.configured, required: true, target: "integrations" },
    { id: "email", label: "Correo saliente configurado (avisos a coordinadores)", done: view.email.configured, required: false, target: "integrations" },
    { id: "knowledge", label: "Información cargada para el asistente", done: (knowledge || 0) > 0, required: true, target: "knowledge" },
    { id: "zones", label: "Localidades cargadas", done: (zones || 0) > 0, required: true, target: "zones" },
    { id: "team", label: "Coordinadores con acceso al panel", done: (managers || 0) > 1, required: false, target: "team" }
  ];
}

function sanitizeSection(section, values, current) {
  const next = { ...current };

  if (section === "ai") {
    if (values.apiKey) next.apiKey = encrypt(clean(values.apiKey, 400));
    if (values.clearApiKey) delete next.apiKey;
    next.model = clean(values.model, 120).replace(/[^a-z0-9.\-]/gi, "") || undefined;
    next.fallbackModel = clean(values.fallbackModel, 120).replace(/[^a-z0-9.\-]/gi, "") || undefined;
  }

  if (section === "email") {
    const port = Number(values.port || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("El puerto SMTP no es válido.");
    const notifyTo = clean(values.notifyTo, 240);
    if (notifyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyTo)) throw new Error("El correo de avisos no es válido.");

    next.host = clean(values.host, 240);
    next.port = port;
    next.secure = Boolean(values.secure);
    next.user = clean(values.user, 240);
    next.from = clean(values.from, 240);
    next.notifyTo = notifyTo;
    if (values.password) next.password = encrypt(clean(values.password, 400));
    if (values.clearPassword) delete next.password;
  }

  return next;
}

// Merge unsaved form values over the stored config so "Probar" checks what
// the person typed, even before saving.
async function effectiveFor(section, values = {}) {
  const config = await getRuntimeConfig({ fresh: true });
  if (section === "ai") {
    return { apiKey: clean(values.apiKey, 400) || config.ai.apiKey, model: clean(values.model, 120) || config.ai.model };
  }
  if (section === "email") {
    return {
      host: clean(values.host, 240) || config.email.host,
      port: Number(values.port || config.email.port || 587),
      secure: values.secure !== undefined ? Boolean(values.secure) : config.email.secure,
      user: clean(values.user, 240) || config.email.user,
      password: clean(values.password, 400) || config.email.password,
      from: clean(values.from, 240) || config.email.from
    };
  }
  return {};
}

async function runTest(section, values, manager) {
  const settings = await effectiveFor(section, values);

  if (section === "ai") {
    if (!settings.apiKey) throw new Error("Ingresa una clave de API.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Respondé solo: OK" }] }], generationConfig: { maxOutputTokens: 5 } }),
          signal: controller.signal
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const reason = data?.error?.message || `HTTP ${response.status}`;
        throw new Error(`La IA rechazó la conexión: ${reason}`);
      }
    } finally {
      clearTimeout(timer);
    }
    return `Conexión correcta con ${settings.model}.`;
  }

  if (section === "email") {
    if (!settings.host || !settings.user || !settings.password) throw new Error("Completa servidor, usuario y contraseña.");
    const transport = buildTransport(settings);
    await transport.verify();
    await transport.sendMail({
      from: settings.from || settings.user,
      to: manager.email,
      subject: "Prueba de correo del panel",
      text: "Si recibiste este correo, el envío desde el panel está funcionando."
    });
    return `Correo de prueba enviado a ${manager.email}.`;
  }

  throw new Error("Sección desconocida.");
}

module.exports = async (req, res) => {
  const manager = await requireManager(req, res, { adminOnly: true });
  if (!manager) return;

  if (req.method === "GET") {
    try {
      const view = await publicView();
      const checklist = await setupChecklist(view);
      return res.status(200).json({ success: true, integrations: view, checklist, isAdmin: manager.isAdmin });
    } catch (error) {
      console.error("Integrations read error:", error);
      return res.status(500).json({ success: false, message: "No se pudo cargar la configuración de integraciones." });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }

  if (manager.role !== "admin") {
    return res.status(403).json({ success: false, message: "Solo un administrador puede cambiar las integraciones." });
  }

  const action = clean(req.body?.action, 20);
  const section = clean(req.body?.section, 20);
  const values = req.body?.values || {};

  if (!SECTIONS.includes(section)) {
    return res.status(400).json({ success: false, message: "Sección desconocida." });
  }

  try {
    if (action === "test") {
      const message = await runTest(section, values, manager);
      return res.status(200).json({ success: true, message });
    }

    if (action === "save") {
      const stored = await readStored();
      stored[section] = sanitizeSection(section, values, stored[section] || {});
      await writeStored(stored);
      const view = await publicView();
      return res.status(200).json({ success: true, integrations: view, message: "Guardado." });
    }

    return res.status(400).json({ success: false, message: "Acción desconocida." });
  } catch (error) {
    const message = error?.message || "No se pudo completar la acción.";
    console.error(`Integrations ${action} ${section}:`, message);
    return res.status(400).json({ success: false, message });
  }
};

module.exports.SECRET_FIELDS = SECRET_FIELDS;
