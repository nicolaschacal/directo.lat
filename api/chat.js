const { retrieveKnowledge, formatKnowledgeContext } = require("../lib/knowledge");
const { getRuntimeConfig } = require("../lib/config");
const { getProfile } = require("../lib/profile");
const { loadVisitorMessages, persistVisitorMessage } = require("../lib/visitor-session");
const { getCaptureSettings, detectPhone, captureLead, notifyCapture } = require("../lib/capture");
const { analyzeLead } = require("../lib/lead-ai");
const { normalizeText, askAIWithFallback, delay } = require("../lib/gemini");
const { query } = require("../lib/db");

function buildSystemInstruction(profile) {
  const name = profile.name || "el dirigente";
  const notes = String(profile.assistantNotes || "").trim();
  return `
Eres el asistente virtual de ${name}${profile.category ? ` (${profile.category})` : ""}. Atiendes a ciudadanos de Venezuela que quieren conocer qué hace, qué propone y cómo puede ayudarlos.

OBJETIVO
- Responder con calidez, respeto y claridad, en mensajes breves.
- Escuchar: si la persona cuenta un problema o una preocupación de su comunidad, reconócelo con empatía antes de responder.
- Mantener el hilo de la conversación sin volver a presentarte en cada mensaje.

REGLAS (no negociables)
- Responde siempre en español de Venezuela, tratando a la persona de "tú".
- Usa texto plano: sin Markdown, sin asteriscos y sin encabezados con #. Puedes usar guiones simples.
- Tu ÚNICA fuente de información es la BASE DE CONOCIMIENTO que se incluye en cada consulta. No inventes datos, cifras, fechas, cargos, propuestas ni opiniones.
- Si la base no tiene la respuesta, dilo con naturalidad y ofrece que el coordinador de su zona le responda personalmente.
- No prometas nada que no esté en la base: ni gestiones, ni ayudas, ni empleos, ni dinero.
- No hables de otros políticos, partidos ni figuras públicas salvo que la base lo indique expresamente. No ataques ni descalifiques a nadie.
- No des opiniones propias sobre política, gobierno, elecciones ni temas polémicos: solo lo que diga la base.
- No pidas datos personales sensibles (cédula, dirección exacta, lugar de trabajo). Si la persona los escribe, no los repitas.
- Si alguien insulta o provoca, responde con calma y sin entrar en discusión.
- Si la persona describe una emergencia o un riesgo para su vida, indícale que contacte de inmediato a los servicios de emergencia de su zona.
${notes ? `\nINDICACIONES DEL EQUIPO DE ${name.toUpperCase()}\n${notes}\n` : ""}
USO DE LA BASE DE CONOCIMIENTO
- Prioriza la información recuperada por relevancia y combina varias fuentes si ayuda.
- No menciones que usas una base de conocimiento, fragmentos o contexto recuperado.
- Si dos fuentes se contradicen, no afirmes el dato y ofrece que el coordinador lo confirme.
`;
}

const CONTACT_TAG_RE = /\[\[\s*CONTACTO\s*\]\]/gi;

// Frases con las que el asistente ofrece el contacto (por si el modelo olvida la etiqueta
// y para no ofrecerlo dos veces seguidas).
const OFFER_RE = /\b(coordinador(a)? de tu (zona|localidad|comunidad)|te (contacte|llame|escriba)|dejar(me|nos)? tu (numero|telefono)|deja(me|nos)? tu (numero|telefono))\b/;

// "¿Me pueden llamar?", "quiero hablar con alguien", "quiero sumarme"…
const ASK_CONTACT_RE = /\b(llamenme|llamame|me (pueden|podrian|puede) (llamar|contactar|escribir)|hablar con (alguien|una persona|el coordinador|un coordinador)|quiero (sumarme|participar|ayudar|colaborar|ser voluntari[oa])|como (me sumo|participo|puedo ayudar))\b/;

