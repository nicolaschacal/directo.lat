const crypto = require("crypto");
const { query } = require("./db");

const COOKIE_NAME = "escucha_visitor";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

function parseCookies(req) {
  const raw = String(req.headers?.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const index = part.indexOf("=");
    if (index <= 0) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function isSecureRequest(req) {
  const forwarded = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwarded === "https" || Boolean(process.env.VERCEL);
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader?.("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  const list = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...list, cookie]);
}

function getVisitorToken(req, res) {
  // One token per request, even before the browser has the cookie.
  if (req.escuchaVisitorToken) return req.escuchaVisitorToken;
  const cookies = parseCookies(req);
  let token = cookies[COOKIE_NAME];

  if (!token || !/^[A-Za-z0-9_-]{24,128}$/.test(token)) {
    token = crypto.randomBytes(32).toString("base64url");
    const attributes = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      "Path=/",
      `Max-Age=${COOKIE_MAX_AGE}`,
      "HttpOnly",
      "SameSite=Lax"
    ];
    if (isSecureRequest(req)) attributes.push("Secure");
    appendSetCookie(res, attributes.join("; "));
  }

  req.escuchaVisitorToken = token;
  return token;
}

function getVisitorSessionKey(req, res) {
  const token = getVisitorToken(req, res);
  const digest = crypto.createHash("sha256").update(token).digest("hex");
  return `visitor:${digest}`;
}

function runner(client) {
  return client?.query ? client.query.bind(client) : query;
}

async function ensureConversation(req, res, client = null) {
  const run = runner(client);
  const sessionKey = getVisitorSessionKey(req, res);

  const result = await run(
    `INSERT INTO conversation_sessions(session_key,last_message_at)
     VALUES($1,now())
     ON CONFLICT(session_key)
     DO UPDATE SET last_message_at=now()
     RETURNING id,session_key,lead_id,state,zone_id,locality_text,started_at,last_message_at`,
    [sessionKey]
  );

  return result.rows[0];
}

async function loadVisitorMessages(req, res, limit = 200, existingSession = null) {
  const session = existingSession || await ensureConversation(req, res);
  const result = await query(
    `SELECT role,content,created_at
     FROM conversation_messages
     WHERE conversation_id=$1
     ORDER BY created_at DESC
     LIMIT $2`,
    [session.id, Math.min(Math.max(Number(limit) || 200, 1), 500)]
  );

  return {
    session,
    messages: result.rows.reverse()
  };
}

async function persistVisitorMessage(req, res, role, content, leadId = null, client = null) {
  if (!process.env.DATABASE_URL || !content) return null;

  try {
    const run = runner(client);
    const session = await ensureConversation(req, res, client);

    if (leadId && !session.lead_id) {
      await run(
        `UPDATE conversation_sessions
         SET lead_id=$2,last_message_at=now()
         WHERE id=$1`,
        [session.id, leadId]
      );
      session.lead_id = leadId;
    }

    await run(
      `INSERT INTO conversation_messages(conversation_id,role,content)
       VALUES($1,$2,$3)`,
      [session.id, role, String(content).slice(0,5000)]
    );

    return session;
  } catch (error) {
    console.error("No se pudo persistir el mensaje del visitante:", error.message);
    return null;
  }
}

async function linkVisitorToLead(req, res, leadId, client = null) {
  const run = runner(client);
  const session = await ensureConversation(req, res, client);
  await run(
    `UPDATE conversation_sessions
     SET lead_id=$2,last_message_at=now()
     WHERE id=$1`,
    [session.id, leadId]
  );
  return { ...session, lead_id: leadId };
}

/** Guarda la localidad que la persona eligió al abrir el chat. */
async function setVisitorLocation(req, res, { state, zoneId, localityText }) {
  const session = await ensureConversation(req, res);
  await query(
    `UPDATE conversation_sessions SET state=$2, zone_id=$3, locality_text=$4 WHERE id=$1`,
    [session.id, state, zoneId, localityText]
  );
  return { ...session, state, zone_id: zoneId, locality_text: localityText };
}

module.exports = {
  ensureConversation,
  loadVisitorMessages,
  persistVisitorMessage,
  linkVisitorToLead,
  setVisitorLocation,
  getVisitorSessionKey
};
