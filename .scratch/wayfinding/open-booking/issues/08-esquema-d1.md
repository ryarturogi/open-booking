# Esquema D1: accommodations, contactos, fuentes y cruce

Status: resolved

## Answer

<!-- 2026-09-12, grilling vía la herramienta de preguntas -->

Esquema D1 fijado y aplicado en `apps/worker/migrations/0001_initial.sql` (validado localmente con `wrangler d1 execute --local`):

- **PK SURROGATE UUID** en `accommodations` y `contact_methods`.
- **`accommodation_external_ids`** (accommodation_id, source, external_id, url) para el splicing RNT/OSM/Wikidata; índice único por (source, external_id).
- **`contact_methods` fila-por-valor**: `is_active` (uno por canal) + alternativas vivas y `needs_review` para conflicto a igual nivel; `confidence_id` (verified/inferred/manual) y `source`.
- **`sources`** con jerarquía de precedencia (web_propia 1 > rnt 2 > osm 3 > wikidata 4 > manual 5), `is_review` para la curación manual.
- **`scrape_jobs`** auditable: status, started/finished, items_processed/upserted/failed, log.
- Índices: `idx_accommodations_municipality` (búsqueda por ciudad/municipio), `idx_contact_methods_accommodation`, y lookups de fuente.
- Tablas de catálogo tipo (`accommodation_types`: 7), `contact_channels` (7) y `confidence_levels` (3) como lookup estático.
- Sin ADR necesario: decisiones del esquema derivan directo del dominio (N03) y pipeline (N05), ninguna dura de alto coste moderado.
Type: grilling
Blocked by:

## Question

Fijar el esquema de D1 que materializa el dominio (N03) y el pipeline (N05): las tablas, columnas, claves y constraints que representan Accommodation, ContactMethod, Confidence, Source, ScrapeJob y el cruce de fuentes.

Resolver (con el dominio y el pipeline como input):
- Tablas núcleo: `accommodations` (tipo, nombre, región/municipio, coords DANE/OSM), `contact_methods` (canal, valor, confidence, source, accommodation_id), `sources`/`scrape_jobs` y su estado.
- Cómo se guarda el cruce (mismo accommodation desde RNT + OSM + Wikidata): tabla de identity externa (`external_ids`: source, external_id) vs. sólo columnas.
- Estructura derivada del conflicto: dos ContactMethod del mismo canal con distinto valor → ¿fila activa + filas alternativas con flag `needs_review`?.
- Índices para el SearchResult por ciudad (municipio → accommodations → contact methods ordenados por confidence).
- Migración inicial (SQL DDL) que deje el esquema en un estado listo para el primer ScrapeJob real.
- Decisiones duras que el esquema obliga (p.ej. SURROGATE vs natural keys) → ADR si aplica.