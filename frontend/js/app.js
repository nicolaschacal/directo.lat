const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const messagesContainer = document.getElementById("messages");
const newChatButton = document.getElementById("new-chat");
const contactHeaderButton = document.getElementById("contact-header");
const sendButton = document.getElementById("send-button");
const quickQuestions = document.querySelectorAll(".quick-question");
const typingIndicator = document.getElementById("typing-indicator");
const contactStatus = document.getElementById("contact-status");
const conversationRoot = messagesContainer.querySelector(".conversation");
const chatApp = document.querySelector(".chat-app");
const businessProfileTrigger = document.getElementById("business-profile-trigger");
const businessProfile = document.getElementById("business-profile");
const businessProfileBack = document.getElementById("business-profile-back");
const businessShareButton = document.getElementById("business-share");
const businessOpenStatus = document.getElementById("business-open-status");

const API_URL = "/api/chat";

const PENDING_ACTION_KEY = "escucha_chat_pending_action";
let conversationHistory = [];
let pendingAction = sessionStorage.getItem(PENDING_ACTION_KEY);

const usesSoftwareKeyboardViewport =
  window.matchMedia("(pointer: coarse)").matches &&
  Number(navigator.maxTouchPoints || 0) > 0;

// Neutral defaults. The real data comes from /api/profile (the client's own
// configuration in the dashboard).
let publicProfile = {
  name: "Asistente",
  category: "",
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
  closeHour: 20,
  weekdays: [1,2,3,4,5,6],
  badgeEnabled: true,
  logoUrl: "",
  brandColor: "",
  secondaryColor: "",
  welcomeMessage: "",
  privacyNotice: ""
};

const params = new URLSearchParams(window.location.search);
const attribution = {
  utmSource: params.get("utm_source") || "",
  utmMedium: params.get("utm_medium") || "",
  utmCampaign: params.get("utm_campaign") || ""
};

function messageTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return [date.getFullYear(), date.getMonth(), date.getDate()].join("-");
}

function dayLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (dayKey(date) === dayKey(now)) return "Hoy";
  if (dayKey(date) === dayKey(yesterday)) return "Ayer";

  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

function stampStaticTimes() {
  document.querySelectorAll(".message-time:empty").forEach((node) => {
    node.textContent = messageTime();
  });
}

function scrollToBottom(behavior = "smooth") {
  requestAnimationFrame(() => {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior
    });
  });
}

function setTyping(isTyping, label = "escribiendo…") {
  typingIndicator.hidden = !isTyping;
  contactStatus.textContent = isTyping ? label : "en línea";
  contactStatus.classList.toggle("is-typing", isTyping);
  if (isTyping) scrollToBottom("smooth");
}

function setLoading(isLoading) {
  sendButton.disabled = isLoading;
}

function removeWelcomeActions() {
  const quick = messagesContainer.querySelector(".quick-section");
  if (quick) quick.remove();
}

function ensureConversationRoot() {
  return messagesContainer.querySelector(".conversation") || conversationRoot;
}

function addDayDivider(value) {
  const root = ensureConversationRoot();
  const divider = document.createElement("div");
  divider.className = "day-divider";
  const span = document.createElement("span");
  span.textContent = dayLabel(value);
  divider.appendChild(span);
  root.appendChild(divider);
}

function addMessage(text, sender, options = {}) {
  removeWelcomeActions();

  const root = ensureConversationRoot();
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  const stack = document.createElement("div");
  stack.className = "message-stack";

  const message = document.createElement("div");
  message.className = `message ${sender === "user" ? "user-message" : "assistant-message"}`;

  const body = document.createElement("span");
  body.className = "message-text";
  body.textContent = text;

  const timestamp = options.timestamp || new Date();
  const meta = document.createElement("span");
  meta.className = "message-meta";

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = messageTime(timestamp);
  meta.appendChild(time);

  if (sender === "user") {
    const delivery = document.createElement("span");
    delivery.className = "delivery-check";
    delivery.setAttribute("aria-label", "Leído");
    delivery.innerHTML = '<svg viewBox="0 0 18 11" aria-hidden="true"><path d="M1 6l3.2 3.2L11 1.6M7 9.2 15.6 1.6"/></svg>';
    meta.appendChild(delivery);
  }

  message.append(body, meta);
  stack.appendChild(message);
  row.appendChild(stack);
  root.appendChild(row);

  if (!options.skipScroll) scrollToBottom();
  return row;
}

