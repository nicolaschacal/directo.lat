// Configuración → Integraciones y estado de instalación.
// GET  → configuración visible (sin secretos) + checklist de instalación.
// POST → { action: "save" | "test", section: "ai" | "email", values }

const { query } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");
const {
  SECRET_FIELDS,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  encrypt,
  readStored,
  writeStored,
  getRuntimeConfig
} = require("../../lib/config");
const { buildTransport } = require("../../lib/email");
const { callAIModel, PROVIDER_DEFAULTS } = require("../../lib/gemini");

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
      configured: Boolean(config.ai.apiKey), source: config.ai.sources.apiKey,
      provider: config.ai.provider || DEFAULT_PROVIDER, apiKeyHint: hint(config.ai.apiKey), model: config.ai.model,
      baseUrl: config.ai.baseUrl || "", fallbackProvider: config.ai.fallbackProvider || "",
      fallbackApiKeyHint: hint(config.ai.fallbackApiKey), fallbackBaseUrl: config.ai.fallbackBaseUrl || "", fallbackModel: config.ai.fallbackModel,
      providers: Object.entries(PROVIDER_DEFAULTS).map(([id, item]) => ({ id, label: item.label, model: item.model })),
      defaults: { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL, fallbackModel: DEFAULT_FALLBACK_MODEL }
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
    const provider = clean(values.provider || "gemini", 30);
    if (!PROVIDER_DEFAULTS[provider]) throw new Error("Proveedor principal no válido.");
    next.provider = provider;
    if (values.apiKey) next.apiKey = encrypt(clean(values.apiKey, 400));
    if (values.clearApiKey) delete next.apiKey;
    next.model = clean(values.model, 160) || PROVIDER_DEFAULTS[provider].model || undefined;
    next.baseUrl = clean(values.baseUrl, 300).replace(/\\/$/, "");
    const fallbackProvider = clean(values.fallbackProvider, 30);
    if (fallbackProvider && !PROVIDER_DEFAULTS[fallbackProvider]) throw new Error("Proveedor secundario no válido.");
    next.fallbackProvider = fallbackProvider;
    if (values.fallbackApiKey) next.fallbackApiKey = encrypt(clean(values.fallbackApiKey, 400));
    if (values.clearFallbackApiKey) delete next.fallbackApiKey;
    next.fallbackModel = clean(values.fallbackModel, 160) || (fallbackProvider ? PROVIDER_DEFAULTS[fallbackProvider].model : "") || undefined;
    next.fallbackBaseUrl = clean(values.fallbackBaseUrl, 300).replace(/\\/$/, "");
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
    const provider = clean(values.provider || config.ai.provider || "gemini", 30);
    const fallbackProvider = clean(values.fallbackProvider ?? config.ai.fallbackProvider, 30);
    return { provider, apiKey: clean(values.apiKey, 400) || config.ai.apiKey, model: clean(values.model, 160) || config.ai.model, baseUrl: clean(values.baseUrl, 300) || config.ai.baseUrl, fallbackProvider, fallbackApiKey: clean(values.fallbackApiKey, 400) || config.ai.fallbackApiKey, fallbackModel: clean(values.fallbackModel, 160) || config.ai.fallbackModel, fallbackBaseUrl: clean(values.fallbackBaseUrl, 300) || config.ai.fallbackBaseUrl };
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
    if (!settings.apiKey) throw new Error("Ingresa la clave de API del proveedor principal.");
    await callAIModel({ provider: settings.provider, apiKey: settings.apiKey, model: settings.model, baseUrl: settings.baseUrl, contents: [{ role: "user", parts: [{ text: "Respondé solo: OK" }] }], timeoutMs: 10000, generationConfig: { maxOutputTokens: 5, temperature: 0 } });
    return `Conexión correcta con ${PROVIDER_DEFAULTS[settings.provider]?.label || settings.provider} · ${settings.model}.`;
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
