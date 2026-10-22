const { query, withTransaction } = require("./db");
const { ensureConversation, linkVisitorToLead } = require("./visitor-session");

// Cómo llegó el contacto.
const CAPTURE_SOURCES = {
  coordinator: "Pidió que lo contacte el coordinador de su zona",
  detected: "Dejó su teléfono en la conversación"
};

const DEFAULT_CAPTURE = {
  contactOffer: true,
  autoDetect: true
};

/* ---------- Settings ---------- */

async function getCaptureSettings() {
  try {
    const result = await query("SELECT value FROM crm_settings WHERE key='capture' LIMIT 1");
    return { ...DEFAULT_CAPTURE, ...(result.rows[0]?.value || {}) };
  } catch {
    return { ...DEFAULT_CAPTURE };
  }
}

/* ---------- Teléfonos venezolanos ---------- */

// Móviles: 0412, 0414, 0416, 0422, 0424, 0426 (+ 7 dígitos), con o sin +58.
// Fijos: 02XX + 7 dígitos. Otros internacionales que empiecen con +.
const PHONE_RES = [
  /(?<![\d$])(?:\+?58[\s.-]?|0)4(?:1[246]|2[246])(?:[\s.-]?\d){7}(?!\d)/,
  /(?<![\d$])(?:\+?58[\s.-]?|0)2\d{2}(?:[\s.-]?\d){7}(?!\d)/,
  /(?<![\d$])\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)/
];

/** Devuelve el teléfono en formato +58XXXXXXXXXX (o +XX… si es de otro país). */
function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const plus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (plus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  }
  if (digits.startsWith("58") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+58${digits.slice(1)}`;
  if (digits.length === 10 && /^[24]/.test(digits)) return `+58${digits}`;
  return "";
}

function detectPhone(text) {
  const value = String(text || "");
  for (const re of PHONE_RES) {
    const match = value.match(re);
    if (match) {
      const phone = normalizePhone(match[0]);
      if (phone) return phone;
    }
  }
  return "";
}

/* ---------- Captura ---------- */

function clean(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function followupTitle(source, name) {
  const who = name || "la persona";
  return source === "detected"
    ? `Contactar a ${who}: dejó su teléfono en el chat`
    : `Contactar a ${who}: pidió hablar con el coordinador de su zona`;
}

/**
 * Crea (o completa) el contacto de esta conversación y los vincula.
 * location = { state, zoneId, localityText } ya validado con resolveLocation.
 */
async function captureLead(req, res, { source, name, phone, location = {}, consent = false, utm = {} }) {
  const sourceKey = CAPTURE_SOURCES[source] ? source : "detected";
  const fullName = clean(name, 160) || null;
  const cleanPhone = normalizePhone(phone) || null;
  if (!cleanPhone) {
    const error = new Error("Necesitamos un teléfono válido para contactarte.");
    error.status = 400;
    throw error;
  }

  return withTransaction(async (client) => {
    const session = await ensureConversation(req, res, client);
    // Si la persona no eligió localidad en el formulario, usamos la del selector del chat.
    const state = location.state || session.state || null;
    const zoneId = location.zoneId || (location.state ? null : session.zone_id) || null;
    const localityText = location.localityText || (location.state ? null : session.locality_text) || null;

    let lead = null;
    let created = false;

    if (session.lead_id) {
      lead = (await client.query("SELECT * FROM leads WHERE id=$1", [session.lead_id])).rows[0] || null;
    }
    if (!lead) {
      lead = (await client.query(
        "SELECT * FROM leads WHERE phone=$1 ORDER BY created_at DESC LIMIT 1",
        [cleanPhone]
      )).rows[0] || null;
    }

    if (lead) {
      lead = (await client.query(
        `UPDATE leads
         SET full_name=COALESCE($2,full_name),
             phone=COALESCE(phone,$3),
             state=COALESCE($4,state),
             zone_id=CASE WHEN $4::text IS NOT NULL THEN $5 ELSE zone_id END,
             locality_text=CASE WHEN $4::text IS NOT NULL THEN $6 ELSE locality_text END,
             privacy_consent_at=CASE WHEN $7 THEN COALESCE(privacy_consent_at,now()) ELSE privacy_consent_at END,
             last_contact_at=now(),
             updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [lead.id, fullName, cleanPhone, state, zoneId, localityText, Boolean(consent)]
      )).rows[0];
    } else {
      lead = (await client.query(
        `INSERT INTO leads
           (full_name,phone,state,zone_id,locality_text,status,source,privacy_consent_at,
            utm_source,utm_medium,utm_campaign,last_contact_at,next_action_at)
         VALUES ($1,$2,$3,$4,$5,'new',$6,CASE WHEN $7 THEN now() END,$8,$9,$10,now(),now())
         RETURNING *`,
        [
          fullName, cleanPhone, state, zoneId, localityText, sourceKey, Boolean(consent),
          clean(utm.utmSource, 200) || null, clean(utm.utmMedium, 200) || null, clean(utm.utmCampaign, 200) || null
        ]
      )).rows[0];
      created = true;
    }

    await linkVisitorToLead(req, res, lead.id, client);
    if (state && !session.state) {
      await client.query(
        "UPDATE conversation_sessions SET state=$2, zone_id=$3, locality_text=$4 WHERE id=$1",
        [session.id, state, zoneId, localityText]
      );
    }

    await client.query(
      `INSERT INTO activities (lead_id,type,description,metadata)
       VALUES ($1,'contact_captured',$2,$3::jsonb)`,
      [lead.id, `${CAPTURE_SOURCES[sourceKey]}.`, JSON.stringify({ source: sourceKey })]
    );

    const pending = await client.query(
      "SELECT 1 FROM followups WHERE lead_id=$1 AND status='pending' LIMIT 1",
      [lead.id]
    );
    if (!pending.rows.length) {
      await client.query(
        `INSERT INTO followups (lead_id,type,title,due_at) VALUES ($1,'capture_contact',$2,now())`,
        [lead.id, followupTitle(sourceKey, lead.full_name)]
      );
    }

    return { lead, created, source: sourceKey };
  });
}

