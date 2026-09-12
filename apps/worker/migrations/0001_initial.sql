-- 0001_initial.sql — esquema D1 open-booking
-- Decisiones: N03 domain model, N05 pipeline, N08 esquema D1
-- PK SURROGATE UUID, identidad externa en tabla aparte, ContactMethod fila-por-valor
-- con flag activo, fuentes jerarquizadas, ScrapeJob auditado.

PRAGMA foreign_keys = ON;

-- ── AccommodationType ────────────────────────────────────────────────────────
CREATE TABLE accommodation_types (
  id   INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
);
INSERT INTO accommodation_types (id, slug) VALUES
  (1,'hotel'),(2,'apartamento'),(3,'apart-estudio'),(4,'hostal'),
  (5,'bnb-casa-rural'),(6,'hostel'),(7,'camping-glamping');

-- ── Accommodation ────────────────────────────────────────────────────────────
CREATE TABLE accommodations (
  id           TEXT PRIMARY KEY,              -- SURROGATE UUID
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,                 -- normalizado, para URL y ranking
  type_id      INTEGER NOT NULL REFERENCES accommodation_types(id),
  municipality  TEXT NOT NULL,                -- nombre normalizado (índice de ciudad)
  municipality_code TEXT,                     -- código DANE (RNT) cuando existe
  lat          REAL,
  lon          REAL,
  country_code TEXT NOT NULL DEFAULT 'CO',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_accommodations_municipality ON accommodations(municipality);
CREATE INDEX idx_accommodations_type ON accommodations(type_id);
CREATE INDEX idx_accommodations_name ON accommodations(name);

-- ── Identidad externa (cruce RNT + OSM + Wikidata) ───────────────────────────
CREATE TABLE accommodation_external_ids (
  accommodation_id TEXT NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  source           TEXT NOT NULL,             -- 'rnt' | 'osm' | 'wikidata'
  external_id      TEXT NOT NULL,             -- rnt codigo / osm node:id / wikidata Q####
  url              TEXT,                      -- donde se verificó
  PRIMARY KEY (accommodation_id, source, external_id)
);
CREATE UNIQUE INDEX idx_external_ids_source ON accommodation_external_ids(source, external_id);

-- ── Contact channel (canales canónicos) ──────────────────────────────────────
CREATE TABLE contact_channels (
  id   INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
);
INSERT INTO contact_channels (id, slug) VALUES
  (1,'telefono'),(2,'whatsapp'),(3,'email'),(4,'web'),
  (5,'redes'),(6,'horario-recepcion'),(7,'direccion');

-- ── Confidence ───────────────────────────────────────────────────────────────
CREATE TABLE confidence_levels (
  id   INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
);
INSERT INTO confidence_levels (id, slug) VALUES
  (1,'verified'),(2,'inferred'),(3,'manual');

-- ── ContactMethod (fila por valor, alternativas vivas) ───────────────────────
CREATE TABLE contact_methods (
  id                TEXT PRIMARY KEY,         -- SURROGATE UUID
  accommodation_id  TEXT NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  channel_id        INTEGER NOT NULL REFERENCES contact_channels(id),
  value             TEXT NOT NULL,            -- número, email, url, rango horario…
  confidence_id     INTEGER NOT NULL REFERENCES confidence_levels(id),
  source            TEXT NOT NULL,            -- 'rnt'|'osm'|'wikidata'|'web_propia'|'manual'
  is_active         INTEGER NOT NULL DEFAULT 1, -- fila ganadora del canal
  needs_review      INTEGER NOT NULL DEFAULT 0, -- conflicto a igual nivel: revisión
  seen_at           TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contact_methods_accommodation ON contact_methods(accommodation_id);
CREATE INDEX idx_contact_methods_channel ON contact_methods(channel_id);
CREATE INDEX idx_contact_methods_source ON contact_methods(source);

-- ── ScrapeJob / Source ───────────────────────────────────────────────────────
CREATE TABLE sources (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,          -- 'rnt'|'osm'|'wikidata'|'web_propia'|'manual'
  hierarchy    INTEGER NOT NULL,              -- orden de precedencia (más bajo = más alto)
  is_review    INTEGER NOT NULL DEFAULT 0     -- 1 = curación manual
);
INSERT INTO sources (id, slug, hierarchy, is_review) VALUES
  (1,'rnt',       2, 0),
  (2,'osm',       3, 0),
  (3,'wikidata',  4, 0),
  (4,'web_propia',1, 0),
  (5,'manual',    5, 1);

CREATE TABLE scrape_jobs (
  id              TEXT PRIMARY KEY,           -- SURROGATE UUID
  source_id       INTEGER NOT NULL REFERENCES sources(id),
  status          TEXT NOT NULL,              -- 'running'|'done'|'failed'|'partial'
  started_at      TEXT,
  finished_at     TEXT,
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_upserted  INTEGER NOT NULL DEFAULT 0,
  items_failed    INTEGER NOT NULL DEFAULT 0,
  log             TEXT                        -- resumen/frees
);

-- ── Resumen de decisión del esquema ──────────────────────────────────────────
-- N08: SURROGATE UUID en accommodations y contact_methods (13 chars scalabre);
-- identidad externa en accommodation_external_ids (splicing RNT/OSM/Wikidata);
-- ContactMethod fila-por-valor con is_active (uno por canal) + alternativas vivas
-- y needs_review para conflictos a igual nivel; índice por municipio (ciudad) +
-- jerarquía de fuentes para resolver precedencia (rows más bajas = más altas).