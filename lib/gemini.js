// Llamadas a Gemini con modelo de respaldo (si el principal tarda o falla).

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
    error?.status === 408 ||
    error?.status === 429 ||
    (Number(error?.status) >= 500 && Number(error?.status) <= 599)
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


module.exports = { normalizeText, callGeminiModel, askGeminiWithFallback, delay };