/* ---------- Avisos ---------- */

/** Avisa por correo a los coordinadores de la localidad y al correo general. */
async function notifyCapture(req, { lead, source }, { campaignName = "" } = {}) {
  const { queueAndTrySend, getNotifyEmail } = require("./email");

  const [general, coordinators, zone] = await Promise.all([
    getNotifyEmail().catch(() => ""),
    lead.zone_id
      ? query(
          `SELECT m.email FROM managers m
           JOIN manager_zones mz ON mz.manager_id=m.id
           WHERE mz.zone_id=$1 AND m.active`,
          [lead.zone_id]
        ).then((r) => r.rows.map((row) => row.email)).catch(() => [])
      : [],
    lead.zone_id
      ? query("SELECT name FROM zones WHERE id=$1", [lead.zone_id]).then((r) => r.rows[0]?.name || "").catch(() => "")
      : ""
  ]);

  const recipients = [...new Set([general, ...coordinators].filter(Boolean).map((e) => e.toLowerCase()))];
  const where = [zone || lead.locality_text, lead.state].filter(Boolean).join(", ") || "Sin localidad";

  // El correo no incluye el teléfono ni la conversación: se ven en el panel, con sesión.
  await Promise.allSettled(recipients.map((recipient) => queueAndTrySend({
    leadId: lead.id,
    recipient,
    subject: `Nuevo contacto en ${where}${campaignName ? ` · ${campaignName}` : ""}`,
    bodyText: [
      "Una persona pidió que la contacte el coordinador de su zona.",
      "",
      `Localidad: ${where}`,
      `Motivo: ${CAPTURE_SOURCES[source]}`,
      "",
      "Sus datos, la conversación y el resumen de la IA están en el panel → Contactos."
    ].join("\n")
  })));
}

module.exports = {
  CAPTURE_SOURCES,
  DEFAULT_CAPTURE,
  getCaptureSettings,
  detectPhone,
  normalizePhone,
  captureLead,
  notifyCapture
};
