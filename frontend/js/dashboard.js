/* Panel: contactos por localidad, coordinadores y escucha territorial */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const authScreen = $("#auth-screen");
const loginForm = $("#login-form");
const setupForm = $("#setup-form");
const crmApp = $("#crm-app");
const view = $("#view");
const viewTitle = $("#view-title");
const leadSearch = $("#lead-search");
const searchWrap = $("#search-wrap");
const leadModal = $("#lead-modal");
const leadDetail = $("#lead-detail");
const sidebar = $("#sidebar");
const scrim = $("#sidebar-scrim");
const dialog = $("#dialog");
const dialogBody = $("#dialog-body");

const STAGES = [
  ["new", "Sin llamar"],
  ["contacted", "Contactado"],
  ["followup", "En seguimiento"],
  ["joined", "Se sumó"],
  ["not_interested", "No le interesa"]
];
const STAGE_LABEL = Object.fromEntries(STAGES);
const STAGE_TONE = { new: "pill-warning", contacted: "pill-accent", followup: "pill-accent", joined: "pill-success", not_interested: "" };

const CAPTURE_LABEL = {
  coordinator: "Pidió que lo contacte el coordinador",
  detected: "Escribió su teléfono en el chat"
};

const ROLES = { admin: "Administrador", coordinator: "Coordinador" };
const WEEKDAYS = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"]];

const VIEW_TITLES = {
  overview: "Resumen",
  pipeline: "Contactos",
  followups: "Pendientes",
  territory: "Escucha territorial",
  inquiries: "Conversaciones",
  knowledge: "Base de conocimiento",
  settings: "Configuración"
};
const ADMIN_VIEWS = new Set(["territory", "inquiries"]);

const ICONS = {
  chevron: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  phone: '<path d="M7.2 3.5 4.8 5.9c-.8.8-.9 2-.4 3 2.4 4.7 6 8.3 10.7 10.7 1 .5 2.2.4 3-.4l2.4-2.4-4-4-2 2c-.4.4-1 .5-1.5.2-1.7-1-3-2.3-4-4-.3-.5-.2-1.1.2-1.5l2-2-4-4Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  whatsapp: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.4-1.9-1.3-2.3-2.3l.8-1-1-2z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  mailOut: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  calendar: '<path d="M7 3v3M17 3v3M3.5 9.5h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  chat: '<path d="M5 5h14v10H10l-4 4v-4H5z"/>'
};
const icon = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

let currentView = "overview";
let currentManager = null;
let settingsTab = "start";
let settingsCache = null;
let brand = { name: "Panel", logo: "" };

/* ---------- Utils ---------- */

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function fmtDate(value, options = { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-VE", options).format(d);
}
const fmtTime = (value) => fmtDate(value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmtLongDay = (value) => fmtDate(value, { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
const fmtDay = (value) => fmtDate(value, { day: "numeric", month: "short" });

function relativeDue(value) {
  const d = new Date(value);
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "mañana";
  if (diffDays === -1) return "ayer";
  if (diffDays < 0) return `hace ${-diffDays} días`;
  return `en ${diffDays} días`;
}
function startOfDay(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "·";
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.message || "No se pudo completar la acción.");
    error.status = response.status;
    throw error;
  }
  return data;
}
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });

function toast(message, { error = false } = {}) {
  const node = document.createElement("div");
  node.className = `toast${error ? " is-error" : ""}`;
  node.textContent = message;
  $("#toasts").appendChild(node);
  setTimeout(() => node.remove(), error ? 5200 : 3200);
}

function openDialog(html, { wide = false } = {}) {
  dialogBody.innerHTML = html;
  $(".dialog", dialog).classList.toggle("dialog-wide", wide);
  dialog.hidden = false;
  setTimeout(() => $("input, textarea, select, button", dialogBody)?.focus(), 30);
  return dialogBody;
}
function closeDialog() { dialog.hidden = true; dialogBody.innerHTML = ""; }
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });

function confirmDialog(message, { title = "¿Confirmas?", confirmLabel = "Confirmar", danger = false } = {}) {
  return new Promise((resolve) => {
    const body = openDialog(`
      <div class="card-head"><h2>${esc(title)}</h2></div>
      <div class="card-body"><p>${esc(message)}</p>
        <div class="form-actions">
          <button class="btn btn-ghost" data-answer="no">Volver</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-answer="yes">${esc(confirmLabel)}</button>
        </div>
      </div>`);
    $$("[data-answer]", body).forEach((btn) => btn.addEventListener("click", () => {
      closeDialog();
      resolve(btn.dataset.answer === "yes");
    }));
  });
}

async function withBusy(button, label, fn) {
  const original = button?.innerHTML;
  if (button) { button.disabled = true; button.textContent = label; }
  try {
    return await fn();
  } finally {
    if (button) { button.disabled = false; button.innerHTML = original; }
  }
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).then(() => toast("Copiado.")).catch(() => {});
}

/* ---------- Brand ---------- */

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DEFAULT_BRAND = "#2747d6";

function initialsLogo(name, color) {
  const letters = String(name || "")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${color}"/><text x="48" y="50" font-family="-apple-system,Segoe UI,Roboto,Arial,sans-serif" font-size="38" font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="central">${letters}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function loadBrand() {
  try {
    const p = (await api("/api/profile")).profile || {};
    const color = HEX_COLOR.test(p.brandColor || "") ? p.brandColor : "";
    if (color) document.documentElement.style.setProperty("--brand", color);
    else document.documentElement.style.removeProperty("--brand");
    brand = { name: p.name || brand.name, logo: p.logoUrl || initialsLogo(p.name, color || DEFAULT_BRAND) };
  } catch { /* keep defaults */ }
  $$("[data-brand-name]").forEach((node) => { node.textContent = brand.name; });
  if (brand.logo) $$(".auth-logo, .brand-logo").forEach((img) => { img.src = brand.logo; });
  document.title = `Panel · ${brand.name}`;
}

/* ---------- Auth ---------- */

async function init() {
  loadBrand();
  try {
    const data = await api("/api/crm/me");
    showApp(data.manager);
  } catch {
    await showAuth();
  }
}

async function showAuth() {
  crmApp.hidden = true;
  authScreen.hidden = false;
  let needsSetup = false;
  try {
    needsSetup = (await api("/api/crm/setup")).needsSetup;
  } catch { /* database not ready: show login */ }
  if (needsSetup) {
    // Fresh install: don't show the bundled demo brand.
    $$("[data-brand-name]").forEach((node) => { node.textContent = "Panel"; });
    $$(".auth-logo").forEach((img) => { img.hidden = true; });
  }
  setupForm.hidden = !needsSetup;
  loginForm.hidden = needsSetup;
  $("input", needsSetup ? setupForm : loginForm)?.focus();
}