function addCustomAssistantCard(node, extraClass = "") {
  removeWelcomeActions();

  const root = ensureConversationRoot();
  const row = document.createElement("div");
  row.className = `message-row assistant ${extraClass}`.trim();

  const stack = document.createElement("div");
  stack.className = "message-stack custom-card";

  const card = document.createElement("div");
  card.className = "message assistant-message";
  card.appendChild(node);

  const meta = document.createElement("span");
  meta.className = "message-meta message-meta--block";
  meta.innerHTML = `<span class="message-time">${messageTime()}</span>`;
  card.appendChild(meta);

  stack.appendChild(card);
  row.appendChild(stack);
  root.appendChild(row);

  scrollToBottom();
  return row;
}

function restoreConversation(messages) {
  if (!messages?.length) return;

  const root = ensureConversationRoot();
  root.innerHTML = "";

  let previousDay = null;
  conversationHistory = [];

  messages.forEach((item) => {
    if (!item?.text || !["user", "assistant"].includes(item.role)) return;

    const createdAt = item.createdAt || new Date();
    const key = dayKey(createdAt);

    if (key !== previousDay) {
      addDayDivider(createdAt);
      previousDay = key;
    }

    addMessage(item.text, item.role === "assistant" ? "assistant" : "user", {
      timestamp: createdAt,
      skipScroll: true
    });

    conversationHistory.push({
      role: item.role === "assistant" ? "model" : "user",
      text: item.text
    });
  });

  conversationHistory = conversationHistory.slice(-12);
  scrollToBottom("auto");
}

function normalizeIntentText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAffirmative(text) {
  return /^(si|s|dale|claro|perfecto|ok|okay|quiero|de acuerdo|bueno|vale|epa si|me gustaria|por favor)(\s|$)/.test(normalizeIntentText(text));
}

function isNegative(text) {
  return /^(no|no gracias|ahora no|mas tarde)(\s|$)/.test(normalizeIntentText(text));
}

function setPendingAction(action) {
  pendingAction = action || null;
  if (pendingAction) {
    sessionStorage.setItem(PENDING_ACTION_KEY, pendingAction);
  } else {
    sessionStorage.removeItem(PENDING_ACTION_KEY);
  }
}

function removeActionRow() {
  ensureConversationRoot().querySelectorAll(".booking-action-row").forEach((node) => node.remove());
}

/* ---------- Localidad ---------- */

let availableStates = [];
let availableZones = [];
let chosenLocation = null;
let contactCaptured = false;
let knownContact = null;
let contactEnabled = true;

function zonesFor(state) {
  return availableZones.filter((zone) => zone.state === state);
}

function fillStateSelect(select, selected = "") {
  select.innerHTML = `<option value="">Estado</option>${availableStates
    .map((state) => `<option value="${escapeHtml(state)}"${state === selected ? " selected" : ""}>${escapeHtml(state)}</option>`)
    .join("")}`;
}

function fillZoneSelect(select, state, selected = "") {
  const zones = zonesFor(state);
  select.innerHTML = `<option value="">Municipio o localidad</option>${zones
    .map((zone) => `<option value="${zone.id}"${zone.id === selected ? " selected" : ""}>${escapeHtml(zone.name)}</option>`)
    .join("")}<option value="other"${selected === "other" ? " selected" : ""}>Otra localidad</option>`;
  return zones.length;
}

/**
 * Conecta un trío estado / localidad / "otra" y devuelve una función que lee
 * el valor elegido: { state, zoneId, localityText } o null si falta el estado.
 */
