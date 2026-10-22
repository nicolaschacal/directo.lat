const { query } = require("./db");

// Valores por defecto de una instalación nueva. Cada cliente completa los suyos
// desde el panel (Configuración → Perfil).
const DEFAULT_PRIVACY_NOTICE =
  "Por tu seguridad, no escribas tu cédula, dirección ni otros datos personales en el chat. " +
  "Si quieres que te contacte el coordinador de tu zona, solo te pediremos nombre, teléfono y localidad. " +
  "Tus datos se tratan de forma privada y solo los ve el equipo.";
const DEFAULT_PROFILE = {
  name: "Mi candidatura",
  category: "Dirigente político",
  shortDescription: "",
  statusText: "",
  addressLine1: "",
  addressLine2: "",
  mapQuery: "",
  phoneDisplay: "",
  phoneE164: "",
  email: "",
  website: "",
  instagram: "",
  instagramLabel: "",
  facebook: "",
  facebookLabel: "",
  openHour: 8,
  closeHour: 18,
  weekdays: [1,2,3,4,5],
  badgeEnabled: true,
  logoUrl: "",
  brandColor: "",
  secondaryColor: "",
  welcomeMessage: "",
  privacyNotice: DEFAULT_PRIVACY_NOTICE,
  assistantNotes: ""
};

async function getProfile() {
  try {
    const result = await query("SELECT value FROM crm_settings WHERE key='profile' LIMIT 1");
    const stored = result.rows[0]?.value || {};
    return { ...DEFAULT_PROFILE, ...stored, privacyNotice: stored.privacyNotice || DEFAULT_PRIVACY_NOTICE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

module.exports = { DEFAULT_PROFILE, DEFAULT_PRIVACY_NOTICE, getProfile };
