CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','document','url','import')),
  source_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','archived')),
  priority integer NOT NULL DEFAULT 0,
  valid_from date,
  valid_until date,
  created_by uuid REFERENCES managers(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES managers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_category ON knowledge_items(category_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_status ON knowledge_items(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_validity ON knowledge_items(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_fts
ON knowledge_items USING GIN (
  to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content,''))
);

INSERT INTO knowledge_categories (name,description,sort_order) VALUES
('Biografía','Quién es, de dónde viene, trayectoria personal y profesional',10),
('Trayectoria política','Cargos, partido, alianzas y hechos públicos relevantes',20),
('Propuestas','Propuestas concretas por tema',30),
('Posturas','Qué piensa sobre los temas que más pregunta la gente',40),
('Qué hace y qué no hace','Alcance real: qué puede ofrecer y qué no, para no generar falsas expectativas',50),
('Cómo sumarse','Voluntariado, coordinadores, actividades y canales oficiales',60)
ON CONFLICT (name) DO NOTHING;

-- Plantillas en borrador: el asistente no las usa hasta que se completen y activen.
INSERT INTO knowledge_items(category_id,title,summary,content,tags,priority,status)
SELECT c.id, v.title, v.summary, v.content, v.tags, 50, 'draft'
FROM (VALUES
  ('Biografía','Plantilla: biografía','Quién es en pocas líneas.',
   '[Completa] Nombre completo, de dónde es, formación, profesión, familia (solo lo que quiera hacer público) y por qué está en política.',
   ARRAY['biografía','quién es','origen']),
  ('Trayectoria política','Plantilla: trayectoria','Partido, cargos y hechos públicos.',
   '[Completa] Partido o movimiento actual y rol que ocupa, cargos anteriores, candidaturas, alianzas y hechos públicos que la gente suele preguntar. Redáctalo como quieras que se responda.',
   ARRAY['partido','trayectoria','cargos']),
  ('Propuestas','Plantilla: propuesta (un tema por ficha)','Una propuesta concreta.',
   '[Completa] Tema (por ejemplo: empleo, servicios públicos, salud, seguridad). Qué propone, cómo, y qué ya hizo al respecto. Conviene una ficha por tema.',
   ARRAY['propuesta','empleo','servicios']),
  ('Posturas','Plantilla: postura','Qué piensa sobre un tema frecuente.',
   '[Completa] Tema y postura en dos o tres frases, tal como quiere que se responda.',
   ARRAY['postura','opinión']),
  ('Qué hace y qué no hace','Plantilla: alcance','Qué puede ofrecer y qué no.',
   '[Completa] Qué gestiones sí puede hacer o acompañar, y qué no (por ejemplo: no entrega dinero, no gestiona cupos, no promete empleos). Así el asistente no genera falsas expectativas.',
   ARRAY['ayuda','gestiones','alcance','qué ofrece']),
  ('Cómo sumarse','Plantilla: cómo sumarse','Voluntariado y coordinadores.',
   '[Completa] Cómo puede sumarse una persona, qué hace un coordinador de zona, actividades próximas y redes oficiales.',
   ARRAY['sumarse','voluntario','coordinador','contacto'])
) AS v(category, title, summary, content, tags)
JOIN knowledge_categories c ON c.name = v.category
WHERE NOT EXISTS (SELECT 1 FROM knowledge_items ki WHERE ki.title = v.title);