function wireLocationFields(stateSelect, zoneSelect, otherInput, initial = null, onChange = () => {}) {
  fillStateSelect(stateSelect, initial?.state || "");

  const sync = () => {
    const state = stateSelect.value;
    if (!state) {
      zoneSelect.hidden = true;
      otherInput.hidden = true;
      onChange();
      return;
    }
    const count = fillZoneSelect(zoneSelect, state, zoneSelect.dataset.keep || "");
    zoneSelect.dataset.keep = "";
    zoneSelect.hidden = count === 0;
    if (count === 0) zoneSelect.value = "other";
    otherInput.hidden = zoneSelect.value !== "other";
    onChange();
  };

  if (initial?.state) {
    zoneSelect.dataset.keep = initial.zoneId || (initial.localityText ? "other" : "");
    if (initial.localityText) otherInput.value = initial.localityText;
  }
  stateSelect.addEventListener("change", sync);
  zoneSelect.addEventListener("change", () => {
    otherInput.hidden = zoneSelect.value !== "other";
    if (!otherInput.hidden) otherInput.focus();
    onChange();
  });
  otherInput.addEventListener("input", onChange);
  sync();

  return () => {
    const state = stateSelect.value;
    if (!state) return null;
    const zoneId = zoneSelect.value && zoneSelect.value !== "other" ? zoneSelect.value : null;
    const localityText = zoneId ? "" : otherInput.value.trim();
    return { state, zoneId, localityText };
  };
}

function locationLabel(location) {
  if (!location?.state) return "";
  const zone = location.zoneId ? availableZones.find((z) => z.id === location.zoneId) : null;
  return [zone?.name || location.localityText, location.state].filter(Boolean).join(", ");
}

function showChosenLocation() {
  const form = document.getElementById("location-form");
  const chosen = document.getElementById("location-chosen");
  if (!form || !chosen) return;
  if (!chosenLocation?.state) {
    form.hidden = false;
    chosen.hidden = true;
    return;
  }
  form.hidden = true;
  chosen.hidden = false;
  chosen.innerHTML = `${uiIcon("pin")}<span>${escapeHtml(chosenLocation.label || locationLabel(chosenLocation))}</span> <button type="button" class="location-change">Cambiar</button>`;
  chosen.querySelector(".location-change").addEventListener("click", () => {
    form.hidden = false;
    chosen.hidden = true;
  });
}

function setupLocationPicker() {
  const form = document.getElementById("location-form");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "1";
  const save = form.querySelector(".location-save");
  let read = null;
  read = wireLocationFields(
    document.getElementById("location-state"),
    document.getElementById("location-zone"),
    document.getElementById("location-other"),
    chosenLocation,
    () => {
      const value = read?.();
      save.hidden = !(value && (value.zoneId || value.localityText || zonesFor(value.state).length === 0));
    }
  );

  const submit = async () => {
    const value = read();
    if (!value) return;
    try {
      const response = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(value)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "No se pudo guardar.");
      chosenLocation = { ...value, label: data.location?.label || locationLabel(value) };
      showChosenLocation();
    } catch (error) {
      console.error("Localidad:", error);
    }
  };

  form.addEventListener("submit", (event) => { event.preventDefault(); submit(); });
  // Si eligió una localidad de la lista, se guarda sin tener que tocar "Listo".
  document.getElementById("location-zone").addEventListener("change", (event) => {
    if (event.target.value && event.target.value !== "other") submit();
  });
}

/* ---------- Contacto con el coordinador ---------- */

function addContactAction() {
  removeActionRow();
  if (!contactEnabled || contactCaptured) return;

  const row = document.createElement("div");
  row.className = "booking-action-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "booking-action-button";
  button.textContent = "Sí, que me contacten";
  button.addEventListener("click", () => {
    removeActionRow();
    showContactCard({ echo: "Sí, quiero que me contacte el coordinador de mi zona." });
  });
  row.appendChild(button);
  ensureConversationRoot().appendChild(row);
  scrollToBottom();
}

