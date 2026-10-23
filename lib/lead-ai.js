const { query } = require("./db");
const { getRuntimeConfig } = require("./config");
const { getProfile } = require("./profile");
const { askAIWithFallback } = require("./gemini");

async function analyzeLead(leadId) {
  const [{ ai }, profile] = await Promise.all([getRuntimeConfig(), getProfile()]);
  if (!ai.apiKey) throw new Error("Falta configurar la clave de IA en Configuración → Integraciones.");

  const leadResult = await query(
    `SELECT l.id, l.status, l.notes, l.state, l.locality_text, z.name AS zone_name
     FROM leads l LEFT JOIN zones z ON z.id=l.zone_id WHERE l.id=$1`,
    [leadId]
  );
  const lead = leadResult.rows[0];
  if (!lead) throw new Error("Contacto no encontrado.");

  const messagesResult = await query(
    `SELECT m.role,m.content,m.created_at
     FROM conversation_sessions cs
     JOIN conversation_messages m ON m.conversation_id=cs.id
     WHERE cs.lead_id=$1
     ORDER BY m.created_at
     LIMIT 80`,
    [leadId]
  );

  const transcript = messagesResult.rows
    .map((m) => `${m.role === "user" ? "Persona" : "Asistente"}: ${m.content}`)
    .join("\n");

  const prompt = `
Analiza esta conversación entre una persona y el asistente de ${profile.name}.
Es una ayuda interna para el coordinador que la va a contactar. No juzgues a la persona ni infieras su ideología.
No incluyas en el resumen cédulas, direcciones exactas ni otros datos personales aunque aparezcan en la conversación.

Devuelve exclusivamente JSON válido con esta estructura:
{
  "summary": "resumen breve en español, máximo 4 líneas: qué preguntó o contó",
  "topic": "tema principal en 1 a 3 palabras (por ejemplo: servicios públicos, empleo, salud, seguridad, propuestas, sumarse)",
  "primaryConcern": "principal problema, preocupación o pedido en una frase",
  "nextAction": "qué conviene hacer o decir al contactarla, en una frase"
}

Contexto:
- Localidad: ${[lead.zone_name || lead.locality_text, lead.state].filter(Boolean).join(", ") || "sin indicar"}
- Estado del seguimiento: ${lead.status}
- Notas internas: ${lead.notes || "sin notas"}

Conversación:
${transcript || "No hay conversación registrada. Acláralo en el resumen."}
`;

  if (!ai.apiKey) throw new Error("Falta configurar la clave de IA en Configuración → Integraciones.");
  const text = await askAIWithFallback({
    ai, contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 500 },
    timeoutMs: 12000
  });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("El proveedor de IA devolvió un análisis con formato inválido.");
  }

  const updated = await query(
    `UPDATE leads
     SET ai_summary=$2,
         ai_topic=$3,
         ai_primary_concern=$4,
         ai_next_action=$5,
         ai_analyzed_at=now(),
         updated_at=now()
     WHERE id=$1
     RETURNING *`,
    [
      leadId,
      String(parsed.summary || "").slice(0,2000),
      String(parsed.topic || "").trim().toLowerCase().slice(0,60) || null,
      String(parsed.primaryConcern || "").slice(0,700),
      String(parsed.nextAction || "").slice(0,700)
    ]
  );

  await query(
    `INSERT INTO activities (lead_id,type,description,metadata)
     VALUES ($1,'ai_analysis','Se actualizó el análisis interno con IA.',$2::jsonb)`,
    [leadId, JSON.stringify({ topic: parsed.topic || null })]
  );

  return updated.rows[0];
}

module.exports = { analyzeLead };
