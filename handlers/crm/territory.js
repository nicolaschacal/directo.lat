// Escucha territorial: qué dice la gente en cada estado y localidad.
// Solo administrador.
//
// GET                    → totales por estado y localidad (conversaciones y contactos).
// GET ?state=&zone=      → últimos mensajes de las personas en esa localidad.
// POST { state, zone? }  → resumen con IA de lo que plantea la gente allí.

const { query } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");
const { getRuntimeConfig } = require("../../lib/config");
const { getProfile } = require("../../lib/profile");
const { callGeminiModel } = require("../../lib/gemini");
const { normalizeState } = require("../../lib/zones");

const DAYS = 90;

function locationFilter(state, zone, params, alias = "cs") {
  const where = [];
  params.push(state);
  where.push(`${alias}.state=$${params.length}`);
  if (zone === "other") {
    where.push(`${alias}.zone_id IS NULL`);
  } else if (/^[0-9a-f-]{36}$/i.test(zone || "")) {
    params.push(zone);
    where.push(`${alias}.zone_id=$${params.length}`);
  }
  return where.join(" AND ");
}

async function userMessages(state, zone, limit) {
  const params = [];
  const where = locationFilter(state, zone, params);
  params.push(limit);
  const result = await query(
    `SELECT m.content, m.created_at, z.name AS zone_name, cs.locality_text
     FROM conversation_messages m
     JOIN conversation_sessions cs ON cs.id=m.conversation_id
     LEFT JOIN zones z ON z.id=cs.zone_id
     WHERE m.role='user' AND m.created_at >= now() - interval '${DAYS} days' AND ${where}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

module.exports = async (req, res) => {
  const manager = await requireManager(req, res, { adminOnly: true });
  if (!manager) return;

  try {
    if (req.method === "GET") {
      const state = normalizeState(req.query?.state);
      if (state) {
        const messages = await userMessages(state, String(req.query?.zone || ""), 200);
        return res.status(200).json({ success: true, messages });
      }

      const [byZone, topics] = await Promise.all([
        query(
          `WITH conv AS (
             SELECT cs.state, cs.zone_id, count(*)::int AS conversations
             FROM conversation_sessions cs
             WHERE cs.state IS NOT NULL AND cs.last_message_at >= now() - interval '${DAYS} days'
               AND EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id=cs.id AND m.role='user')
             GROUP BY cs.state, cs.zone_id
           ), lds AS (
             SELECT l.state, l.zone_id, count(*)::int AS leads,
                    count(*) FILTER (WHERE l.status='new')::int AS leads_new
             FROM leads l WHERE l.state IS NOT NULL
             GROUP BY l.state, l.zone_id
           )
           SELECT COALESCE(conv.state, lds.state) AS state,
                  COALESCE(conv.zone_id, lds.zone_id) AS zone_id,
                  z.name AS zone_name,
                  COALESCE(conv.conversations, 0) AS conversations,
                  COALESCE(lds.leads, 0) AS leads,
                  COALESCE(lds.leads_new, 0) AS leads_new
           FROM conv
           FULL OUTER JOIN lds ON lds.state=conv.state AND lds.zone_id IS NOT DISTINCT FROM conv.zone_id
           LEFT JOIN zones z ON z.id=COALESCE(conv.zone_id, lds.zone_id)
           ORDER BY 1, 3 NULLS LAST`
        ),
        query(
          `SELECT state, ai_topic AS topic, count(*)::int AS count
           FROM leads
           WHERE state IS NOT NULL AND ai_topic IS NOT NULL AND created_at >= now() - interval '${DAYS} days'
           GROUP BY state, ai_topic
           ORDER BY state, count DESC`
        )
      ]);

      const states = {};
      for (const row of byZone.rows) {
        const item = states[row.state] ||= { state: row.state, conversations: 0, leads: 0, leads_new: 0, zones: [], topics: [] };
        item.conversations += row.conversations;
        item.leads += row.leads;
        item.leads_new += row.leads_new;
        item.zones.push({
          id: row.zone_id || "other",
          name: row.zone_name || "Otras localidades",
          conversations: row.conversations,
          leads: row.leads,
          leads_new: row.leads_new
        });
      }
      for (const row of topics.rows) {
        if (states[row.state] && states[row.state].topics.length < 5) states[row.state].topics.push({ topic: row.topic, count: row.count });
      }

      const list = Object.values(states).sort((a, b) => b.conversations + b.leads - (a.conversations + a.leads));
      return res.status(200).json({ success: true, days: DAYS, states: list });
    }

    if (req.method === "POST") {
      const state = normalizeState(req.body?.state);
      if (!state) return res.status(400).json({ success: false, message: "Elige un estado." });
      const zone = String(req.body?.zone || "");

      const messages = await userMessages(state, zone, 250);
      if (messages.length < 3) {
        return res.status(200).json({ success: true, report: null, message: "Todavía hay muy pocos mensajes en esta localidad para resumir." });
      }

      const [{ ai }, profile] = await Promise.all([getRuntimeConfig(), getProfile()]);
      if (!ai.apiKey) return res.status(400).json({ success: false, message: "Falta configurar la clave de IA en Configuración → Integraciones." });

      const where = zone && zone !== "other"
        ? `${messages[0]?.zone_name || "la localidad"}, ${state}`
        : state;
      const corpus = messages
        .map((m) => `- ${String(m.content).replace(/\s+/g, " ").slice(0, 400)}`)
        .join("\n")
        .slice(0, 30000);

      const prompt = `
Estos son mensajes que escribieron personas de ${where} (Venezuela) en el chat de ${profile.name}, en los últimos ${DAYS} días.
Resume qué plantea la gente, para que el equipo entienda las preocupaciones de la zona.
No incluyas nombres, teléfonos, cédulas, direcciones ni ningún dato que permita identificar a alguien. No copies mensajes textuales: parafrasea.
No infieras ideologías ni intenciones de voto.

Devuelve exclusivamente JSON válido:
{
  "summary": "3 a 5 líneas con lo más importante",
  "concerns": [
    { "topic": "tema en 1 a 3 palabras", "description": "qué plantean, en una o dos frases", "share": "alta|media|baja" }
  ],
  "unanswered": ["preguntas frecuentes que convendría agregar a la base de conocimiento"]
}

Mensajes:
${corpus}
`;

      const text = await callGeminiModel({
        apiKey: ai.apiKey,
        model: ai.fallbackModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        timeoutMs: 25000,
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 1500 }
      });

      let report;
      try {
        report = JSON.parse(text);
      } catch {
        return res.status(502).json({ success: false, message: "La IA devolvió un resumen con formato inválido. Intenta de nuevo." });
      }

      return res.status(200).json({
        success: true,
        report: {
          where,
          messages: messages.length,
          summary: String(report.summary || "").slice(0, 2000),
          concerns: (Array.isArray(report.concerns) ? report.concerns : []).slice(0, 8).map((c) => ({
            topic: String(c.topic || "").slice(0, 60),
            description: String(c.description || "").slice(0, 400),
            share: ["alta", "media", "baja"].includes(c.share) ? c.share : "media"
          })),
          unanswered: (Array.isArray(report.unanswered) ? report.unanswered : []).slice(0, 8).map((q) => String(q).slice(0, 200))
        }
      });
    }

    return res.status(405).json({ success: false, message: "Método no permitido." });
  } catch (error) {
    console.error("Territory error:", error);
    return res.status(500).json({ success: false, message: "No se pudo cargar la información territorial." });
  }
};