function showContactCard({ echo = "" } = {}) {
  setPendingAction(null);
  if (echo) addMessage(echo, "user");

  if (contactCaptured) {
    addMessage("Ya tenemos tus datos: el coordinador de tu zona te va a contactar. Si quieres, puedes seguir escribiéndome.", "assistant");
    return;
  }

  const container = document.createElement("div");
  container.className = "booking-form-card contact-card";
  container.innerHTML = `
    <div class="booking-head">
      <span class="booking-head-copy">
        <strong>Que te contacte el coordinador de tu zona</strong>
        <small>Solo te pedimos nombre, teléfono y localidad.</small>
      </span>
    </div>`;

  const form = document.createElement("form");
  form.className = "booking-form";
  form.noValidate = true;
  form.innerHTML = `
    <div class="field-group">
      <label class="field">
        <span>Nombre</span>
        <input placeholder="Nombre" name="name" autocomplete="given-name" required maxlength="160">
      </label>
      <label class="field">
        <span>Teléfono o WhatsApp</span>
        <input placeholder="0414 1234567" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" required>
      </label>
      <label class="field">
        <span>Estado</span>
        <select name="state" required></select>
      </label>
      <label class="field" data-zone-field>
        <span>Municipio o localidad</span>
        <select name="zoneId"></select>
      </label>
      <label class="field" data-other-field>
        <span>¿Cuál?</span>
        <input placeholder="Escribe tu municipio o localidad" name="localityText" maxlength="120">
      </label>
    </div>
    <p class="contact-hint">${escapeHtml(publicProfile.privacyNotice || "No escribas tu cédula ni tu dirección.")}</p>
    <label class="consent-row">
      <input name="consent" type="checkbox" value="true" required>
      <span>Acepto que el equipo de ${escapeHtml(publicProfile.name || "la campaña")} use estos datos solo para contactarme.</span>
    </label>
    <button type="submit" class="chat-btn chat-btn--primary booking-submit"><span>Enviar mis datos</span></button>
  `;

  if (knownContact?.name) form.elements.name.value = knownContact.name;

  const zoneField = form.querySelector("[data-zone-field]");
  const otherField = form.querySelector("[data-other-field]");
  const stateSelect = form.elements.state;
  const zoneSelect = form.elements.zoneId;
  const otherInput = form.elements.localityText;
  // Los <select>/<input> se ocultan a través de su etiqueta.
  const mirror = () => {
    zoneField.hidden = zoneSelect.hidden;
    otherField.hidden = otherInput.hidden;
  };
  const readLocation = wireLocationFields(stateSelect, zoneSelect, otherInput, chosenLocation, mirror);
  mirror();

  const showError = (message) => {
    const errorBox = form.querySelector(".booking-error") || document.createElement("div");
    errorBox.className = "booking-error";
    errorBox.textContent = message;
    form.prepend(errorBox);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const location = readLocation();

    if (!name) return showError("Dinos tu nombre.");
    if (phone.replace(/\D/g, "").length < 10) return showError("Revisa el teléfono. Ejemplo: 0414 1234567.");
    if (!location) return showError("Elige tu estado.");
    if (!location.zoneId && !location.localityText) return showError("Indícanos tu municipio o localidad.");
    if (!form.elements.consent.checked) return showError("Necesitamos tu autorización para que te contacten.");

    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.querySelector("span").textContent = "Enviando…";
    setTyping(true, "guardando tus datos…");

    try {
      const response = await fetch("/api/lead/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, phone, ...location, consent: true, ...attribution })
      });
      const data = await response.json();
      setTyping(false);
      if (!response.ok || !data.success) throw new Error(data.message || "No se pudieron guardar tus datos.");

      contactCaptured = true;
      knownContact = { name, hasPhone: true };
      if (!chosenLocation?.state) {
        chosenLocation = { ...location, label: locationLabel(location) };
        showChosenLocation();
      }
      container.innerHTML = `
        <div class="booking-success">
          <p class="appt-status">${uiIcon("check")}Datos enviados</p>
          <p>${escapeHtml(locationLabel(location))}</p>
        </div>`;

      addMessage(data.message, "assistant");
      conversationHistory.push({ role: "model", text: data.message });
    } catch (error) {
      setTyping(false);
      submit.disabled = false;
      submit.querySelector("span").textContent = "Enviar mis datos";
      showError(error.message);
    }
  });

  container.appendChild(form);
  addCustomAssistantCard(container);
}

const UI_ICONS = {
  calendar: '<path d="M7 3v3M17 3v3M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5Z"/>',
  calendarCheck: '<path d="M7 3v3M17 3v3M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5Z"/><path d="m9 14.5 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'
};