function showApp(manager) {
  currentManager = { ...manager, isAdmin: manager.isAdmin ?? manager.role === "admin" };
  manager = currentManager;
  authScreen.hidden = true;
  crmApp.hidden = false;
  $("#manager-name").textContent = manager.name || manager.email;
  $("#manager-role").textContent = ROLES[manager.role] || manager.role;
  $("#user-avatar").textContent = initials(manager.name || manager.email);
  // Los coordinadores no ven conversaciones anónimas ni la escucha territorial.
  $$(".nav-item").forEach((item) => { item.hidden = !manager.isAdmin && ADMIN_VIEWS.has(item.dataset.view); });
  if (!manager.isAdmin && ADMIN_VIEWS.has(currentView)) currentView = "overview";
  navigate(currentView);
  refreshBadges();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#login-error");
  error.hidden = true;
  const button = $("button[type=submit]", loginForm);
  try {
    await withBusy(button, "Ingresando…", () => post("/api/crm/login", Object.fromEntries(new FormData(loginForm))));
    loginForm.reset();
    // /me trae el rol vigente y las localidades del usuario.
    showApp((await api("/api/crm/me")).manager);
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#setup-error");
  error.hidden = true;
  const button = $("button[type=submit]", setupForm);
  try {
    await withBusy(button, "Creando…", () => post("/api/crm/setup", Object.fromEntries(new FormData(setupForm))));
    setupForm.reset();
    $$(".auth-logo").forEach((img) => { img.hidden = false; });
    await loadBrand();
    currentView = "settings";
    settingsTab = "start";
    showApp((await api("/api/crm/me")).manager);
    toast("Cuenta creada. Sigue los pasos para dejar todo listo.");
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

$("#logout-button").addEventListener("click", async () => {
  await post("/api/crm/logout").catch(() => {});
  currentManager = null;
  showAuth();
});

/* ---------- Navigation ---------- */

function setSidebar(open) {
  sidebar.classList.toggle("is-open", open);
  scrim.hidden = !open;
}
$("#menu-button").addEventListener("click", () => setSidebar(true));
scrim.addEventListener("click", () => setSidebar(false));

$$(".nav-item").forEach((button) => button.addEventListener("click", () => {
  setSidebar(false);
  navigate(button.dataset.view);
}));

function navigate(name, options = {}) {
  currentView = name;
  if (options.tab) settingsTab = options.tab;
  $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
  viewTitle.textContent = VIEW_TITLES[name] || "";
  searchWrap.hidden = name !== "pipeline";
  loadView();
}

$("#refresh-button").addEventListener("click", () => { loadView(); refreshBadges(); });
leadSearch.addEventListener("input", debounce(() => currentView === "pipeline" && loadPipeline(), 300));

function loadView() {
  const loaders = {
    overview: loadOverview,
    pipeline: loadPipeline,
    territory: loadTerritory,
    followups: loadFollowups,
    inquiries: loadInquiries,
    knowledge: () => loadKnowledge(),
    settings: loadSettings
  };
  return (loaders[currentView] || loadOverview)();
}

function setLoading(text = "Cargando…") {
  view.innerHTML = `<div class="loading">${esc(text)}</div>`;
}

function handleViewError(error) {
  if (error.status === 401) return showAuth();
  view.innerHTML = `<div class="card"><div class="empty"><strong>No se pudo cargar esta sección</strong>${esc(error.message)}</div></div>`;
}

async function refreshBadges() {
  try {
    const summary = (await api("/api/crm/summary")).summary;
    const count = $("#nav-followups-count");
    count.textContent = summary.overdue_followups;
    count.hidden = !Number(summary.overdue_followups);
  } catch { /* ignore */ }
  if (currentManager?.isAdmin) {
    try {
      const { checklist } = await api("/api/crm/integrations");
      $("#nav-setup-dot").hidden = checklist.filter((c) => c.required).every((c) => c.done);
    } catch { /* ignore */ }
  }
}

function wireLeadOpeners(root = view) {
  $$("[data-lead]", root).forEach((el) => el.addEventListener("click", (event) => {
    if (event.target.closest("[data-stop]")) return;
    if (el.dataset.lead) openLead(el.dataset.lead);
  }));
}

/* ---------- Overview ---------- */

function leadPlace(lead) {
  return [lead.zone_name || lead.locality_text, lead.state].filter(Boolean).join(", ") || "Sin localidad";
}

function waLink(phone) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

async function loadOverview() {
  setLoading();
  try {
    const isAdmin = Boolean(currentManager?.isAdmin);
    const [summary, followups, setup] = await Promise.all([
      api("/api/crm/summary"),
      api("/api/crm/followups?status=pending"),
      isAdmin ? api("/api/crm/integrations").catch(() => null) : null
    ]);

    const s = summary.summary;
    const now = new Date();
    const due = followups.followups.slice(0, 8);
    const topics = summary.topics || [];

    const required = setup?.checklist?.filter((c) => c.required) || [];
    const doneCount = required.filter((c) => c.done).length;
    const showSetup = isAdmin && required.length && doneCount < required.length;
    const zonesLabel = !isAdmin && currentManager?.zones?.length
      ? currentManager.zones.map((z) => `${z.name} (${z.state})`).join(", ")
      : "";

    view.innerHTML = `
      ${showSetup ? `
        <div class="card setup-banner">
          <div class="setup-banner-copy">
            <strong>Termina de configurar el panel</strong>
            <span>${doneCount} de ${required.length} pasos listos. Faltan: ${required.filter((c) => !c.done).map((c) => c.label.toLowerCase()).join(", ")}.</span>
            <div class="progress"><i style="width:${Math.round((doneCount / required.length) * 100)}%"></i></div>
          </div>
          <button class="btn btn-primary" data-go="settings">Continuar</button>
        </div>` : ""}

      ${!isAdmin ? `
        <div class="card setup-banner">
          <div class="setup-banner-copy">
            <strong>Tus localidades</strong>
            <span>${zonesLabel ? esc(zonesLabel) : "Todavía no tienes localidades asignadas. Pídeselo al administrador."}</span>
          </div>
        </div>` : ""}

      <div class="stats">
        ${isAdmin ? `<button class="card stat stat-link" data-go="inquiries"><span>Conversaciones (30 días)</span><strong>${s.conversations_30d ?? 0}</strong></button>` : ""}
        <button class="card stat stat-link" data-go="pipeline"><span>Contactos nuevos (30 días)</span><strong>${s.leads_30d ?? 0}</strong></button>
        <button class="card stat stat-link ${Number(s.leads_new) ? "is-alert" : ""}" data-go-status="new"><span>Sin llamar todavía</span><strong>${s.leads_new ?? 0}</strong></button>
        ${isAdmin ? `<button class="card stat stat-link ${Number(s.unassigned_new) ? "is-alert" : ""}" data-go-unassigned><span>Sin coordinador</span><strong>${s.unassigned_new ?? 0}</strong></button>` : ""}
        <div class="card stat"><span>Se sumaron</span><strong>${s.leads_joined ?? 0}</strong></div>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Pendientes de contactar</h2><button class="btn btn-ghost btn-sm" data-go="followups">Ver todos</button></div>
          <div class="list">
            ${due.length ? due.map((f) => {
              const overdue = new Date(f.due_at) < now;
              return `
              <button class="list-row" data-lead="${esc(f.lead_id || "")}">
                <span class="list-row-main"><strong>${esc(f.full_name || "Sin nombre")}</strong><span>${esc(leadPlace(f))}</span></span>
                <span class="list-row-aside"><span class="pill ${overdue ? "pill-danger" : ""}">${esc(relativeDue(f.due_at))}</span></span>
              </button>`;
            }).join("") : '<div class="empty">Sin pendientes. ¡Bien!</div>'}
          </div>
        </section>

        ${isAdmin ? `
        <section class="card">
          <div class="card-head"><div><h2>De qué habla la gente</h2><p>Temas de los contactos de los últimos 90 días.</p></div><button class="btn btn-ghost btn-sm" data-go="territory">Escucha territorial</button></div>
          <div class="list">
            ${topics.length ? topics.map((t) => `
              <div class="list-row">
                <span class="list-row-main"><strong>${esc(cap(t.topic))}</strong></span>
                <span class="list-row-aside"><span class="pill">${esc(t.count)}</span></span>
              </div>`).join("") : '<div class="empty">Todavía no hay temas. Aparecen cuando la gente deja sus datos.</div>'}
          </div>
        </section>` : ""}
      </div>
    `;

    wireLeadOpeners();
    $$("[data-go]", view).forEach((btn) => btn.addEventListener("click", () => navigate(btn.dataset.go)));
    $("[data-go-status]", view)?.addEventListener("click", () => { pipelineFilters = { ...pipelineFilters, status: "new", unassigned: "" }; navigate("pipeline"); });
    $("[data-go-unassigned]", view)?.addEventListener("click", () => { pipelineFilters = { ...pipelineFilters, status: "", unassigned: "1" }; navigate("pipeline"); });
  } catch (error) {
    handleViewError(error);
  }
}

/* ---------- Contactos ---------- */

let pipelineFilters = { status: "", state: "", zone: "", unassigned: "" };
let zonesCache = null;

async function getZones(force = false) {
  if (!zonesCache || force) zonesCache = await api("/api/crm/zones");
  return zonesCache;
}

function cap(text) { return String(text || "").replace(/^./, (c) => c.toUpperCase()); }

async function loadPipeline() {
  if (!view.querySelector(".contacts-list")) setLoading("Cargando contactos…");
  try {
    const isAdmin = Boolean(currentManager?.isAdmin);
    const params = new URLSearchParams();
    const search = leadSearch.value.trim();
    if (search) params.set("search", search);
    Object.entries(pipelineFilters).forEach(([k, v]) => { if (v) params.set(k, v); });
    const [data, zoneData] = await Promise.all([api(`/api/crm/leads?${params}`), getZones()]);
    const zones = zoneData.zones || [];
    const states = isAdmin ? zoneData.states : [...new Set(zones.map((z) => z.state))];
    const zoneOptions = zones.filter((z) => !pipelineFilters.state || z.state === pipelineFilters.state);

    view.innerHTML = `
      <div class="toolbar contacts-toolbar">
        <select id="f-status" aria-label="Estado del seguimiento">
          <option value="">Todos</option>
          ${STAGES.map(([k, label]) => `<option value="${k}" ${pipelineFilters.status === k ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <select id="f-state" aria-label="Estado"><option value="">Todos los estados</option>${states.map((st) => `<option ${pipelineFilters.state === st ? "selected" : ""}>${esc(st)}</option>`).join("")}</select>
        <select id="f-zone" aria-label="Localidad"><option value="">Todas las localidades</option>${zoneOptions.map((z) => `<option value="${esc(z.id)}" ${pipelineFilters.zone === z.id ? "selected" : ""}>${esc(z.name)}${pipelineFilters.state ? "" : ` (${esc(z.state)})`}</option>`).join("")}</select>
        ${isAdmin ? `<label class="check-row"><input type="checkbox" id="f-unassigned" ${pipelineFilters.unassigned ? "checked" : ""}>Solo sin coordinador</label>` : ""}
      </div>
      <section class="card contacts-list">
        <div class="card-head"><div><h2>${data.leads.length} contacto${data.leads.length === 1 ? "" : "s"}</h2><p>Personas que pidieron que las contacte el coordinador de su zona.</p></div></div>
        <div class="list">
          ${data.leads.length ? data.leads.map((lead) => {
            const wa = waLink(lead.phone);
            return `
            <div class="list-row contact-row">
              <button class="list-row-main contact-open" data-lead="${esc(lead.id)}">
                <strong>${esc(lead.full_name || "Sin nombre")}</strong>
                <span>${esc(leadPlace(lead))} · ${esc(relativeDue(lead.created_at))}${isAdmin && lead.coordinators ? ` · ${esc(lead.coordinators)}` : ""}${isAdmin && !lead.coordinators ? " · sin coordinador" : ""}</span>
                ${lead.ai_primary_concern ? `<span class="contact-concern">${icon("sparkle")}${esc(lead.ai_primary_concern)}</span>` : ""}
              </button>
              <span class="list-row-aside contact-actions-inline">
                <span class="pill ${STAGE_TONE[lead.status] || ""}">${esc(STAGE_LABEL[lead.status] || lead.status)}</span>
                ${lead.ai_topic ? `<span class="pill">${esc(cap(lead.ai_topic))}</span>` : ""}
                ${wa ? `<a class="icon-btn" href="${esc(wa)}" target="_blank" rel="noreferrer" title="WhatsApp" aria-label="WhatsApp" data-stop>${icon("whatsapp")}</a>` : ""}
                ${lead.phone ? `<a class="icon-btn" href="tel:${esc(lead.phone)}" title="Llamar" aria-label="Llamar" data-stop>${icon("phone")}</a>` : ""}
              </span>
            </div>`;
          }).join("") : '<div class="empty"><strong>Sin contactos</strong>Cuando alguien deje su teléfono en el chat, aparece aquí.</div>'}
        </div>
      </section>`;

    $("#f-status", view).addEventListener("change", (e) => { pipelineFilters.status = e.target.value; loadPipeline(); });
    $("#f-state", view).addEventListener("change", (e) => { pipelineFilters.state = e.target.value; pipelineFilters.zone = ""; loadPipeline(); });
    $("#f-zone", view).addEventListener("change", (e) => { pipelineFilters.zone = e.target.value; loadPipeline(); });
    $("#f-unassigned", view)?.addEventListener("change", (e) => { pipelineFilters.unassigned = e.target.checked ? "1" : ""; loadPipeline(); });
    wireLeadOpeners();
  } catch (error) {
    handleViewError(error);
  }
}

/* ---------- Escucha territorial (solo administrador) ---------- */

let territoryState = "";
let territoryZone = "";

async function loadTerritory() {
  setLoading("Cargando…");
  try {
    const data = await api("/api/crm/territory");
    const states = data.states || [];
    const selected = states.find((s) => s.state === territoryState) || null;

    view.innerHTML = `
      <div class="grid-2 territory">
        <section class="card">
          <div class="card-head"><div><h2>Por estado</h2><p>Últimos ${esc(data.days)} días. Toca un estado para ver qué dice la gente.</p></div></div>
          <div class="list">
            ${states.length ? states.map((s) => `
              <button class="list-row ${s.state === territoryState ? "is-active" : ""}" data-state="${esc(s.state)}">
                <span class="list-row-main">
                  <strong>${esc(s.state)}</strong>
                  <span>${s.topics.length ? s.topics.map((t) => esc(cap(t.topic))).join(" · ") : "Sin temas todavía"}</span>
                </span>
                <span class="list-row-aside">
                  <span class="pill" title="Conversaciones">${icon("chat")}${esc(s.conversations)}</span>
                  <span class="pill ${s.leads_new ? "pill-warning" : ""}" title="Contactos">${icon("phone")}${esc(s.leads)}</span>
                </span>
              </button>`).join("") : '<div class="empty"><strong>Todavía no hay datos</strong>Aparecen cuando la gente indica su localidad en el chat.</div>'}
          </div>
        </section>

        <section class="card" id="territory-detail">
          ${selected ? `
            <div class="card-head">
              <div><h2>${esc(selected.state)}</h2><p>${esc(selected.conversations)} conversaciones · ${esc(selected.leads)} contactos</p></div>
              <button id="territory-summary" class="btn btn-primary btn-sm">${icon("sparkle")}Resumir con IA</button>
            </div>
            <div class="card-body">
              <div class="chip-group">
                <button class="chip ${territoryZone === "" ? "is-active" : ""}" data-zone="">Todo el estado</button>
                ${selected.zones.map((z) => `<button class="chip ${territoryZone === z.id ? "is-active" : ""}" data-zone="${esc(z.id)}">${esc(z.name)} · ${esc(z.conversations)}</button>`).join("")}
              </div>
              <div id="territory-report"></div>
              <h3 class="section-title">Lo que escribe la gente</h3>
              <div id="territory-messages" class="quote-list"><div class="loading">Cargando…</div></div>
            </div>` : '<div class="empty"><strong>Elige un estado</strong>Vas a ver los mensajes de la gente y un resumen con IA de lo que más preocupa.</div>'}
        </section>
      </div>`;

    $$("[data-state]", view).forEach((btn) => btn.addEventListener("click", () => {
      territoryState = btn.dataset.state;
      territoryZone = "";
      loadTerritory();
    }));
    if (!selected) return;

    $$("[data-zone]", view).forEach((btn) => btn.addEventListener("click", () => {
      territoryZone = btn.dataset.zone;
      $$("[data-zone]", view).forEach((b) => b.classList.toggle("is-active", b === btn));
      $("#territory-report").innerHTML = "";
      loadTerritoryMessages();
    }));
    $("#territory-summary").addEventListener("click", async (event) => {
      const box = $("#territory-report");
      try {
        const data = await withBusy(event.currentTarget, "Resumiendo…", () =>
          post("/api/crm/territory", { state: territoryState, zone: territoryZone }));
        if (!data.report) { box.innerHTML = `<p class="muted">${esc(data.message || "Sin datos suficientes.")}</p>`; return; }
        const r = data.report;
        box.innerHTML = `
          <div class="callout report">
            <strong>Resumen · ${esc(r.where)} · ${esc(r.messages)} mensajes</strong>
            <p>${esc(r.summary)}</p>
            ${r.concerns.length ? `<ul class="concerns">${r.concerns.map((c) => `<li><span class="pill ${c.share === "alta" ? "pill-danger" : c.share === "media" ? "pill-warning" : ""}">${esc(cap(c.topic))}</span> ${esc(c.description)}</li>`).join("")}</ul>` : ""}
            ${r.unanswered.length ? `<p class="muted small"><strong>Conviene agregar a la base de conocimiento:</strong> ${r.unanswered.map(esc).join(" · ")}</p>` : ""}
          </div>`;
      } catch (error) { toast(error.message, { error: true }); }
    });
    loadTerritoryMessages();
  } catch (error) {
    handleViewError(error);
  }
}

async function loadTerritoryMessages() {
  const box = $("#territory-messages");
  if (!box) return;
  box.innerHTML = '<div class="loading">Cargando…</div>';
  try {
    const params = new URLSearchParams({ state: territoryState });
    if (territoryZone) params.set("zone", territoryZone);
    const data = await api(`/api/crm/territory?${params}`);
    box.innerHTML = data.messages.length
      ? data.messages.slice(0, 120).map((m) => `
          <blockquote class="quote">
            <p>${esc(m.content)}</p>
            <small>${esc([m.zone_name || m.locality_text, fmtDate(m.created_at, { day: "numeric", month: "short" })].filter(Boolean).join(" · "))}</small>
          </blockquote>`).join("")
      : '<p class="muted">Sin mensajes en esta localidad.</p>';
  } catch (error) {
    box.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
  }
}

/* ---------- Pendientes ---------- */

async function loadFollowups() {
  setLoading("Cargando pendientes…");
  try {
    const data = await api("/api/crm/followups?status=pending");
    const now = new Date();
    view.innerHTML = `
      <section class="card">
        <div class="list">
          ${data.followups.length ? data.followups.map((f) => {
            const overdue = new Date(f.due_at) < now;
            return `
            <div class="list-row is-link" data-lead="${esc(f.lead_id || "")}">
              <span class="list-row-main"><strong>${esc(f.title)}</strong><span>${esc(leadPlace(f))}${f.phone ? ` · ${esc(f.phone)}` : ""}</span></span>
              <span class="list-row-aside">
                <span class="pill ${overdue ? "pill-danger" : ""}">${overdue ? "Vencido " : "Vence "}${esc(relativeDue(f.due_at))}</span>
                <button class="btn btn-success btn-sm" data-stop data-followup="${esc(f.id)}">${icon("check")}Hecho</button>
              </span>
            </div>`;
          }).join("") : '<div class="empty"><strong>Estás al día</strong>No hay contactos pendientes.</div>'}
        </div>
      </section>`;

    wireLeadOpeners();
    $$("[data-followup]", view).forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await post("/api/crm/followups", { action: "complete", id: btn.dataset.followup });
        toast("Marcado como hecho.");
        loadFollowups();
        refreshBadges();
      } catch (error) { toast(error.message, { error: true }); }
    }));
  } catch (error) {
    handleViewError(error);
  }
}

/* ---------- Conversations (solo administrador) ---------- */

let inquiryState = "";

async function loadInquiries() {
  setLoading("Cargando conversaciones…");
  try {
    const [data, zoneData] = await Promise.all([
      api(`/api/crm/inquiries${inquiryState ? `?state=${encodeURIComponent(inquiryState)}` : ""}`),
      getZones()
    ]);
    view.innerHTML = `
      <div class="toolbar">
        <select id="inq-state" aria-label="Estado"><option value="">Todos los estados</option>${zoneData.states.map((s) => `<option ${s === inquiryState ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <span class="muted small">Incluye a quienes no dejaron sus datos. Se borran a los 90 días sin actividad.</span>
      </div>
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Última actividad</th><th>Localidad</th><th>Contacto</th><th>Último mensaje</th><th class="num">Mensajes</th></tr></thead>
            <tbody>
              ${data.inquiries.map((i) => `
                <tr class="is-link" ${i.lead_id ? `data-lead="${esc(i.lead_id)}"` : `data-conversation="${esc(i.id)}"`}>
                  <td>${esc(fmtDate(i.last_message_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }))}</td>
                  <td>${esc([i.zone_name || i.locality_text, i.state].filter(Boolean).join(", ") || "—")}</td>
                  <td>${esc(i.full_name || "Anónimo")}</td>
                  <td class="clip">${esc(i.last_user_message || "—")}</td>
                  <td class="num">${esc(i.user_messages)}</td>
                </tr>`).join("") || '<tr><td colspan="5"><div class="empty">Todavía no hay conversaciones.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </section>`;
    $("#inq-state", view).addEventListener("change", (e) => { inquiryState = e.target.value; loadInquiries(); });
    wireLeadOpeners();
    $$("[data-conversation]", view).forEach((row) => row.addEventListener("click", async () => {
      try {
        const res = await api(`/api/crm/inquiries?id=${encodeURIComponent(row.dataset.conversation)}`);
        const body = openDialog(`
          <div class="card-head"><h2>Conversación anónima</h2><button class="icon-btn" data-close aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
          <div class="card-body"><div class="chat-log">${res.messages.map((m) => `<div class="chat-bubble ${m.role === "user" ? "is-user" : "is-bot"}">${esc(m.content)}</div>`).join("")}</div></div>`, { wide: true });
        $("[data-close]", body).addEventListener("click", closeDialog);
      } catch (error) { toast(error.message, { error: true }); }
    }));
  } catch (error) {
    handleViewError(error);
  }
}

/* ---------- Knowledge ---------- */

async function loadKnowledge(editId = null) {
  setLoading("Cargando información…");
  try {
    const data = await api("/api/crm/knowledge");
    const categories = data.categories || [];
    const items = data.items || [];
    const canEdit = Boolean(currentManager?.isAdmin);
    const statusLabel = { active: ["Activo", "pill-success"], draft: ["Borrador", "pill-warning"], archived: ["Archivado", ""] };

    view.innerHTML = `
      <div class="kb-layout">
        <section class="card">
          <div class="card-head">
            <div><h2>Información para el asistente</h2><p>El chat responde usando solo el contenido activo de esta lista.</p></div>
            ${canEdit ? `<button id="new-knowledge-item" class="btn btn-primary">${icon("plus")}Agregar</button>` : ""}
          </div>
          <div class="toolbar">
            <input id="knowledge-search" type="search" placeholder="Buscar">
            <select id="knowledge-category-filter"><option value="">Todas las categorías</option>${categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.item_count)})</option>`).join("")}</select>
            <select id="knowledge-status-filter"><option value="">Todos los estados</option><option value="active">Activo</option><option value="draft">Borrador</option><option value="archived">Archivado</option></select>
          </div>
          <div id="knowledge-list">
            ${items.map((item) => {
              const [label, tone] = statusLabel[item.status] || [item.status, ""];
              return `
              <article class="kb-item" data-kb-item="${esc(item.id)}" data-category="${esc(item.category_id || "")}" data-status="${esc(item.status)}"
                data-search="${esc([item.title, item.summary, item.content, item.category_name, (item.tags || []).join(" ")].filter(Boolean).join(" ").toLowerCase())}">
                <div class="kb-item-head">
                  <div><small>${esc(item.category_name || "Sin categoría")}</small><h3>${esc(item.title)}</h3></div>
                  <span class="pill ${tone}">${label}</span>
                </div>
                <p>${esc(item.summary || String(item.content || "").slice(0, 240))}</p>
                ${item.tags?.length ? `<div class="tags">${item.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
                <div class="kb-item-foot">
                  <span>Actualizado ${esc(fmtDate(item.updated_at, { dateStyle: "medium" }))}</span>
                  ${canEdit ? `<span class="form-actions">
                    <button class="btn btn-ghost btn-sm" data-kb-edit="${esc(item.id)}">Editar</button>
                    <button class="btn btn-ghost btn-sm" data-kb-toggle="${esc(item.id)}" data-kb-status="${esc(item.status)}">${item.status === "archived" ? "Restaurar" : "Archivar"}</button>
                  </span>` : ""}
                </div>
              </article>`;
            }).join("") || '<div class="empty"><strong>Todavía no hay información</strong>Agrega biografía, propuestas, posturas y todo lo que la gente suele preguntar.</div>'}
          </div>
        </section>

        <aside style="display:grid;gap:20px">
          <section class="card">
            <div class="card-head"><h2>Cómo funciona</h2></div>
            <div class="card-body">
              <ol class="steps">
                <li>Cargas información clara y actualizada, redactada como quieres que se responda.</li>
                <li>Ante cada consulta, el asistente busca los fragmentos relacionados.</li>
                <li>La IA responde solo con esos datos. Si algo no está, no lo inventa: ofrece que el coordinador responda.</li>
                <li>Si archivas o editas algo, cambia en las próximas respuestas.</li>
              </ol>
            </div>
          </section>
          ${canEdit ? `
          <section class="card">
            <div class="card-head"><h2>Categorías</h2></div>
            <div class="card-body">
              <div class="tags">${categories.map((c) => `<span class="tag">${esc(c.name)} · ${esc(c.item_count)}</span>`).join("") || '<span class="muted small">Sin categorías</span>'}</div>
              <form id="category-form" style="display:grid;gap:10px">
                <label class="field"><span>Nueva categoría</span><input name="name" required maxlength="160" placeholder="Ej. Propuestas para Caracas"></label>
                <label class="field"><span>Descripción</span><input name="description" maxlength="400"></label>
                <button class="btn btn-secondary" type="submit">Agregar categoría</button>
              </form>
            </div>
          </section>` : ""}
        </aside>
      </div>`;

    const filter = () => {
      const q = ($("#knowledge-search").value || "").trim().toLowerCase();
      const cat = $("#knowledge-category-filter").value;
      const st = $("#knowledge-status-filter").value;
      $$("[data-kb-item]", view).forEach((card) => {
        card.hidden = !((!q || card.dataset.search.includes(q)) && (!cat || card.dataset.category === cat) && (!st || card.dataset.status === st));
      });
    };
    $("#knowledge-search").addEventListener("input", filter);
    $("#knowledge-category-filter").addEventListener("change", filter);
    $("#knowledge-status-filter").addEventListener("change", filter);

    if (!canEdit) return;

    $("#new-knowledge-item").addEventListener("click", () => openKnowledgeEditor(null, categories));
    $$("[data-kb-edit]", view).forEach((btn) => btn.addEventListener("click", () => {
      openKnowledgeEditor(items.find((i) => i.id === btn.dataset.kbEdit), categories);
    }));
    $$("[data-kb-toggle]", view).forEach((btn) => btn.addEventListener("click", async () => {
      const archived = btn.dataset.kbStatus === "archived";
      try {
        await post("/api/crm/knowledge", { action: archived ? "restore-item" : "archive-item", id: btn.dataset.kbToggle });
        toast(archived ? "Información restaurada." : "Información archivada.");
        loadKnowledge();
      } catch (error) { toast(error.message, { error: true }); }
    }));
    $("#category-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await post("/api/crm/knowledge", { action: "save-category", ...Object.fromEntries(new FormData(event.currentTarget)) });
        toast("Categoría agregada.");
        loadKnowledge();
      } catch (error) { toast(error.message, { error: true }); }
    });

    if (editId) openKnowledgeEditor(items.find((i) => i.id === editId), categories);
  } catch (error) {
    handleViewError(error);
  }
}

function openKnowledgeEditor(item, categories) {
  const body = openDialog(`
    <div class="card-head"><h2>${item ? "Editar información" : "Nueva información"}</h2><button class="icon-btn" data-close aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <form id="knowledge-item-form" class="card-body">
      <input type="hidden" name="id" value="${esc(item?.id || "")}">
      <div class="form-grid">
        <label class="field"><span>Título</span><input name="title" required maxlength="260" value="${esc(item?.title || "")}" placeholder="Ej. Propuesta sobre servicios públicos"></label>
        <label class="field"><span>Categoría</span><select name="categoryId"><option value="">Sin categoría</option>${categories.map((c) => `<option value="${esc(c.id)}" ${item?.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <label class="field span-2"><span>Resumen interno</span><input name="summary" maxlength="1200" value="${esc(item?.summary || "")}" placeholder="Una línea para reconocerlo en la lista"></label>
        <label class="field span-2"><span>Información completa</span><textarea name="content" rows="9" required maxlength="20000" placeholder="Escríbela como fuente oficial. El asistente la redacta para cada persona.">${esc(item?.content || "")}</textarea></label>
        <label class="field span-2"><span>Etiquetas</span><input name="tags" value="${esc((item?.tags || []).join(", "))}" placeholder="agua, luz, servicios"><small>Separadas por coma. Ayudan a encontrar el contenido.</small></label>
        <label class="field"><span>Estado</span><select name="status">
          <option value="active" ${!item || item.status === "active" ? "selected" : ""}>Activo</option>
          <option value="draft" ${item?.status === "draft" ? "selected" : ""}>Borrador</option>
          <option value="archived" ${item?.status === "archived" ? "selected" : ""}>Archivado</option>
        </select></label>
        <label class="field"><span>Prioridad</span><input name="priority" type="number" min="0" max="1000" value="${esc(item?.priority ?? 0)}"><small>Mayor número, más peso en las respuestas.</small></label>
        <label class="field"><span>Válido desde</span><input name="validFrom" type="date" value="${item?.valid_from ? esc(String(item.valid_from).slice(0, 10)) : ""}"></label>
        <label class="field"><span>Válido hasta</span><input name="validUntil" type="date" value="${item?.valid_until ? esc(String(item.valid_until).slice(0, 10)) : ""}"></label>
      </div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
    </form>`, { wide: true });

  $$("[data-close]", body).forEach((b) => b.addEventListener("click", closeDialog));
  $("#knowledge-item-form", body).addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await withBusy($("button[type=submit]", body), "Guardando…", () =>
        post("/api/crm/knowledge", { action: "save-item", ...payload, priority: Number(payload.priority || 0) }));
      closeDialog();
      toast("Información guardada.");
      loadKnowledge();
    } catch (error) { toast(error.message, { error: true }); }
  });
}

/* ---------- Lead drawer ---------- */

$("#close-lead").addEventListener("click", () => { leadModal.hidden = true; });
leadModal.addEventListener("click", (event) => { if (event.target === leadModal) leadModal.hidden = true; });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!dialog.hidden) closeDialog();
  else if (!leadModal.hidden) leadModal.hidden = true;
  else setSidebar(false);
});

async function openLead(id) {
  leadModal.hidden = false;
  leadDetail.innerHTML = '<div class="loading">Cargando ficha…</div>';
  try {
    const isAdmin = Boolean(currentManager?.isAdmin);
    const [data, zoneData] = await Promise.all([
      api(`/api/crm/lead?id=${encodeURIComponent(id)}`),
      isAdmin ? getZones() : null
    ]);
    const l = data.lead;
    const messages = data.conversations.flatMap((c) => c.messages || []);
    const name = l.full_name || "Sin nombre";
    const wa = waLink(l.phone);
    $("#drawer-title").textContent = STAGE_LABEL[l.status] || "Contacto";

    leadDetail.innerHTML = `
      <section class="card card-body">
        <div class="lead-hero">
          <span class="avatar-initials">${esc(initials(name))}</span>
          <div><h3>${esc(name)}</h3><p>${esc(leadPlace(l))}</p></div>
        </div>
        <div class="contact-actions">
          ${l.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${esc(l.phone)}">${icon("phone")}Llamar</a>` : ""}
          ${wa ? `<a class="btn btn-secondary btn-sm" href="${esc(wa)}" target="_blank" rel="noreferrer">${icon("whatsapp")}WhatsApp</a>` : ""}
          ${l.phone ? `<span class="copy-value">${esc(l.phone)}</span>` : ""}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Antes de llamar</h2><p>Resumen interno de la IA. No se muestra a la persona.</p></div><button id="analyze-lead" class="btn btn-secondary btn-sm">${icon("sparkle")}${l.ai_analyzed_at ? "Actualizar" : "Analizar"}</button></div>
        <div class="card-body">
          ${l.ai_summary ? `
          <dl class="facts">
            <dt>Tema</dt><dd>${esc(cap(l.ai_topic) || "—")}</dd>
            <dt>Qué contó</dt><dd>${esc(l.ai_summary)}</dd>
            <dt>Principal preocupación</dt><dd>${esc(l.ai_primary_concern || "—")}</dd>
            <dt>Qué conviene decir</dt><dd>${esc(l.ai_next_action || "—")}</dd>
          </dl>` : '<p class="muted">Todavía no hay resumen. Usa “Analizar” para generarlo a partir de la conversación.</p>'}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Seguimiento</h2></div>
        <div class="card-body">
          <div class="form-grid">
            <label class="field"><span>Estado</span><select id="lead-status">${STAGES.map(([k, label]) => `<option value="${k}" ${k === l.status ? "selected" : ""}>${label}</option>`).join("")}</select></label>
            <label class="field"><span>Próxima acción</span><input id="lead-next-action" type="datetime-local" value="${esc(toLocalInput(l.next_action_at))}"></label>
            ${isAdmin ? `<label class="field span-2"><span>Localidad</span><select id="lead-zone">
              <option value="">${esc(l.locality_text ? `Otra: ${l.locality_text}` : "Sin localidad de la lista")}${l.state && !l.zone_id ? ` (${esc(l.state)})` : ""}</option>
              ${(zoneData?.zones || []).filter((z) => z.active).map((z) => `<option value="${esc(z.id)}" ${z.id === l.zone_id ? "selected" : ""}>${esc(z.name)} (${esc(z.state)})</option>`).join("")}
            </select><small>Al cambiarla, el contacto pasa a los coordinadores de esa localidad.</small></label>` : ""}
            <label class="field span-2"><span>Notas internas</span><textarea id="lead-notes" rows="3" placeholder="Qué hablaron, en qué quedaron…">${esc(l.notes || "")}</textarea></label>
          </div>
          <div class="form-actions"><button id="save-lead" class="btn btn-primary">Guardar cambios</button></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Recordatorios</h2></div>
        <div class="card-body">
          <div class="timeline">
            ${data.followups.map((f) => `<div class="timeline-item"><time>${esc(fmtDate(f.due_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }))}</time><span>${esc(f.title)} · ${f.status === "pending" ? "pendiente" : "hecho"}</span></div>`).join("") || '<p class="muted">Sin recordatorios.</p>'}
          </div>
          <div class="form-grid">
            <label class="field"><span>Nuevo recordatorio</span><input id="followup-title" placeholder="Ej. Volver a llamar el lunes"></label>
            <label class="field"><span>Fecha</span><input id="followup-date" type="datetime-local"></label>
          </div>
          <div class="form-actions"><button id="create-followup" class="btn btn-secondary">Agregar recordatorio</button></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Conversación</h2><p>Se borra sola a los 90 días sin actividad.</p></div></div>
        <div class="card-body">
          ${messages.length ? `<div class="chat-log">${messages.map((m) => `<div class="chat-bubble ${m.role === "user" ? "is-user" : "is-bot"}">${esc(m.content)}</div>`).join("")}</div>` : '<p class="muted">No hay mensajes guardados.</p>'}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Actividad</h2></div>
        <div class="card-body">
          <dl class="facts">
            <dt>Cómo llegó</dt><dd>${esc(CAPTURE_LABEL[l.source] || "Chat")}</dd>
            <dt>Campaña</dt><dd>${esc([l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(" / ") || "—")}</dd>
            <dt>Autorizó el contacto</dt><dd>${esc(l.privacy_consent_at ? fmtDate(l.privacy_consent_at) : "No (escribió su teléfono en el chat)")}</dd>
          </dl>
          <div class="timeline">
            ${data.activities.map((a) => `<div class="timeline-item"><time>${esc(fmtDate(a.created_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }))}</time><span>${esc(a.description)}${a.manager_name ? ` · ${esc(a.manager_name)}` : ""}</span></div>`).join("") || '<p class="muted">Sin actividad registrada.</p>'}
          </div>
        </div>
      </section>`;

    const log = $(".chat-log", leadDetail);
    if (log) log.scrollTop = log.scrollHeight;

    $("#analyze-lead")?.addEventListener("click", async (event) => {
      try {
        await withBusy(event.currentTarget, "Analizando…", () => post("/api/crm/analyze-lead", { id: l.id }));
        openLead(l.id);
      } catch (error) { toast(error.message, { error: true }); }
    });

    $("#save-lead")?.addEventListener("click", async (event) => {
      const next = $("#lead-next-action").value;
      const payload = {
        id: l.id,
        status: $("#lead-status").value,
        notes: $("#lead-notes").value,
        nextActionAt: next ? new Date(next).toISOString() : null
      };
      const zoneSelect = $("#lead-zone");
      if (zoneSelect && zoneSelect.value !== (l.zone_id || "")) payload.zoneId = zoneSelect.value || null;
      try {
        await withBusy(event.currentTarget, "Guardando…", () => post("/api/crm/lead-update", payload));
        toast("Cambios guardados.");
        leadModal.hidden = true;
        loadView();
        refreshBadges();
      } catch (error) { toast(error.message, { error: true }); }
    });

    $("#create-followup")?.addEventListener("click", async () => {
      const title = $("#followup-title").value.trim();
      const due = $("#followup-date").value;
      if (!title || !due) return toast("Completa el recordatorio y la fecha.", { error: true });
      try {
        await post("/api/crm/followups", { action: "create", leadId: l.id, title, dueAt: new Date(due).toISOString() });
        toast("Recordatorio agregado.");
        openLead(l.id);
        refreshBadges();
      } catch (error) { toast(error.message, { error: true }); }
    });
  } catch (error) {
    leadDetail.innerHTML = `<div class="card"><div class="empty">${esc(error.message)}</div></div>`;
  }
}

/* ---------- Settings ---------- */

const SETTINGS_TABS = [
  ["start", "Primeros pasos"],
  ["business", "Perfil"],
  ["zones", "Localidades"],
  ["capture", "Captación y privacidad"],
  ["integrations", "Integraciones"],
  ["team", "Equipo"],
  ["account", "Mi cuenta"]
];

async function loadSettings() {
  const isAdmin = Boolean(currentManager?.isAdmin);
  const tabs = SETTINGS_TABS.filter(([id]) => isAdmin || id === "account");
  if (!tabs.some(([id]) => id === settingsTab)) settingsTab = tabs[0][0];

  view.innerHTML = `
    <div class="settings">
      <nav class="settings-nav" aria-label="Secciones de configuración">
        ${tabs.map(([id, label]) => `<button data-tab="${id}" class="${id === settingsTab ? "is-active" : ""}">${label}${id === "start" ? '<span class="nav-dot" id="start-dot" hidden></span>' : ""}</button>`).join("")}
      </nav>
      <div id="settings-panel" class="settings-panel"><div class="loading">Cargando…</div></div>
    </div>`;

  $$(".settings-nav button", view).forEach((btn) => btn.addEventListener("click", () => {
    settingsTab = btn.dataset.tab;
    $$(".settings-nav button", view).forEach((b) => b.classList.toggle("is-active", b === btn));
    renderSettingsTab();
  }));

  renderSettingsTab();
}

async function renderSettingsTab() {
  const panel = $("#settings-panel");
  if (!panel) return;
  panel.innerHTML = '<div class="loading">Cargando…</div>';
  try {
    const renderers = {
      start: renderStartTab,
      business: renderBusinessTab,
      zones: renderZonesTab,
      capture: renderCaptureTab,
      integrations: renderIntegrationsTab,
      team: renderTeamTab,
      account: renderAccountTab
    };
    await renderers[settingsTab](panel);
  } catch (error) {
    if (error.status === 401) return showAuth();
    panel.innerHTML = `<div class="card"><div class="empty"><strong>No se pudo cargar</strong>${esc(error.message)}</div></div>`;
  }
}

async function getSettings(force = false) {
  if (!settingsCache || force) settingsCache = (await api("/api/crm/settings")).settings;
  return settingsCache;
}

async function saveSettings(patch) {
  const current = await getSettings(true);
  await post("/api/crm/settings", { profile: { ...(current.profile || {}), ...(patch.profile || {}) } });
  settingsCache = null;
}

/* Primeros pasos */
async function renderStartTab(panel) {
  const { checklist } = await api("/api/crm/integrations");
  const required = checklist.filter((c) => c.required);
  const done = required.filter((c) => c.done).length;
  const allDone = done === required.length;
  $("#start-dot") && ($("#start-dot").hidden = allDone);

  panel.innerHTML = `
    <section class="card">
      <div class="card-head">
        <div><h2>${allDone ? "Todo listo" : "Deja el panel funcionando"}</h2>
        <p>${allDone ? "El asistente está respondiendo y los contactos llegan a cada coordinador." : `${done} de ${required.length} pasos obligatorios completos.`}</p></div>
      </div>
      <div class="checklist">
        ${checklist.map((c) => `
          <div class="check-item ${c.done ? "is-done" : ""}">
            <span class="check-icon">${icon("check")}</span>
            <span class="list-row-main"><strong>${esc(c.label)}</strong>${c.required ? "" : "<span>Opcional</span>"}</span>
            ${!c.done && c.target ? `<button class="btn ${c.required ? "btn-secondary" : "btn-ghost"} btn-sm" data-target="${c.target}">Configurar</button>` : ""}
          </div>`).join("")}
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Enlaces para compartir</h2></div>
      <div class="card-body">
        <div class="field"><span class="field-label">Chat público</span>
          <div class="form-actions" style="justify-content:flex-start">
            <span class="copy-value">${esc(location.origin)}/</span>
            <button class="btn btn-ghost btn-sm" data-copy="${esc(location.origin)}/">${icon("copy")}Copiar</button>
          </div>
          <small>Ponlo en tu bio de Instagram, en tus estados y grupos de WhatsApp, al final de tus columnas o en un código QR para las jornadas casa por casa.</small>
        </div>
      </div>
    </section>`;

  $$("[data-target]", panel).forEach((btn) => btn.addEventListener("click", () => {
    if (btn.dataset.target === "knowledge") return navigate("knowledge");
    settingsTab = btn.dataset.target;
    loadSettings();
  }));
  $$("[data-copy]", panel).forEach((btn) => btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy)));
}

/* Negocio */
async function renderBusinessTab(panel) {
  const settings = await getSettings(true);
  const p = settings.profile || {};
  const editable = Boolean(currentManager?.isAdmin);
  const dis = editable ? "" : "disabled";
  const days = p.weekdays || [1, 2, 3, 4, 5];

  panel.innerHTML = `
    <form id="business-form" style="display:grid;gap:20px">
      <section class="card">
        <div class="card-head"><div><h2>Identidad</h2><p>Se muestra en el encabezado del chat y en la ficha del perfil.</p></div></div>
        <div class="card-body form-grid">
          <label class="field"><span>Nombre</span><input name="name" value="${esc(p.name || "")}" required maxlength="160" ${dis}></label>
          <label class="field"><span>Categoría</span><input name="category" value="${esc(p.category || "")}" maxlength="120" placeholder="Dirigente político" ${dis}></label>
          <label class="field span-2"><span>Descripción corta</span><input name="shortDescription" value="${esc(p.shortDescription || "")}" maxlength="260" placeholder="Ej. Dirigente de Acción Democrática en Caracas" ${dis}></label>
          <label class="field span-2"><span>Mensaje destacado</span><input name="statusText" value="${esc(p.statusText || "")}" maxlength="160" placeholder="Ej. Recorriendo las parroquias de Caracas" ${dis}></label>
          <label class="check-row span-2"><input type="checkbox" name="badgeEnabled" ${p.badgeEnabled !== false ? "checked" : ""} ${dis}>Mostrar sello de perfil verificado</label>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Foto y colores</h2><p>Lo que ve la gente en el chat.</p></div></div>
        <div class="card-body">
          <div class="logo-field">
            <img id="logo-preview" class="logo-preview" alt="Logo actual" src="${esc(p.logoUrl || initialsLogo(p.name, p.brandColor || DEFAULT_BRAND))}">
            <div class="logo-field-copy">
              <strong>Foto o logo</strong>
              <span class="muted small">Imagen cuadrada en PNG, JPG o SVG. Se ajusta automáticamente. Sin imagen, se muestran las iniciales.</span>
              ${editable ? `<div class="form-actions" style="justify-content:flex-start">
                <label class="btn btn-secondary btn-sm">Subir imagen<input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>
                <button type="button" id="logo-remove" class="btn btn-ghost btn-sm" ${p.logoUrl ? "" : "hidden"}>Quitar</button>
              </div>` : ""}
            </div>
            <input type="hidden" name="logoUrl" value="${esc(p.logoUrl || "")}">
          </div>
          <div class="form-grid">
            <label class="field"><span>Color principal</span>
              <span class="color-input"><input type="color" data-color-for="brandColor" value="${esc(p.brandColor || DEFAULT_BRAND)}" ${dis}><input name="brandColor" class="mono" value="${esc(p.brandColor || "")}" placeholder="${DEFAULT_BRAND}" maxlength="7" ${dis}></span>
              <small>Botones, selección y los mensajes de la persona.</small></label>
            <label class="field"><span>Color secundario</span>
              <span class="color-input"><input type="color" data-color-for="secondaryColor" value="${esc(p.secondaryColor || p.brandColor || DEFAULT_BRAND)}" ${dis}><input name="secondaryColor" class="mono" value="${esc(p.secondaryColor || "")}" placeholder="Igual al principal" maxlength="7" ${dis}></span>
              <small>Botón de enviar y opción destacada de contacto.</small></label>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Asistente</h2><p>Cómo se presenta, qué aviso de privacidad ve la gente y reglas propias.</p></div></div>
        <div class="card-body form-grid">
          <label class="field span-2"><span>Mensaje de bienvenida</span><textarea name="welcomeMessage" rows="4" maxlength="700" placeholder="¡Hola! 👋 Soy el asistente virtual de ${esc(p.name || "…")}. Puedo contarte quién es, qué propone y cómo puede ayudar a tu comunidad." ${dis}>${esc(p.welcomeMessage || "")}</textarea><small>Si lo dejas vacío se usa el mensaje de la sugerencia.</small></label>
          <label class="field span-2"><span>Aviso de privacidad</span><textarea name="privacyNotice" rows="3" maxlength="600" ${dis}>${esc(p.privacyNotice || "")}</textarea><small>Se muestra al abrir el chat y en el formulario de contacto.</small></label>
          <label class="field span-2"><span>Indicaciones para el asistente</span><textarea name="assistantNotes" rows="4" maxlength="2000" placeholder="Ej. Tono cercano y respetuoso. No hablar de encuestas. Si preguntan por ayudas económicas, aclarar que no se entregan." ${dis}>${esc(p.assistantNotes || "")}</textarea><small>Reglas que la IA respeta en todas las respuestas. No se muestran al público. Los datos (propuestas, trayectoria) van en la Base de conocimiento.</small></label>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Contacto público</h2><p>Opcional. Solo lo que quieras mostrar en la ficha.</p></div></div>
        <div class="card-body form-grid">
          <label class="field"><span>Oficina o sede</span><input name="addressLine1" value="${esc(p.addressLine1 || "")}" maxlength="240" ${dis}></label>
          <label class="field"><span>Ciudad y país</span><input name="addressLine2" value="${esc(p.addressLine2 || "")}" maxlength="240" ${dis}></label>
          <label class="field span-2"><span>Búsqueda en mapas</span><input name="mapQuery" value="${esc(p.mapQuery || "")}" maxlength="400" placeholder="Dirección completa como la buscarías en Google Maps" ${dis}></label>
          <label class="field"><span>Teléfono visible</span><input name="phoneDisplay" value="${esc(p.phoneDisplay || "")}" maxlength="80" ${dis}></label>
          <label class="field"><span>Teléfono para llamar</span><input name="phoneE164" value="${esc(p.phoneE164 || "")}" maxlength="40" placeholder="+58…" ${dis}><small>Con código de país, sin espacios.</small></label>
          <label class="field span-2"><span>Correo público</span><input name="email" type="email" value="${esc(p.email || "")}" maxlength="240" ${dis}></label>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Web y redes</h2></div>
        <div class="card-body form-grid">
          <label class="field span-2"><span>Sitio web</span><input name="website" type="url" value="${esc(p.website || "")}" placeholder="https://" ${dis}></label>
          <label class="field"><span>Instagram (enlace)</span><input name="instagram" type="url" value="${esc(p.instagram || "")}" placeholder="https://instagram.com/…" ${dis}></label>
          <label class="field"><span>Instagram (texto visible)</span><input name="instagramLabel" value="${esc(p.instagramLabel || "")}" placeholder="@usuario" ${dis}></label>
          <label class="field"><span>Facebook (enlace)</span><input name="facebook" type="url" value="${esc(p.facebook || "")}" placeholder="https://facebook.com/…" ${dis}></label>
          <label class="field"><span>Facebook (texto visible)</span><input name="facebookLabel" value="${esc(p.facebookLabel || "")}" ${dis}></label>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Horario del equipo</h2><p>Define cuándo la ficha muestra “Equipo disponible ahora”.</p></div></div>
        <div class="card-body">
          <div class="form-grid">
            <label class="field"><span>Abre</span><select name="openHour" ${dis}>${hourOptions(p.openHour ?? 8, 0, 23)}</select></label>
            <label class="field"><span>Cierra</span><select name="closeHour" ${dis}>${hourOptions(p.closeHour ?? 18, 1, 24)}</select></label>
          </div>
          <div class="field"><span class="field-label">Días</span>${weekdayChips("profileDays", days, dis)}</div>
        </div>
        ${editable ? '<div class="card-foot form-actions"><button type="submit" class="btn btn-primary">Guardar cambios</button></div>' : ""}
      </section>
    </form>`;

  if (!editable) return;

  const form = $("#business-form");
  const logoInput = form.logoUrl;
  const preview = $("#logo-preview");
  const fallbackLogo = () => initialsLogo(form.elements.namedItem("name").value, HEX_COLOR.test(form.brandColor.value) ? form.brandColor.value : DEFAULT_BRAND);

  $("#logo-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await prepareLogo(file);
      logoInput.value = dataUrl;
      preview.src = dataUrl;
      $("#logo-remove").hidden = false;
    } catch (error) { toast(error.message, { error: true }); }
    event.target.value = "";
  });
  $("#logo-remove").addEventListener("click", () => {
    logoInput.value = "";
    preview.src = fallbackLogo();
    $("#logo-remove").hidden = true;
  });

  $$("[data-color-for]", form).forEach((picker) => {
    const text = form[picker.dataset.colorFor];
    picker.addEventListener("input", () => { text.value = picker.value; if (!logoInput.value) preview.src = fallbackLogo(); });
    text.addEventListener("input", () => { if (HEX_COLOR.test(text.value)) picker.value = text.value; });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const profile = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "profileDays"));
    profile.badgeEnabled = form.badgeEnabled.checked;
    profile.openHour = Number(profile.openHour);
    profile.closeHour = Number(profile.closeHour);
    profile.weekdays = fd.getAll("profileDays").map(Number);
    for (const key of ["brandColor", "secondaryColor"]) {
      if (profile[key] && !HEX_COLOR.test(profile[key])) return toast("Los colores van en formato #RRGGBB.", { error: true });
    }
    try {
      await withBusy($("button[type=submit]", form), "Guardando…", () => saveSettings({ profile }));
      toast("Perfil guardado.");
      loadBrand();
    } catch (error) { toast(error.message, { error: true }); }
  });
}

// Logos are stored inside the profile, so keep them small: SVG as-is (if
// light), bitmaps resized to 256px PNG.
async function prepareLogo(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen es demasiado grande (máximo 5 MB).");
  const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(blob);
  });
  if (file.type === "image/svg+xml" && file.size <= 200 * 1024) return readAsDataUrl(file);

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("El archivo no es una imagen válida."));
      image.src = url;
    });
    const size = 256;
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight, 1);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    canvas.getContext("2d").drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hourOptions(selected, from, to) {
  let html = "";
  for (let h = from; h <= to; h += 1) html += `<option value="${h}" ${Number(selected) === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`;
  return html;
}

function weekdayChips(name, selected, dis) {
  return `<div class="chip-group">${WEEKDAYS.map(([v, label]) => `
    <label class="chip-toggle"><input type="checkbox" name="${name}" value="${v}" ${selected.includes(v) ? "checked" : ""} ${dis}><span>${label}</span></label>`).join("")}</div>`;
}

/* Localidades */
async function renderZonesTab(panel) {
  const data = await getZones(true);
  const byState = {};
  data.zones.forEach((z) => { (byState[z.state] ||= []).push(z); });

  panel.innerHTML = `
    <form id="zone-form" class="card">
      <div class="card-head"><div><h2>Agregar localidades</h2><p>Lo que la gente elige en el chat (municipios, parroquias o sectores). Después asignas cada localidad a sus coordinadores en Equipo.</p></div></div>
      <div class="card-body form-grid">
        <label class="field"><span>Estado</span><select name="state" required><option value="">Elige un estado</option>${data.states.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>
        <label class="field span-2"><span>Localidades</span><textarea name="names" rows="4" required placeholder="Una por línea. Ej.:&#10;Libertador&#10;Chacao&#10;Sucre"></textarea><small>Puedes pegar varias de una vez. Si alguien no encuentra la suya, puede escribirla y queda como “Otra localidad”.</small></label>
      </div>
      <div class="card-foot form-actions"><button type="submit" class="btn btn-primary">Agregar</button></div>
    </form>

    ${Object.keys(byState).length ? Object.entries(byState).map(([state, zones]) => `
      <section class="card">
        <div class="card-head"><h2>${esc(state)}</h2><span class="pill">${zones.length}</span></div>
        <div class="list">
          ${zones.map((z) => `
            <div class="list-row">
              <span class="list-row-main">
                <strong>${esc(z.name)}${z.active ? "" : ' <span class="pill">Oculta</span>'}</strong>
                <span>${z.coordinators.length ? esc(z.coordinators.map((c) => c.name).join(", ")) : "Sin coordinador"} · ${esc(z.lead_count)} contacto${z.lead_count === 1 ? "" : "s"}</span>
              </span>
              <span class="list-row-aside">
                <button class="btn btn-ghost btn-sm" data-zone-rename="${esc(z.id)}" data-name="${esc(z.name)}">Renombrar</button>
                ${z.active ? `<button class="btn btn-ghost btn-sm" data-zone-delete="${esc(z.id)}" data-name="${esc(z.name)}">Quitar</button>`
                           : `<button class="btn btn-ghost btn-sm" data-zone-restore="${esc(z.id)}">Mostrar</button>`}
              </span>
            </div>`).join("")}
        </div>
      </section>`).join("") : '<section class="card"><div class="empty"><strong>Todavía no hay localidades</strong>Sin localidades, la gente escribe la suya a mano y los contactos llegan solo al administrador.</div></section>'}`;

  $("#zone-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await withBusy($("button[type=submit]", event.currentTarget), "Agregando…", () => post("/api/crm/zones", { action: "create", ...values }));
      toast(`${res.zones.length} localidad${res.zones.length === 1 ? "" : "es"} agregada${res.zones.length === 1 ? "" : "s"}.`);
      zonesCache = null;
      renderSettingsTab();
      refreshBadges();
    } catch (error) { toast(error.message, { error: true }); }
  });
  $$("[data-zone-rename]", panel).forEach((btn) => btn.addEventListener("click", async () => {
    const name = prompt("Nuevo nombre", btn.dataset.name);
    if (!name || name === btn.dataset.name) return;
    try {
      await post("/api/crm/zones", { action: "update", id: btn.dataset.zoneRename, name });
      zonesCache = null;
      renderSettingsTab();
    } catch (error) { toast(error.message, { error: true }); }
  }));
  $$("[data-zone-delete]", panel).forEach((btn) => btn.addEventListener("click", async () => {
    const ok = await confirmDialog(`“${btn.dataset.name}” deja de aparecer en el chat. Si tiene contactos, se oculta en lugar de borrarse.`, { title: "¿Quitar localidad?", confirmLabel: "Quitar", danger: true });
    if (!ok) return;
    try {
      await post("/api/crm/zones", { action: "delete", id: btn.dataset.zoneDelete });
      zonesCache = null;
      renderSettingsTab();
    } catch (error) { toast(error.message, { error: true }); }
  }));
  $$("[data-zone-restore]", panel).forEach((btn) => btn.addEventListener("click", async () => {
    try {
      await post("/api/crm/zones", { action: "update", id: btn.dataset.zoneRestore, active: true });
      zonesCache = null;
      renderSettingsTab();
    } catch (error) { toast(error.message, { error: true }); }
  }));
}

/* Captación y privacidad */
const CAPTURE_OPTIONS = [
  ["contactOffer", "Invitar a dejar el teléfono", "Cuando encaja en la conversación, el asistente invita (de forma sutil) a que lo contacte el coordinador de su zona."],
  ["autoDetect", "Detectar teléfonos escritos en el chat", "Si la persona escribe su número en la conversación, se registra como contacto aunque no complete el formulario."]
];

async function renderCaptureTab(panel) {
  const { capture, retentionDays } = await api("/api/crm/capture");
  panel.innerHTML = `
    <form id="capture-form" class="card">
      <div class="card-head"><div><h2>Captación</h2><p>Cómo el chat convierte conversaciones en contactos para los coordinadores.</p></div></div>
      <div class="list">
        ${CAPTURE_OPTIONS.map(([key, label, help]) => `
          <label class="list-row capture-option">
            <span class="list-row-main"><strong>${label}</strong><span>${help}</span></span>
            <span class="switch"><input type="checkbox" name="${key}" ${capture[key] !== false ? "checked" : ""}><span class="track"></span></span>
          </label>`).join("")}
      </div>
      <div class="card-body">
        <label class="field"><span>Borrar conversaciones después de</span>
          <span class="inline-input"><input name="retentionDays" type="number" min="7" max="365" value="${esc(retentionDays)}"> días sin actividad</span>
          <small>Los contactos quedan (nombre, teléfono, localidad, notas y el resumen de la IA); la conversación completa se borra.</small>
        </label>
      </div>
      <div class="card-foot form-actions"><button type="submit" class="btn btn-primary">Guardar cambios</button></div>
    </form>
    <section class="card">
      <div class="card-head"><h2>Qué se guarda</h2></div>
      <div class="card-body">
        <dl class="facts">
          <dt>De cada contacto</dt><dd>Nombre, teléfono, estado y localidad, notas del coordinador y el resumen de la IA.</dd>
          <dt>Conversaciones</dt><dd>Los mensajes del chat, hasta ${esc(retentionDays)} días sin actividad.</dd>
          <dt>Quién ve qué</dt><dd>Cada coordinador ve solo los contactos de sus localidades. Las conversaciones anónimas y la escucha territorial, solo los administradores.</dd>
          <dt>Correos de aviso</dt><dd>No incluyen teléfonos ni conversaciones: solo la localidad y un enlace al panel.</dd>
        </dl>
        <p class="muted small">El aviso de privacidad que ve la gente se edita en Perfil → Asistente.</p>
      </div>
    </section>`;

  $("#capture-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(CAPTURE_OPTIONS.map(([key]) => [key, form.elements[key].checked]));
    try {
      await withBusy($("button[type=submit]", form), "Guardando…", () =>
        post("/api/crm/capture", { capture: values, retentionDays: Number(form.elements.retentionDays.value) }));
      toast("Configuración guardada.");
    } catch (error) { toast(error.message, { error: true }); }
  });
}

/* Integraciones */
const EMAIL_PRESETS = {
  gmail: { label: "Gmail o Google Workspace", host: "smtp.gmail.com", port: 587, secure: false, hint: "Usa una contraseña de aplicación (Cuenta de Google → Seguridad → Contraseñas de aplicaciones), no tu contraseña normal." },
  outlook: { label: "Microsoft 365 u Outlook", host: "smtp.office365.com", port: 587, secure: false, hint: "La cuenta debe tener habilitado SMTP autenticado." },
  zoho: { label: "Zoho Mail", host: "smtp.zoho.com", port: 465, secure: true, hint: "" },
  custom: { label: "Otro proveedor", host: "", port: 587, secure: false, hint: "Pídele a tu proveedor el servidor SMTP, el puerto y si usa SSL." }
};

function sourceLabel(item) {
  if (!item.configured) return '<span class="pill pill-warning">Sin configurar</span>';
  if (item.source === "env") return '<span class="pill pill-success">Conectado · variables del servidor</span>';
  return '<span class="pill pill-success">Conectado</span>';
}

async function renderIntegrationsTab(panel) {
  const { integrations } = await api("/api/crm/integrations");
  const { ai, email } = integrations;
  const presetKey = Object.entries(EMAIL_PRESETS).find(([, p]) => p.host && p.host === email.host)?.[0] || (email.host ? "custom" : "gmail");

  panel.innerHTML = `
    <form class="card" data-section="ai">
      <div class="card-head">
        <div class="integration-head">
          <span class="integration-icon">${icon("sparkle")}</span>
          <div><h2>Inteligencia artificial</h2><p>Google Gemini responde las consultas del chat.</p></div>
        </div>
        ${sourceLabel(ai)}
      </div>
      <div class="card-body">
        <div class="callout">Crea una clave gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> → “Create API key” y pégala aquí.</div>
        <div class="form-grid">
          <label class="field span-2"><span>Clave de API</span><input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${ai.configured ? `Guardada (${esc(ai.apiKeyHint)}). Escribe una nueva para reemplazarla.` : "AIza…"}"></label>
          <label class="field"><span>Modelo principal</span><input name="model" class="mono" value="${esc(ai.model)}" placeholder="${esc(ai.defaults.model)}"></label>
          <label class="field"><span>Modelo de respaldo</span><input name="fallbackModel" class="mono" value="${esc(ai.fallbackModel)}" placeholder="${esc(ai.defaults.fallbackModel)}"><small>Se usa si el principal tarda o falla.</small></label>
        </div>
      </div>
      <div class="card-foot form-actions">
        <span class="inline-result" data-result></span>
        <button type="button" class="btn btn-ghost" data-test>Probar conexión</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>

    <form class="card" data-section="email">
      <div class="card-head">
        <div class="integration-head">
          <span class="integration-icon">${icon("mailOut")}</span>
          <div><h2>Correo saliente</h2><p>Avisos a los coordinadores cuando llega un contacto de su localidad, y recordatorios.</p></div>
        </div>
        ${sourceLabel(email)}
      </div>
      <div class="card-body">
        <div class="form-grid">
          <label class="field span-2"><span>Proveedor</span><select name="preset">${Object.entries(EMAIL_PRESETS).map(([k, p]) => `<option value="${k}" ${k === presetKey ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
          <div class="callout span-2" data-preset-hint ${EMAIL_PRESETS[presetKey].hint ? "" : "hidden"}>${esc(EMAIL_PRESETS[presetKey].hint)}</div>
          <label class="field"><span>Servidor SMTP</span><input name="host" class="mono" value="${esc(email.host)}" placeholder="smtp.ejemplo.com"></label>
          <label class="field"><span>Puerto</span><input name="port" type="number" min="1" max="65535" value="${esc(email.port || 587)}"></label>
          <label class="field"><span>Usuario</span><input name="user" value="${esc(email.user)}" autocomplete="off" placeholder="equipo@tudominio.com"></label>
          <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="new-password" placeholder="${email.passwordHint ? "Guardada. Escribe una nueva para reemplazarla." : ""}"></label>
          <label class="field"><span>Remitente</span><input name="from" value="${esc(email.from)}" placeholder='Equipo <equipo@tudominio.com>'></label>
          <label class="field"><span>Avisos internos a</span><input name="notifyTo" type="email" value="${esc(email.notifyTo)}" placeholder="equipo@tudominio.com"><small>Recibe los contactos sin coordinador y una copia de los avisos.</small></label>
          <label class="switch span-2"><input type="checkbox" name="secure" ${email.secure ? "checked" : ""}><span class="track"></span>Conexión SSL directa (puerto 465)</label>
        </div>
      </div>
      <div class="card-foot form-actions">
        <span class="inline-result" data-result></span>
        <button type="button" class="btn btn-ghost" data-test>Enviarme un correo de prueba</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>`;

  const emailForm = $('[data-section="email"]', panel);
  emailForm.preset.addEventListener("change", () => {
    const preset = EMAIL_PRESETS[emailForm.preset.value];
    if (preset.host) emailForm.host.value = preset.host;
    emailForm.port.value = preset.port;
    emailForm.secure.checked = preset.secure;
    const hint = $("[data-preset-hint]", emailForm);
    hint.textContent = preset.hint;
    hint.hidden = !preset.hint;
  });

  $$("[data-copy]", panel).forEach((btn) => btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy)));

  const collect = (form) => {
    const fd = new FormData(form);
    const values = Object.fromEntries([...fd.entries()].filter(([k, v]) => k !== "preset" && !(v instanceof File)));
    if (form.dataset.section === "email") values.secure = form.secure.checked;
    return values;
  };

  $$("form[data-section]", panel).forEach((form) => {
    const result = $("[data-result]", form);
    const show = (text, ok) => { result.textContent = text; result.className = `inline-result ${ok ? "is-ok" : "is-error"}`; };

    $("[data-test]", form).addEventListener("click", async (event) => {
      result.textContent = "";
      try {
        const data = await withBusy(event.currentTarget, "Probando…", () =>
          post("/api/crm/integrations", { action: "test", section: form.dataset.section, values: collect(form) }));
        show(data.message, true);
      } catch (error) { show(error.message, false); }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      result.textContent = "";
      try {
        await withBusy($("button[type=submit]", form), "Guardando…", () =>
          post("/api/crm/integrations", { action: "save", section: form.dataset.section, values: collect(form) }));
        toast("Integración guardada.");
        refreshBadges();
        renderSettingsTab();
      } catch (error) { show(error.message, false); }
    });
  });
}

/* Equipo */
function zonePicker(zones, selectedIds = []) {
  if (!zones.length) return '<p class="muted small">Primero carga localidades en Configuración → Localidades.</p>';
  const byState = {};
  zones.filter((z) => z.active).forEach((z) => { (byState[z.state] ||= []).push(z); });
  return `<div class="zone-picker">${Object.entries(byState).map(([state, list]) => `
    <fieldset class="zone-group">
      <legend><label class="check-row"><input type="checkbox" data-state-all="${esc(state)}">${esc(state)}</label></legend>
      <div class="chip-group">${list.map((z) => `
        <label class="chip-toggle"><input type="checkbox" name="zoneIds" value="${esc(z.id)}" data-state="${esc(state)}" ${selectedIds.includes(z.id) ? "checked" : ""}><span>${esc(z.name)}</span></label>`).join("")}
      </div>
    </fieldset>`).join("")}</div>`;
}

function wireZonePicker(root) {
  $$("[data-state-all]", root).forEach((all) => {
    const boxes = $$(`[name=zoneIds][data-state="${CSS.escape(all.dataset.stateAll)}"]`, root);
    const sync = () => { all.checked = boxes.length && boxes.every((b) => b.checked); };
    sync();
    all.addEventListener("change", () => boxes.forEach((b) => { b.checked = all.checked; }));
    boxes.forEach((b) => b.addEventListener("change", sync));
  });
}

async function renderTeamTab(panel) {
  const [data, zoneData] = await Promise.all([api("/api/crm/team"), getZones(true)]);
  const zones = zoneData.zones || [];
  panel.innerHTML = `
    <section class="card">
      <div class="card-head"><div><h2>Equipo</h2><p>Quiénes entran al panel y qué localidades atiende cada coordinador.</p></div><button id="add-member" class="btn btn-primary btn-sm">${icon("plus")}Agregar persona</button></div>
      <div class="list">
        ${data.members.map((m) => `
          <div class="list-row member-row">
            <span class="avatar-initials">${esc(initials(m.full_name))}</span>
            <span class="list-row-main">
              <strong>${esc(m.full_name)}${m.id === data.me ? " (tú)" : ""}</strong>
              <span>${esc(m.email)}${m.phone ? ` · ${esc(m.phone)}` : ""}</span>
              ${m.role === "coordinator" ? `<span>${m.zones.length ? esc(m.zones.map((z) => z.name).join(", ")) : "Sin localidades asignadas"}</span>` : ""}
            </span>
            <span class="list-row-aside">
              ${m.active ? "" : '<span class="pill">Desactivado</span>'}
              <span class="pill ${m.role === "admin" ? "pill-accent" : ""}">${esc(ROLES[m.role] || m.role)}</span>
              ${m.id !== data.me ? `
                <button class="btn btn-ghost btn-sm" data-edit="${esc(m.id)}">Editar</button>
                <button class="btn btn-ghost btn-sm" data-reset="${esc(m.id)}" data-name="${esc(m.full_name)}">Nueva contraseña</button>
                <button class="btn btn-ghost btn-sm" data-active="${esc(m.id)}" data-value="${m.active ? "false" : "true"}">${m.active ? "Desactivar" : "Activar"}</button>` : ""}
            </span>
          </div>`).join("")}
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>Qué puede hacer cada rol</h2></div>
      <div class="card-body">
        <dl class="facts">
          <dt>Administrador</dt><dd>Ve todo: todos los contactos, conversaciones anónimas, escucha territorial y configuración. Pensado para el político y una o dos personas de confianza.</dd>
          <dt>Coordinador</dt><dd>Ve solo los contactos de sus localidades, con su conversación y el resumen de la IA. No ve conversaciones de otras zonas ni la configuración.</dd>
        </dl>
        <p class="muted small">Al desactivar a alguien, pierde el acceso en el acto.</p>
      </div>
    </section>`;

  const showPassword = (name, email, password) => {
    const body = openDialog(`
      <div class="card-head"><h2>Contraseña temporal</h2></div>
      <div class="card-body">
        <p>Compártela con ${esc(name)} por un canal seguro. Podrá cambiarla en Configuración → Mi cuenta.</p>
        <div class="callout"><strong>Usuario:</strong> <code>${esc(email || "")}</code><br><strong>Contraseña:</strong> <code>${esc(password)}</code></div>
        <p class="muted small">Por seguridad no se vuelve a mostrar.</p>
        <div class="form-actions"><button class="btn btn-ghost" data-copy>${icon("copy")}Copiar</button><button class="btn btn-primary" data-close>Listo</button></div>
      </div>`);
    $("[data-copy]", body).addEventListener("click", () => copyToClipboard(`Panel: ${location.origin}/dashboard\nUsuario: ${email || ""}\nContraseña: ${password}`));
    $("[data-close]", body).addEventListener("click", closeDialog);
  };

  const memberDialog = (member = null) => {
    const role = member?.role || "coordinator";
    const body = openDialog(`
      <div class="card-head"><h2>${member ? `Editar a ${esc(member.full_name)}` : "Agregar persona"}</h2></div>
      <form id="member-form" class="card-body">
        <div class="form-grid">
          <label class="field"><span>Nombre</span><input name="name" required maxlength="160" value="${esc(member?.full_name || "")}"></label>
          ${member ? "" : '<label class="field"><span>Correo</span><input name="email" type="email" required></label>'}
          <label class="field"><span>Teléfono (opcional)</span><input name="phone" maxlength="40" value="${esc(member?.phone || "")}"></label>
          <label class="field"><span>Rol</span><select name="role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === role ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <div class="field span-2" data-zones-field ${role === "admin" ? "hidden" : ""}><span class="field-label">Localidades que atiende</span>${zonePicker(zones, (member?.zones || []).map((z) => z.id))}</div>
        </div>
        <div class="form-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="submit" class="btn btn-primary">${member ? "Guardar" : "Agregar"}</button></div>
      </form>`, { wide: true });
    wireZonePicker(body);
    $("[data-close]", body).addEventListener("click", closeDialog);
    $("[name=role]", body).addEventListener("change", (e) => { $("[data-zones-field]", body).hidden = e.target.value === "admin"; });
    $("#member-form", body).addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const values = { name: fd.get("name"), phone: fd.get("phone"), role: fd.get("role"), zoneIds: fd.getAll("zoneIds") };
      try {
        if (member) {
          await post("/api/crm/team", { action: "update", id: member.id, ...values });
          closeDialog();
          toast("Cambios guardados.");
          renderSettingsTab();
        } else {
          const res = await post("/api/crm/team", { action: "create", email: fd.get("email"), ...values });
          renderSettingsTab();
          showPassword(res.member.full_name, res.member.email, res.temporaryPassword);
        }
      } catch (error) { toast(error.message, { error: true }); }
    });
  };

  $("#add-member").addEventListener("click", () => memberDialog());
  $$("[data-edit]", panel).forEach((btn) => btn.addEventListener("click", () => memberDialog(data.members.find((m) => m.id === btn.dataset.edit))));
  $$("[data-active]", panel).forEach((btn) => btn.addEventListener("click", async () => {
    try {
      await post("/api/crm/team", { action: "update", id: btn.dataset.active, active: btn.dataset.value === "true" });
      renderSettingsTab();
    } catch (error) { toast(error.message, { error: true }); }
  }));
  $$("[data-reset]", panel).forEach((btn) => btn.addEventListener("click", async () => {
    const ok = await confirmDialog(`Se genera una contraseña nueva para ${btn.dataset.name} y la actual deja de funcionar.`, { title: "Nueva contraseña", confirmLabel: "Generar" });
    if (!ok) return;
    try {
      const res = await post("/api/crm/team", { action: "reset-password", id: btn.dataset.reset });
      const member = data.members.find((m) => m.id === btn.dataset.reset);
      showPassword(btn.dataset.name, member?.email, res.temporaryPassword);
    } catch (error) { toast(error.message, { error: true }); }
  }));
}

/* Mi cuenta */
async function renderAccountTab(panel) {
  panel.innerHTML = `
    <section class="card">
      <div class="card-head"><h2>Tu cuenta</h2></div>
      <div class="card-body">
        <dl class="facts">
          <dt>Nombre</dt><dd>${esc(currentManager?.name || "")}</dd>
          <dt>Correo</dt><dd>${esc(currentManager?.email || "")}</dd>
          <dt>Rol</dt><dd>${esc(ROLES[currentManager?.role] || "")}</dd>
        </dl>
      </div>
    </section>
    <form id="password-form" class="card">
      <div class="card-head"><h2>Cambiar contraseña</h2></div>
      <div class="card-body form-grid">
        <label class="field span-2"><span>Contraseña actual</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
        <label class="field"><span>Nueva contraseña</span><input name="newPassword" type="password" autocomplete="new-password" minlength="10" required><small>Mínimo 10 caracteres.</small></label>
        <label class="field"><span>Repetir nueva contraseña</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required></label>
      </div>
      <div class="card-foot form-actions"><button type="submit" class="btn btn-primary">Cambiar contraseña</button></div>
    </form>`;

  $("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) return toast("Las contraseñas nuevas no coinciden.", { error: true });
    try {
      await withBusy($("button[type=submit]", form), "Guardando…", () =>
        post("/api/crm/team", { action: "change-password", currentPassword: values.currentPassword, newPassword: values.newPassword }));
      form.reset();
      toast("Contraseña actualizada.");
    } catch (error) { toast(error.message, { error: true }); }
  });
}

init();
