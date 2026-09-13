# ScrapeJob de contactos: OSM vía Overpass (Colombia)

Status: resolved
Type: grilling
Blocked by: 08, 10
Resolved: 2026-09-13

## Answer

**Fuente**: Overpass API (`https://overpass-api.de/api/interpreter`, POST), bbox continental Colombia `-4.23,-79.05,12.51,-66.80` (excluye Curazao/San Andrés ↔ países vecinos; archipiélago a fog). Query: `tourism~"^(hotel|hostel|guest_house|apartment|camp_site|caravan_site|motel|bed_and_breakfast|chalet)$"` + filtro keys contacto (`phone|contact|email|website|instagram|facebook|twitter|opening_hours`). Header `User-Agent` descriptivo obligatorio (sin él Overpass responde 406). Retry 3 intentos + backoff 15s ante `rate_limited|exceeded|timed out` en `remark`.

**Cobertura real (staged)**: 3.268 elementos → 141 matched RNT + 355 standalone = **496 alojamientos** (~1.6k contactos). Sólo ~27% de objetos OSM traen `addr:city`; el resto (2.213) queda a fog de reverse-geocoding (coords→municipio). Un fetch país-completo cabe en un POST (payload ~1,4MB); no hace falta por departamento.

**Splicing RNT**: match por `name` normalizado (slug) + `addr:city` normalizado contra `municipality`. Sin match → accommodation **standalone** (external_id osm = `node:<id>`/`way:<id>`). Fuzzy: el slug normalizado ES el fuzzy (lowercase, sin acentos/artículos); a igual nombre en el municipio, `LIMIT 1` para no pisar UNIQUE. Contactos nunca `needs_review` desde OSM (determinista + inferred).

**Confidence**: OSM = nivel 3 → **inferred (2)**, jamás verified. Fuente `'osm'`.

**Ejecución**: worker con ScheduledEvent (cron `"30 3 * * 7"`) + endpoint manual `POST /__cron/osm?secret=` (`OSM_JOB_SECRET` en vars). Filtro de país: `addr:country` ≠ CO se descarta + prefijos telefónicos extranjeros (`FOREIGN_PHONE`): los objetos sin `addr:city` pero con teléfono `(593)`/`(51)` etc. se descartan igualmente. Stage local ad-hoc (`scripts/stage-osm.mjs`, patrón N09) para el primer poblamiento sin quemar el límite D1.

**Delta/refresco**: el run es **autoritativo** — `seen_at` = marker del run; al final `UPDATE contact_methods SET is_active=0 WHERE source='osm' AND is_active=1 AND seen_at != '<marker>'` (purga de contactos caídos). Inserts con `WHERE NOT EXISTS` (idempotente, sin duplicar entre stage y cron). Límite D1 Free (5M lecturas/día) es el techo real del scheduled job; protección económica: KV cache de municipios (24h) + slug map por municipio.

**State**: código en `src/osm.ts` + `scripts/stage-osm.mjs` desplegado (Version aedbf3b3); chunks staged `/tmp/osm_chunks` (3) validados en D1 local (427 ext, 1.201 contactos). **Pendiente por límite D1 (error 7500)**: aplicar chunks a remoto a medianoche UTC + verificar search + run real del cron.

Nota fog heredada: "ScrapeJob OSM/Wikidata para traer contactos" + "web propia" quedó como fuente futura aparte (no confundir).