function uiIcon(name, className = "ui-icon") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${UI_ICONS[name] || ""}</svg>`;
}

function capitalize(value = "") {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function bubbleButton(label, { icon, tone = "", onClick, href } = {}) {
  const el = document.createElement(href ? "a" : "button");
  if (href) {
    el.href = href;
    el.target = "_blank";
    el.rel = "noreferrer";
  } else {
    el.type = "button";
  }
  el.className = `bubble-action${tone ? ` bubble-action--${tone}` : ""}`;
  el.innerHTML = `${icon ? uiIcon(icon) : ""}<span>${escapeHtml(label)}</span>`;
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

function getProfileWebsiteLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return String(value || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function formatProfileWeekdays(days = []) {
  const ordered = [...new Set((days || []).map(Number).filter((d) => d >= 1 && d <= 7))].sort((a,b) => a-b);
  if (ordered.join(",") === "1,2,3,4,5") return "Lunes a viernes";

  const labels = {1:"Lun",2:"Mar",3:"Mié",4:"Jue",5:"Vie",6:"Sáb",7:"Dom"};
  return ordered.map((d) => labels[d]).join(", ") || "Consultar";
}

function applyPublicProfile() {
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value || "";
  };

  setText("header-profile-name", publicProfile.name);
  setText("business-profile-name", publicProfile.name);
  setText("business-profile-category", publicProfile.category);
  setText("business-category-text", publicProfile.category);
  setText("business-description-text", publicProfile.shortDescription);
  setText("business-status-text", publicProfile.statusText);
  setText("business-address-1", publicProfile.addressLine1);
  setText("business-address-2", publicProfile.addressLine2);
  setText("business-phone-display", publicProfile.phoneDisplay);
  setText("business-email-display", publicProfile.email);
  setText("business-instagram-display", publicProfile.instagramLabel);
  setText("business-facebook-display", publicProfile.facebookLabel);
  setText("business-hours-text", `${String(publicProfile.openHour).padStart(2,"0")}:00 a ${String(publicProfile.closeHour).padStart(2,"0")}:00`);
  setText("business-days-text", formatProfileWeekdays(publicProfile.weekdays));
  setText("business-website-display", getProfileWebsiteLabel(publicProfile.website));

  applyBranding();
  applyWelcomeMessage();
  setText("privacy-notice-text", publicProfile.privacyNotice || "Por tu seguridad, no escribas tu cédula, dirección ni otros datos personales en el chat.");

  document.querySelectorAll("[data-profile-badge]").forEach((badge) => {
    badge.hidden = publicProfile.badgeEnabled === false;
  });

  const callHref = publicProfile.phoneE164 ? `tel:${publicProfile.phoneE164}` : "#";
  const emailHref = publicProfile.email ? `mailto:${publicProfile.email}` : "#";
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(publicProfile.mapQuery || publicProfile.addressLine1 || "")}`;

  const hrefs = {
    "business-call-action": callHref,
    "business-phone-link": callHref,
    "business-email-link": emailHref,
    "business-map-link": mapHref,
    "business-website-action": publicProfile.website || "#",
    "business-website-link": publicProfile.website || "#",
    "header-website-link": publicProfile.website || "#",
    "footer-website-link": publicProfile.website || "#",
    "business-instagram-link": publicProfile.instagram || "#",
    "business-facebook-link": publicProfile.facebook || "#"
  };

  Object.entries(hrefs).forEach(([id, href]) => {
    const node = document.getElementById(id);
    if (node) node.href = href;
  });

  const footerWebsite = document.getElementById("footer-website-link");
  if (footerWebsite) footerWebsite.textContent = publicProfile.website ? getProfileWebsiteLabel(publicProfile.website) : "";

  hideMissingProfileData();
  document.title = publicProfile.name || "Asistente";
  updateBusinessOpenStatus();
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function initialsLogo(name, color) {
  const letters = String(name || "")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${color}"/><text x="48" y="50" font-family="-apple-system,Segoe UI,Roboto,Arial,sans-serif" font-size="38" font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="central">${letters}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function applyBranding() {
  const root = document.documentElement;
  const brand = HEX_COLOR.test(publicProfile.brandColor || "") ? publicProfile.brandColor : "";
  const second = HEX_COLOR.test(publicProfile.secondaryColor || "") ? publicProfile.secondaryColor : "";
  if (brand) root.style.setProperty("--brand", brand); else root.style.removeProperty("--brand");
  if (second) root.style.setProperty("--brand-2", second); else root.style.removeProperty("--brand-2");

  const logo = publicProfile.logoUrl || initialsLogo(publicProfile.name, brand || "#2747d6");
  document.querySelectorAll("[data-brand-logo]").forEach((img) => { img.src = logo; });
}

function applyWelcomeMessage() {
  const node = document.getElementById("welcome-text");
  if (!node) return;
  const custom = String(publicProfile.welcomeMessage || "").trim();
  node.textContent = custom || [
    `¡Hola! 👋 Soy el asistente virtual de ${publicProfile.name}.`,
    "",
    "Puedo contarte quién es, qué propone y cómo puede ayudar a tu comunidad. También puedes contarme qué está pasando en tu zona."
  ].join("\n");
}

