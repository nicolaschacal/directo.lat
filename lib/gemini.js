// Adaptadores para Gemini, OpenAI-compatible y Anthropic.
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\sº°]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function callGeminiModel({ apiKey, model, contents, systemInstruction, timeoutMs = 6000, generationConfig = null }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          ...(systemInstruction ? { system_instruction: { parts: [{ text: systemInstruction }] } } : {}),
          contents,
          generationConfig: generationConfig || {
            maxOutputTokens: 500,
            temperature: 0.45
          }
        }),
        signal: controller.signal
      }
    );

    const rawText = await response.text();
    let data = null;

    try {
      data = JSON.parse(rawText);
    } catch {}

    if (!response.ok) {
      const error = new Error(data?.error?.message || "Gemini no pudo responder.");
      error.status = response.status;
      throw error;
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .replace(/\*\*/g, "")
      .trim();

    if (!text) {
      const error = new Error("Gemini respondió sin texto utilizable.");
      error.status = 502;
      throw error;
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function isTransientModelError(error) {
  return (
    error?.name === "AbortError" ||
    Number(error?.status) >= 400 && Number(error?.status) <= 599
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function askGeminiWithFallback({ apiKey, contents, systemInstruction, model = "gemini-3.1-flash-lite", fallbackModel = "gemini-3.5-flash-lite" }) {
  let done = false;
  let secondaryPromise = null;

  const getSecondary = () => {
    if (!secondaryPromise) {
      secondaryPromise = callGeminiModel({
        apiKey,
        model: fallbackModel,
        contents,
        systemInstruction,
        timeoutMs: 6000
      });
    }
    return secondaryPromise;
  };

  const primary = callGeminiModel({
    apiKey,
    model,
    contents,
    systemInstruction,
    timeoutMs: 6000
  }).catch((error) => {
    if (!isTransientModelError(error)) throw error;
    return getSecondary();
  });

  const hedge = delay(1200).then(() => {
    if (done) return new Promise(() => {});
    return getSecondary();
  });

  try {
    const response = await Promise.any([primary, hedge]);
    done = true;
    return response;
  } catch (aggregateError) {
    done = true;
    const errors = Array.isArray(aggregateError?.errors) ? aggregateError.errors : [];
    throw errors[errors.length - 1] || aggregateError;
  }
}

const PROVIDER_DEFAULTS = {
  gemini: { label: "Google Gemini", model: "gemini-3.1-flash-lite" },
  openai: { label: "OpenAI / ChatGPT", model: "gpt-4o-mini" },
  anthropic: { label: "Anthropic / Claude", model: "claude-3-5-haiku-latest" },
  custom: { label: "Otro proveedor compatible", model: "" }
};
function endpoint(baseUrl, suffix) {
  const base = String(baseUrl || "").trim().replace(/\\/+$/, "");
  if (!base) return suffix;
  return base.endsWith(suffix) ? base : base + suffix;
}
async function callAIModel({ provider = "gemini", apiKey, model, baseUrl = "", contents, systemInstruction = "", timeoutMs = 8000, generationConfig = null }) {
  if (!apiKey) throw new Error("Falta la clave API del proveedor de IA.");
  if (provider === "custom" && !baseUrl) throw new Error("Configura la Base URL del proveedor compatible.");
  if (provider === "gemini") return callGeminiModel({ apiKey, model, contents, systemInstruction, timeoutMs, generationConfig });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages = (contents || []).map((m) => ({ role: m.role === "model" ? "assistant" : m.role, content: (m.parts || []).map((p) => p.text || "").join("") }));
    let url, headers, body;
    if (provider === "anthropic") {
      url = endpoint(baseUrl || "https://api.anthropic.com/v1", "/messages");
      headers = { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
      body = { model, max_tokens: generationConfig?.maxOutputTokens || 500, ...(systemInstruction ? { system: systemInstruction } : {}), messages: messages.filter((m) => ["user","assistant"].includes(m.role)), temperature: generationConfig?.temperature ?? 0.45 };
    } else {
      url = endpoint(baseUrl || "https://api.openai.com/v1", "/chat/completions");
      headers = { "content-type": "application/json", authorization: "Bearer " + apiKey };
      body = { model, messages: [...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []), ...messages], max_tokens: generationConfig?.maxOutputTokens || 500, temperature: generationConfig?.temperature ?? 0.45, ...(generationConfig?.responseMimeType === "application/json" ? { response_format: { type: "json_object" } } : {}) };
    }
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const raw = await response.text(); let data = {}; try { data = JSON.parse(raw); } catch {}
    if (!response.ok) { const error = new Error(data?.error?.message || data?.message || "El proveedor rechazó la solicitud (HTTP " + response.status + ")."); error.status = response.status; throw error; }
    const text = provider === "anthropic" ? (data?.content || []).map((p) => p.text || "").join("").trim() : String(data?.choices?.[0]?.message?.content || "").trim();
    if (!text) { const error = new Error("El proveedor respondió sin texto utilizable."); error.status = 502; throw error; }
    return text.replace(/\\*\\*/g, "").trim();
  } finally { clearTimeout(timer); }
}
async function askAIWithFallback({ ai, contents, systemInstruction, generationConfig = null, timeoutMs = 8000 }) {
  const primary = { provider: ai?.provider || "gemini", apiKey: ai?.apiKey, model: ai?.model || DEFAULT_MODEL, baseUrl: ai?.baseUrl || "" };
  const fallback = { provider: ai?.fallbackProvider, apiKey: ai?.fallbackApiKey, model: ai?.fallbackModel || DEFAULT_FALLBACK_MODEL, baseUrl: ai?.fallbackBaseUrl || "" };
  const call = (s) => callAIModel({ ...s, contents, systemInstruction, generationConfig, timeoutMs });
  if (!primary.apiKey) throw new Error("Falta configurar la clave de IA en Configuración → Integraciones.");
  let second; const getSecond = () => { if (!second) { if (!fallback.provider || !fallback.apiKey || !fallback.model) throw new Error("No hay un proveedor secundario configurado."); second = call(fallback); } return second; };
  let done = false;
  const main = call(primary).catch((error) => { if (!isTransientModelError(error)) throw error; return getSecond(); });
  const hedge = fallback.provider && fallback.apiKey && fallback.model ? delay(1200).then(() => done ? new Promise(() => {}) : getSecond()) : new Promise(() => {});
  try { const result = await Promise.any([main, hedge]); done = true; return result; } catch (error) { done = true; const errors = Array.isArray(error?.errors) ? error.errors : []; throw errors[errors.length - 1] || error; }
}

async function askGeminiWithFallback({ apiKey, contents, systemInstruction, model = DEFAULT_MODEL, fallbackModel = DEFAULT_FALLBACK_MODEL }) {
  return askAIWithFallback({ ai: { provider: "gemini", apiKey, model, fallbackProvider: "gemini", fallbackApiKey: apiKey, fallbackModel }, contents, systemInstruction });
}
module.exports = { normalizeText, callGeminiModel, callAIModel, askAIWithFallback, askGeminiWithFallback, delay, PROVIDER_DEFAULTS };
