# Búsqueda por ciudad: SearchResult en D1

Status: resolved

## Answer

<!-- 2026-09-13, grilling vía la herramienta de preguntas + ejecución -->

SearchResult vía **Worker RPC**: `GET /api/search?city=bogota&limit=50&offset=0` (desplegado en open-booking-worker).

- **Matching city**: normalizar (lowercase + strip acentos, dependency-free) contra los 949 municipios únicos (cache en memoria por request). Match exacto → resolve; prefijo fuerte e inequívoco (`startsWith`, sin segundo candidato a <400) → **auto-resuelve** (ej. "bogota"→"BOGOTA D.C.", "medellin"→"MEDELLIN"); ambiguo → `matches` (top 8 candidatos con count, ej. "san"→SANTA MARTA/SAN ANDRES).
- **Query**: `WHERE municipality = ?` (índice) + subquery `contact_count` por accommodation (contact_methods activos), `ORDER BY contact_count DESC, t.id ASC, a.name ASC`. Contactos del page via `IN (...)`, filtrados is_active=1, ordenados confidence ASC → channel.
- **DTO SearchResult** (flat, paginada): `{ query, normalized, municipality, total, limit, offset, items[], matches[] }`. Item: `{ id, name, slug, type, municipality, lat, lon, contactPending, contacts[{channel,value,confidence,source,needsReview}] }`.
- **contactPending** = no hay contactos activos: label "contacto pendiente" (N05).
- Paginación limit (default 50, max 200) / offset, con `total` real.
- **Verificado en prod con datos RNT**: bogota→20.093 (hoteles primero), medellin→20.577, cartagena→20.539, buenaventura→388. Dato live: todas las filas RNT sin contactos → contactPending:true hasta que lleguen los jobs de contactos (fog).
- Sin KV cache aún (listado de municipios = 1 query aggregate). La web Astro consume este RPC vía fetch SSR.