// A client may not have every channel. Hide rows and actions without data.
function hideMissingProfileData() {
  const p = publicProfile;
  const toggle = (id, show) => {
    const node = document.getElementById(id);
    if (node) node.hidden = !show;
  };
  const hasAddress = Boolean(p.addressLine1 || p.addressLine2 || p.mapQuery);
  toggle("business-map-link", hasAddress);
  toggle("business-location-action", hasAddress);
  toggle("business-phone-link", Boolean(p.phoneE164 || p.phoneDisplay));
  toggle("business-call-action", Boolean(p.phoneE164));
  toggle("business-email-link", Boolean(p.email));
  toggle("business-website-link", Boolean(p.website));
  toggle("business-website-action", Boolean(p.website));
  toggle("header-website-link", Boolean(p.website));
  toggle("business-instagram-link", Boolean(p.instagram));
  toggle("business-facebook-link", Boolean(p.facebook));

  // Category is already shown under the name in the hero.
  const category = document.getElementById("business-category-text")?.closest(".profile-info-row");
  if (category) category.hidden = true;

  const description = document.getElementById("business-description-text")?.closest(".profile-info-row");
  if (description) description.hidden = !(p.shortDescription || p.statusText);

  document.querySelectorAll(".profile-info-card").forEach((card) => {
    const rows = [...card.querySelectorAll(":scope > .profile-info-row, :scope > a")];
    if (rows.length) card.hidden = rows.every((row) => row.hidden || row.style.display === "none");
  });
}

async function loadPublicProfile() {
  try {
    const response = await fetch("/api/profile", {
      cache: "no-store",
      credentials: "same-origin"
    });
    const data = await response.json();
    if (response.ok && data.success && data.profile) {
      publicProfile = { ...publicProfile, ...data.profile };
    }
  } catch (error) {
    console.error("No se pudo cargar el perfil público:", error);
  } finally {
    applyPublicProfile();
  }
}

function updateBusinessOpenStatus() {
  if (!businessOpenStatus) return;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Caracas",
    weekday: "short",
    hour: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const weekdayLabel = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const weekdayMap = {Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
  const weekday = weekdayMap[weekdayLabel];
  const allowedDays = Array.isArray(publicProfile.weekdays) ? publicProfile.weekdays.map(Number) : [1,2,3,4,5];
  const isOpen = allowedDays.includes(weekday) &&
    hour >= Number(publicProfile.openHour ?? 8) &&
    hour < Number(publicProfile.closeHour ?? 18);

  businessOpenStatus.textContent = isOpen ? "Equipo disponible ahora" : "Horario del equipo";
  businessOpenStatus.classList.toggle("is-closed", !isOpen);
}

async function openBusinessProfile() {
  if (!businessProfile) return;
  await profilePromise;
  messageInput.blur();
  businessProfile.hidden = false;
  businessProfile.setAttribute("aria-hidden", "false");
  updateBusinessOpenStatus();

  requestAnimationFrame(() => {
    businessProfile.classList.add("is-open");
    businessProfileBack?.focus({ preventScroll: true });
  });
}

function closeBusinessProfile() {
  if (!businessProfile || businessProfile.hidden) return;

  businessProfile.classList.remove("is-open");
  businessProfile.setAttribute("aria-hidden", "true");

  setTimeout(() => {
    businessProfile.hidden = true;
    businessProfileTrigger?.focus({ preventScroll: true });
  }, 240);
}

async function shareBusinessProfile() {
  const shareData = {
    title: publicProfile.name,
    text: `Conversa con el asistente de ${publicProfile.name}${publicProfile.shortDescription ? ` · ${publicProfile.shortDescription}` : ""}`,
    url: `${window.location.origin}${window.location.pathname}`
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(shareData.url);
    businessShareButton?.classList.add("is-success");
    const original = businessShareButton?.querySelector("span:last-child");
    if (original) original.textContent = "Copiado";

    setTimeout(() => {
      businessShareButton?.classList.remove("is-success");
      if (original) original.textContent = "Compartir";
    }, 1400);
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error("No se pudo compartir el perfil:", error);
    }
  }
}