function buildCaptureInstruction(capture, { hasLead, userTurns, askedContact }) {
  if (capture.contactOffer === false) return "";
  if (hasLead) {
    return "\nCONTACTO\n- Esta persona ya dejó sus datos y el coordinador de su zona la va a contactar. No se los pidas de nuevo.\n";
  }
  if (askedContact) {
    return `
PEDIDO DE CONTACTO
- La persona quiere hablar con alguien o sumarse. Respóndele en una o dos frases cálidas que con gusto el coordinador de su zona la contacta, y que deje su nombre, teléfono y localidad en el formulario que aparece debajo.
- Agrega al final, en una línea aparte, la etiqueta exacta [[CONTACTO]] (la persona no la ve).
`;
  }
  return `
INVITACIÓN A DEJAR SUS DATOS
- Objetivo secundario: que las personas interesadas dejen su teléfono y localidad para que las contacte el coordinador de su zona.
- ${userTurns < 1 ? "Todavía es muy temprano en la conversación: NO lo ofrezcas en esta respuesta." : "Puedes ofrecerlo si encaja de forma natural: cuando la persona contó un problema de su comunidad, mostró interés en una propuesta, preguntó algo que la base no responde o quiere participar."}
- Responde primero lo que preguntó. La invitación va al final, en una sola frase sutil, como algo útil y nunca como condición para seguir conversando.
- Si ya lo ofreciste en los últimos mensajes o la persona dijo que no, no insistas.
- No pidas los datos ni enumeres campos: la persona los completa en un formulario que aparece en el chat.
- Cuando hagas la invitación, agrega al final, en una línea aparte, la etiqueta exacta [[CONTACTO]] (la persona no la ve). No la uses en ningún otro caso.
- Si la persona escribe su teléfono por su cuenta, agradece y confirma que el coordinador de su zona la va a contactar.
`;
}

function resolveAction(responseText, { capture, hasLead, userTurns, previousAssistant, askedContact }) {
  const text = String(responseText || "");
  const tagged = CONTACT_TAG_RE.test(text);
  CONTACT_TAG_RE.lastIndex = 0;
  const clean = text.replace(CONTACT_TAG_RE, "").replace(/[ \t]+\n/g, "\n").trim();

  if (capture.contactOffer === false || hasLead) return { text: clean, action: null };
  if (askedContact) return { text: clean, action: "contact", openContact: true };

  const offered = tagged || OFFER_RE.test(normalizeText(clean));
  const offeredBefore = previousAssistant.slice(-3).some((t) => OFFER_RE.test(normalizeText(t)));
  if (!offered || offeredBefore || userTurns < 1) return { text: clean, action: null };
  return { text: clean, action: "contact" };
}

// Si la IA no está disponible, responde con la ficha más relevante de la base.
function knowledgeFallback(items = []) {
  const top = items.find((item) => item?.content);
  if (!top) return null;
  const content = String(top.content).trim();
  return content.length > 700 ? `${content.slice(0, 700).replace(/\s+\S*$/, "")}…` : content;
}

