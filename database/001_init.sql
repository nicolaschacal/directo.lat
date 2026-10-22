CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Usuarios del panel.
--   admin: ve y gestiona todo (el político y su equipo de confianza).
--   coordinator: ve solo los contactos de las localidades que tiene asignadas.
CREATE TABLE IF NOT EXISTS managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'coordinator' CHECK (role IN ('admin','coordinator')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Localidades que el administrador da de alta (estado + municipio/parroquia/sector).
-- La persona elige su estado y una de estas localidades en el chat.
CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state, name)
);

CREATE INDEX IF NOT EXISTS idx_zones_state ON zones(state) WHERE active;

-- Qué localidades atiende cada coordinador.
CREATE TABLE IF NOT EXISTS manager_zones (
  manager_id uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (manager_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_manager_zones_zone ON manager_zones(zone_id);

-- Personas que pidieron que las contacte el coordinador de su zona.
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  phone text,
  state text,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  locality_text text,
  source text NOT NULL DEFAULT 'chat',
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','followup','joined','not_interested')),
  notes text,
  privacy_consent_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ai_summary text,
  ai_topic text,
  ai_primary_concern text,
  ai_next_action text,
  ai_analyzed_at timestamptz,
  last_contact_at timestamptz,
  next_action_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_zone ON leads(zone_id);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_at);

-- Conversaciones del chat. Se borran solas a los 90 días sin actividad
-- (ver lib/retention.js). La localidad puede venir del selector del chat
-- aunque la persona no deje sus datos.
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL UNIQUE,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  state text,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  locality_text text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_lead ON conversation_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversation_last_message ON conversation_sessions(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_zone ON conversation_sessions(zone_id);
CREATE INDEX IF NOT EXISTS idx_conversation_state ON conversation_sessions(state);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  assigned_manager_id uuid REFERENCES managers(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'manager_contact',
  title text NOT NULL,
  notes text,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','cancelled')),
  completed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(status, due_at);
CREATE INDEX IF NOT EXISTS idx_followups_lead ON followups(lead_id);

CREATE TABLE IF NOT EXISTS activities (
  id bigserial PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES managers(id) ON DELETE SET NULL,
  type text NOT NULL,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_pending ON email_jobs(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS crm_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO crm_settings(key, value) VALUES
  ('retention', '{"conversationDays":90}'::jsonb),
  ('capture', '{"contactOffer":true,"autoDetect":true}'::jsonb),
  ('profile', '{
    "name":"Mi candidatura",
    "category":"Dirigente político",
    "badgeEnabled":true,
    "openHour":8,
    "closeHour":20,
    "weekdays":[1,2,3,4,5,6]
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;