businessProfileTrigger?.addEventListener("click", openBusinessProfile);
businessProfileBack?.addEventListener("click", closeBusinessProfile);
businessShareButton?.addEventListener("click", shareBusinessProfile);

businessProfile?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeBusinessProfile();
});

function finishConversationBootstrap({ showWelcome = false } = {}) {
  const loading = document.getElementById("conversation-loading");
  if (loading) loading.remove();

  const welcome = document.querySelector(".welcome-card");
  if (welcome) welcome.hidden = !showWelcome;

  chatApp?.classList.remove("app-booting");
  contactStatus.textContent = "en línea";
  contactStatus.classList.remove("is-typing");
}

async function bootstrapConversation() {
  setLoading(true);

  try {
    const sessionUrl = "/api/chat/session";

    const response = await fetch(sessionUrl, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await response.json();

    if (response.ok && data.success) {
      const restoredMessages = data.messages || [];
      restoreConversation(restoredMessages);
      knownContact = data.contact || null;
      contactCaptured = Boolean(data.contact?.hasPhone);
      contactEnabled = data.contactEnabled !== false;
      availableStates = data.states || [];
      availableZones = data.zones || [];
      chosenLocation = data.location || null;
      if (!contactEnabled) {
        contactHeaderButton.hidden = true;
        document.querySelectorAll('[data-action="contact"]').forEach((node) => { node.hidden = true; });
      }

      setupLocationPicker();
      showChosenLocation();

      finishConversationBootstrap({
        showWelcome: restoredMessages.length === 0
      });

      if (pendingAction === "contact" && !contactCaptured) addContactAction();
    } else {
      finishConversationBootstrap({ showWelcome: true });
    }
  } catch (error) {
    console.error("No se pudo restaurar la conversación:", error);
    finishConversationBootstrap({ showWelcome: true });
  } finally {
    setLoading(false);
    chatApp?.classList.remove("app-booting");
    if (contactStatus.textContent === "Conectando…") {
      contactStatus.textContent = "en línea";
    }
    scrollToBottom("auto");
  }
}

async function sendMessage(message) {
  await bootstrapPromise;
  setLoading(true);
  setTyping(true);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          message,
          history: conversationHistory,
          ...attribution
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();
    setTyping(false);

    if (!response.ok || !data.success) throw new Error(data.message || "No pudimos completar la consulta.");

    addMessage(data.response, "assistant");
    conversationHistory.push({ role: "user", text: message });
    conversationHistory.push({ role: "model", text: data.response });
    conversationHistory = conversationHistory.slice(-12);

    const nextAction = data.action === "contact" && contactEnabled && !contactCaptured ? "contact" : null;
    setPendingAction(nextAction);
    if (nextAction && data.openContact) showContactCard();
    else if (nextAction) addContactAction();
  } catch (error) {
    setTyping(false);
    console.error("Chat:", error);

    addMessage(
      error?.name === "AbortError"
        ? "Estoy tardando más de lo normal. Intenta de nuevo en unos segundos."
        : "No pude responder en este momento. Intenta de nuevo en unos segundos.",
      "assistant"
    );
  } finally {
    setLoading(false);
    messageInput.focus({ preventScroll: true });
  }
}

async function submitQuestion(text) {
  await bootstrapPromise;
  const cleanText = text.trim();
  if (!cleanText || sendButton.disabled) return;

  messageInput.value = "";
  messageInput.style.height = "auto";

  const contactOffered = pendingAction === "contact";
  if (contactOffered && !contactCaptured && isAffirmative(cleanText) && cleanText.split(/\s+/).length <= 5) {
    addMessage(cleanText, "user");
    removeActionRow();
    showContactCard();
    return;
  }
  if (contactOffered && isNegative(cleanText)) {
    setPendingAction(null);
    removeActionRow();
  }

  addMessage(cleanText, "user");
  await sendMessage(cleanText);
}

function syncVisualViewport() {
  if (!usesSoftwareKeyboardViewport) {
    document.documentElement.style.removeProperty("--visual-height");
    document.documentElement.style.removeProperty("--visual-top");
    return;
  }

  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  const top = viewport ? viewport.offsetTop : 0;

  document.documentElement.style.setProperty("--visual-height", `${Math.round(height)}px`);
  document.documentElement.style.setProperty("--visual-top", `${Math.round(top)}px`);
}

let viewportTrackUntil = 0;
let viewportTrackFrame = 0;