async function locationContext(session) {
  if (!session?.state) return "La persona todavía no indicó su localidad.";
  let zoneName = "";
  if (session.zone_id) {
    zoneName = (await query("SELECT name FROM zones WHERE id=$1", [session.zone_id]).catch(() => ({ rows: [] }))).rows[0]?.name || "";
  }
  const where = [zoneName || session.locality_text, session.state].filter(Boolean).join(", ");
  return `La persona escribe desde: ${where}. Si la base tiene información de esa zona, priorízala.`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }

  try {
    const { message, history = [], utmSource, utmMedium, utmCampaign } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: "El mensaje no puede estar vacío." });
    }
    if (String(message).length > 900) {
      return res.status(400).json({ success: false, message: "El mensaje es demasiado largo." });
    }
    const text = String(message).trim();

    const [visitorState, capture] = await Promise.all([
      loadVisitorMessages(req, res, 12),
      getCaptureSettings()
    ]);
    const session = visitorState.session;
    const serverHistory = visitorState.messages.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      text: item.content
    }));
    const effectiveHistory = serverHistory.length ? serverHistory : history;
    const userTurns = visitorState.messages.filter((item) => item.role === "user").length;
    const previousAssistant = visitorState.messages.filter((item) => item.role === "assistant").map((item) => item.content);

    const safeHistory = Array.isArray(effectiveHistory)
      ? effectiveHistory
          .filter((item) => item && (item.role === "user" || item.role === "model") && typeof item.text === "string" && item.text.trim())
          .slice(-10)
          .map((item) => ({ role: item.role, parts: [{ text: item.text.trim().slice(0, 1400) }] }))
      : [];

    const userPersistPromise = persistVisitorMessage(req, res, "user", text);

    // Un teléfono escrito en la conversación se registra como contacto.
    let leadId = session.lead_id || null;
    let justCaptured = null;
    const phone = capture.autoDetect !== false && capture.contactOffer !== false ? detectPhone(text) : "";
    if (phone) {
      try {
        await userPersistPromise;
        justCaptured = await captureLead(req, res, {
          source: "detected",
          phone,
          utm: { utmSource, utmMedium, utmCampaign }
        });
        leadId = justCaptured.lead.id;
      } catch (error) {
        console.error("No se pudo registrar el teléfono detectado:", error.message);
      }
    }

    const afterCapture = justCaptured
      ? Promise.allSettled([
          justCaptured.created ? getProfile().then((p) => notifyCapture(req, justCaptured, { campaignName: p.name })) : null,
          Promise.race([analyzeLead(justCaptured.lead.id), delay(9000)])
        ])
      : Promise.resolve();

    const knowledgePromise = retrieveKnowledge(text, effectiveHistory, 6);
    const context = {
      capture,
      hasLead: Boolean(leadId),
      userTurns,
      previousAssistant,
      askedContact: capture.contactOffer !== false && ASK_CONTACT_RE.test(normalizeText(text))
    };

    const { ai } = await getRuntimeConfig();

    const respondWithFallback = async (items) => {
      const fallback = justCaptured
        ? "¡Gracias! Ya registré tu teléfono: el coordinador de tu zona te va a contactar."
        : knowledgeFallback(items);
      await Promise.allSettled([userPersistPromise, afterCapture]);
      if (!fallback) {
        return res.status(503).json({ success: false, message: "El asistente está momentáneamente ocupado. Intenta de nuevo en unos segundos." });
      }
      await persistVisitorMessage(req, res, "assistant", fallback).catch(() => {});
      return res.status(200).json({ success: true, response: fallback, source: "knowledge-fallback", action: null });
    };

    if (!ai.apiKey) return respondWithFallback(await knowledgePromise.catch(() => []));

    let knowledgeItems = [];
    let responseText;
    try {
      const [retrieved, profile, where] = await Promise.all([knowledgePromise, getProfile(), locationContext(session)]);
      knowledgeItems = retrieved || [];

      const capturedContext = justCaptured
        ? "\nLa persona acaba de escribir su teléfono y ya quedó registrado. Agradece en una frase y confirma que el coordinador de su zona la va a contactar; después responde lo que haya preguntado."
        : "";

      const systemInstruction = `${buildSystemInstruction(profile)}${buildCaptureInstruction(capture, context)}

BASE DE CONOCIMIENTO RELEVANTE PARA ESTA CONSULTA
${formatKnowledgeContext(knowledgeItems)}

SITUACIÓN DE LA PERSONA
${where}
Mensajes de la persona en esta conversación: ${userTurns + 1}.${capturedContext}`;

      responseText = await askAIWithFallback({
        ai,
        contents: [...safeHistory, { role: "user", parts: [{ text }] }],
        systemInstruction
      });
    } catch (error) {
      console.error("El proveedor de IA no respondió:", error?.status, error?.message);
      return respondWithFallback(knowledgeItems);
    }

    const resolved = resolveAction(responseText, context);

    await Promise.allSettled([
      userPersistPromise,
      persistVisitorMessage(req, res, "assistant", resolved.text),
      afterCapture
    ]);

    return res.status(200).json({
      success: true,
      response: resolved.text,
      source: "ai",
      action: resolved.action,
      openContact: Boolean(resolved.openContact)
    });
  } catch (error) {
    console.error("Error en /api/chat:", error);
    return res.status(500).json({ success: false, message: "Error interno del asistente." });
  }
};
