const { query } = require("../../lib/db");
const { getCaptureSettings } = require("../../lib/capture");
const { STATES, listZones, resolveLocation } = require("../../lib/zones");
const { loadVisitorMessages, setVisitorLocation } = require("../../lib/visitor-session");

function locationPayload(session, zones) {
  if (!session?.state) return null;
  const zone = session.zone_id ? zones.find((z) => z.id === session.zone_id) : null;
  return {
    state: session.state,
    zoneId: session.zone_id || null,
    localityText: session.locality_text || "",
    label: [zone?.name || session.locality_text, session.state].filter(Boolean).join(", ")
  };
}

// GET  → historial del chat de este navegador, localidades disponibles y localidad elegida.
// POST → { state, zoneId?, localityText? } guarda la localidad de la conversación.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  try {
    if (req.method === "POST") {
      const body = req.body || {};
      const location = await resolveLocation(body, { required: false });
      if (!location.state) return res.status(400).json({ success: false, message: "Elige tu estado." });
      const session = await setVisitorLocation(req, res, location);
      const zones = await listZones();
      return res.status(200).json({ success: true, location: locationPayload(session, zones) });
    }

    if (req.method !== "GET") {
      return res.status(405).json({ success: false, message: "Método no permitido." });
    }

    const { session, messages } = await loadVisitorMessages(req, res, 250);
    const [zones, leadRow, capture] = await Promise.all([
      listZones(),
      session.lead_id
        ? query("SELECT full_name, phone FROM leads WHERE id=$1", [session.lead_id]).then((r) => r.rows[0]).catch(() => null)
        : null,
      getCaptureSettings()
    ]);

    return res.status(200).json({
      success: true,
      messages: messages.map((item) => ({ role: item.role, text: item.content, createdAt: item.created_at })),
      states: STATES,
      zones: zones.map((z) => ({ id: z.id, state: z.state, name: z.name })),
      location: locationPayload(session, zones),
      contactEnabled: capture.contactOffer !== false,
      // El mismo navegador que ya dejó sus datos: se usa para no volver a pedirlos.
      contact: leadRow ? { name: leadRow.full_name || "", hasPhone: Boolean(leadRow.phone) } : null
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error("Chat session error:", error);
    return res.status(500).json({ success: false, message: "No se pudo recuperar la conversación." });
  }
};