function trackViewport(duration = 700) {
  viewportTrackUntil = Math.max(viewportTrackUntil, performance.now() + duration);
  if (viewportTrackFrame) return;
  const step = () => {
    syncVisualViewport();
    // Keep the layout pinned: the header never scrolls away, only the
    // conversation area shrinks and stays anchored to the latest message.
    if (window.scrollY !== 0) window.scrollTo(0, 0);
    if (performance.now() < viewportTrackUntil) {
      viewportTrackFrame = requestAnimationFrame(step);
    } else {
      viewportTrackFrame = 0;
    }
  };
  viewportTrackFrame = requestAnimationFrame(step);
}

function settleKeyboardViewport() {
  if (!usesSoftwareKeyboardViewport) return;

  const nearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 120;
  trackViewport(800);
  if (nearBottom || document.body.classList.contains("keyboard-open")) {
    [60, 180, 360, 620].forEach((delay) => setTimeout(() => scrollToBottom("auto"), delay));
  }
}

let keepComposerFocused = false;
let sendPointerHandled = false;

sendButton.addEventListener("pointerdown", (event) => {
  if (sendButton.disabled) return;

  keepComposerFocused = true;

  // Prevent iOS/WebKit from moving focus from the textarea to the button.
  if (document.activeElement === messageInput) {
    event.preventDefault();
  }
});

sendButton.addEventListener("pointerup", (event) => {
  if (sendButton.disabled) return;

  event.preventDefault();
  sendPointerHandled = true;
  chatForm.requestSubmit();

  requestAnimationFrame(() => {
    messageInput.focus({ preventScroll: true });
  });

  setTimeout(() => {
    keepComposerFocused = false;
    sendPointerHandled = false;
  }, 350);
});

sendButton.addEventListener("pointercancel", () => {
  keepComposerFocused = false;
  sendPointerHandled = false;
});

sendButton.addEventListener("click", (event) => {
  if (sendPointerHandled) {
    event.preventDefault();
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitQuestion(messageInput.value);
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 112)}px`;
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

messageInput.addEventListener("focus", () => {
  if (!usesSoftwareKeyboardViewport) return;
  document.body.classList.add("keyboard-open");
  settleKeyboardViewport();
});

messageInput.addEventListener("blur", () => {
  if (keepComposerFocused) {
    requestAnimationFrame(() => {
      messageInput.focus({ preventScroll: true });
    });
    return;
  }

  if (!usesSoftwareKeyboardViewport) return;
  document.body.classList.remove("keyboard-open");
  setTimeout(syncVisualViewport, 80);
});

if (usesSoftwareKeyboardViewport) {
  window.visualViewport?.addEventListener("resize", settleKeyboardViewport);
  window.visualViewport?.addEventListener("scroll", () => trackViewport(300));

  // iOS lets the user drag the whole page while the keyboard is open, which
  // moves the header out of view. Only real scroll areas may scroll.
  document.addEventListener("touchmove", (event) => {
    if (!document.body.classList.contains("keyboard-open")) return;
    const scroller = event.target.closest?.(".messages, .chat-form textarea");
    if (!scroller) event.preventDefault();
  }, { passive: false });
  window.addEventListener("resize", syncVisualViewport);
  window.addEventListener("orientationchange", settleKeyboardViewport);
}

quickQuestions.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.action === "contact") {
      showContactCard({ echo: "Quiero que me contacte el coordinador de mi zona." });
      return;
    }

    submitQuestion(button.dataset.question || "");
  });
});

contactHeaderButton.addEventListener("click", async () => {
  await bootstrapPromise;
  removeActionRow();
  showContactCard({ echo: "Quiero que me contacte el coordinador de mi zona." });
});

newChatButton.addEventListener("click", async () => {
  await bootstrapPromise;
  setPendingAction(null);
  removeActionRow();
  scrollToBottom("smooth");
  messageInput.focus({ preventScroll: true });
});

window.addEventListener("wheel", (event) => {
  if (event.ctrlKey) event.preventDefault();
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && ["+", "-", "=", "0"].includes(event.key)) {
    event.preventDefault();
  }
});

document.addEventListener("gesturestart", (event) => event.preventDefault());

syncVisualViewport();
stampStaticTimes();
const profilePromise = loadPublicProfile();
const bootstrapPromise = bootstrapConversation();
