const { getProfile } = require("../../lib/profile");
const { persistVisitorMessage, ensureConversation } = require("../../lib/visitor-session");
const { analyzeLead } = require("../../lib/lead-ai");
const { resolveLocation } = require("../../lib/zones");
const { getCaptureSettings, captureLead, notifyCapture, normalizePhone } = require("../../lib/capture");

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

// POST { name, phone, state, zoneId?, localityText?, consent, utm* }
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ success: false, message: "El registro de contactos no está disponible." });
  }

  try {
    const body = req.body || {};
    const settings = await getCaptureSettings();
    if (settings.contactOffer === false) {
      return res.status(403).json({ success: false, message: "Esta opción no está disponible." });
    }

    const name = String(body.name || "").trim();
    const phone = normalizePhone(body.phone);
    if (!name) return res.status(400).json({ success: false, message: "Dinos tu nombre." });
    if (!phone) return res.status(400).json({ success: false, message: "El teléfono no parece válido. Ejemplo: 0414 1234567." });
    if (body.consent !== true && body.consent !== "true") {
      return res.status(400).json({ success: false, message: "Necesitamos tu autorización para que te contacten." });
    }

    // Si el formulario no trae localidad, se usa la que eligió al abrir el chat.
    let source = body;
    if (!body.state) {
      const session = await ensureConversation(req, res);
      source = { state: session.state, zoneId: session.zone_id, localityText: session.locality_text };
    }
    const location = await resolveLocation(source, { required: true });
    const captured = await captureLead(req, res, {
      source: "coordinator",
      name,
      phone,
      location,
      consent: true,
      utm: body
    });

    const profile = await getProfile();
    const who = firstName(name) ? `Gracias, ${firstName(name)}.` : "Gracias.";
    const message = `${who} El coordinador de tu zona te va a contactar. Mientras tanto, puedes seguir preguntándome lo que quieras.`;

    await Promise.allSettled([
      persistVisitorMessage(req, res, "assistant", message, captured.lead.id),
      captured.created ? notifyCapture(req, captured, { campaignName: profile.name }) : null,
      // Resumen para el coordinador: tema, preocupación principal y próximo paso.
      Promise.race([analyzeLead(captured.lead.id), new Promise((resolve) => setTimeout(resolve, 8000))])
    ]);

    return res.status(201).json({ success: true, message });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error("Error registrando contacto:", error);
    return res.status(500).json({ success: false, message: "No se pudieron guardar tus datos. Intenta de nuevo." });
  }
};
