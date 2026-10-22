const { query, withTransaction } = require("../../lib/db");
const { requireManager } = require("../../lib/auth");
const { DEFAULT_PRIVACY_NOTICE } = require("../../lib/profile");

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanUrl(value) {
  const raw = clean(value, 1200);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function cleanLogo(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(raw)) {
    return raw.length <= 400 * 1024 ? raw : "";
  }
  return cleanUrl(raw);
}

function cleanColor(value) {
  const raw = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : "";
}

function cleanWeekdays(value, fallback = [1,2,3,4,5]) {
  if (!Array.isArray(value) || !value.length) return fallback;
  const unique = [...new Set(value.map(Number).filter((day) => day >= 1 && day <= 7))];
  return unique.length ? unique : fallback;
}

module.exports = async (req, res) => {
  const manager = await requireManager(req, res, { adminOnly: true });
  if (!manager) return;

  if (req.method === "GET") {
    try {
      const result = await query(
        "SELECT key,value FROM crm_settings WHERE key IN ('profile')"
      );
      const settings = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
      return res.status(200).json({ success: true, settings });
    } catch (error) {
      console.error("CRM settings read error:", error);
      return res.status(500).json({ success: false, message: "No se pudo cargar la configuración." });
    }
  }

  if (req.method === "POST") {
    try {
      const profile = req.body?.profile || {};

      const profileOpenHour = Number(profile.openHour ?? 8);
      const profileCloseHour = Number(profile.closeHour ?? 18);

      if (
        !Number.isInteger(profileOpenHour) || profileOpenHour < 0 || profileOpenHour > 23 ||
        !Number.isInteger(profileCloseHour) || profileCloseHour <= profileOpenHour || profileCloseHour > 24
      ) {
        return res.status(400).json({ success: false, message: "El horario público del perfil no es válido." });
      }

      const website = cleanUrl(profile.website);
      const instagram = cleanUrl(profile.instagram);
      const facebook = cleanUrl(profile.facebook);
      const logoUrl = cleanLogo(profile.logoUrl);
      if (profile.logoUrl && !logoUrl) {
        return res.status(400).json({ success: false, message: "El logo debe ser una imagen PNG, JPG, WEBP o SVG de hasta 300 KB, o una dirección https." });
      }
      const brandColor = cleanColor(profile.brandColor);
      const secondaryColor = cleanColor(profile.secondaryColor);

      if (profile.website && !website) {
        return res.status(400).json({ success: false, message: "La URL del sitio web no es válida." });
      }
      if (profile.instagram && !instagram) {
        return res.status(400).json({ success: false, message: "La URL de Instagram no es válida." });
      }
      if (profile.facebook && !facebook) {
        return res.status(400).json({ success: false, message: "La URL de Facebook no es válida." });
      }

      const profileValue = {
        name: clean(profile.name, 160) || "Mi candidatura",
        category: clean(profile.category, 120) || "Dirigente político",
        shortDescription: clean(profile.shortDescription, 260),
        statusText: clean(profile.statusText, 160),
        addressLine1: clean(profile.addressLine1, 240),
        addressLine2: clean(profile.addressLine2, 240),
        mapQuery: clean(profile.mapQuery, 400),
        phoneDisplay: clean(profile.phoneDisplay, 80),
        phoneE164: clean(profile.phoneE164, 40).replace(/[^+\d]/g, ""),
        email: clean(profile.email, 240),
        website,
        instagram,
        instagramLabel: clean(profile.instagramLabel, 160),
        facebook,
        facebookLabel: clean(profile.facebookLabel, 160),
        openHour: profileOpenHour,
        closeHour: profileCloseHour,
        weekdays: cleanWeekdays(profile.weekdays),
        badgeEnabled: profile.badgeEnabled !== false,
        logoUrl,
        brandColor,
        secondaryColor,
        welcomeMessage: String(profile.welcomeMessage ?? "").trim().slice(0, 700),
        privacyNotice: String(profile.privacyNotice ?? "").trim().slice(0, 600) || DEFAULT_PRIVACY_NOTICE,
        assistantNotes: String(profile.assistantNotes ?? "").trim().slice(0, 2000)
      };

      if (profileValue.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileValue.email)) {
        return res.status(400).json({ success: false, message: "El correo del perfil no es válido." });
      }

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO crm_settings(key,value,updated_at)
           VALUES ('profile',$1::jsonb,now())
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
          [JSON.stringify(profileValue)]
        );

        // Keep a knowledge item with the contact details in sync with the
        // profile, so the assistant always answers with the current data.
        const contactContent = [
          `Nombre: ${profileValue.name}${profileValue.category ? ` (${profileValue.category})` : ""}.`,
          profileValue.shortDescription ? `Descripción: ${profileValue.shortDescription}.` : "",
          profileValue.addressLine1 || profileValue.addressLine2
            ? `Dirección: ${[profileValue.addressLine1, profileValue.addressLine2].filter(Boolean).join(", ")}.`
            : "",
          profileValue.phoneDisplay ? `Teléfono: ${profileValue.phoneDisplay}.` : "",
          profileValue.email ? `Correo: ${profileValue.email}.` : "",
          profileValue.website ? `Sitio web: ${profileValue.website}.` : "",
          profileValue.instagramLabel ? `Instagram: ${profileValue.instagramLabel}.` : "",
          profileValue.facebookLabel ? `Facebook: ${profileValue.facebookLabel}.` : "",
          `Horario de atención del equipo: ${String(profileValue.openHour).padStart(2, "0")}:00 a ${String(profileValue.closeHour).padStart(2, "0")}:00.`
        ].filter(Boolean).join("\n");

        const updated = await client.query(
          `UPDATE knowledge_items
           SET content=$1, summary=$2, status='active', updated_by=$3, updated_at=now()
           WHERE source_type='import' AND source_name='perfil'`,
          [contactContent, `Datos de contacto de ${profileValue.name}.`, manager.sub]
        );
        if (!updated.rowCount) {
          await client.query(
            `INSERT INTO knowledge_items (title,summary,content,tags,source_type,source_name,status,priority,updated_by)
             VALUES ('Datos de contacto y ubicación',$1,$2,$3,'import','perfil','active',100,$4)`,
            [`Datos de contacto de ${profileValue.name}.`, contactContent, ["contacto", "redes", "teléfono", "horario", "oficina"], manager.sub]
          );
        }
      });

      return res.status(200).json({ success: true, profile: profileValue });
    } catch (error) {
      console.error("CRM settings update error:", error);
      return res.status(500).json({ success: false, message: "No se pudo guardar la configuración." });
    }
  }

  return res.status(405).json({ success: false, message: "Método no permitido." });
};
