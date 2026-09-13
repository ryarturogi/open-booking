# Open-booking — wayfinder map

## Destination

Un **MVP desplegado** de open-booking: un buscador abierto y gratuito que devuelve, al buscar una ciudad, una lista de lugares de alojamiento (hoteles, apartamentos, apart-estudios) con TODOS sus métodos de contacto directos (teléfono, WhatsApp, email, web, redes), una página de detalle por lugar, y cuentas de usuario con favoritos. Construido y desplegado en Cloudflare (Astro 7 + Workers/D1/KV/Queues). Free y open source. Interfaz en español primero, i18n después.

## Notes

- **Usuarios de plataformas**: `gh` y `wrangler`/Cloudflare operan con la cuenta **`ryarturogi`** — toda provision de infra se hace con ese login.
- **Dominio**: directorio abierto de contacto directo de alojamientos; sin reservas ni pagos — el punto es saltarse la intermediación.
- **Idioma de trabajo**: conversación y docs en español.
- **Stack decidido**: pnpm monorepo, Astro 7 con `@astrojs/cloudflare`, Workers (D1, KV, Queues).
- **Tracker**: local-markdown — `.scratch/wayfinding/open-booking/`.
- **Skills por consultar**: grilling, domain-modeling, research, cloudflare, wrangler, workers-best-practices, durable-objects.
- **Wayfinding = planear, no construir**: salvo override, cada ticket resuelve una decisión. Research (AFK) se resuelve con subagente; el resto (grilling/task HITL) vive una sesión cada uno.

## Decisions so far

- [Legalidad de scrapear Booking y fuentes alternativas de contacto](issues/01-legalidad-scrapear-booking.md) — Scrapear Booking.com es **inviable**: ToS + precedente hiQ + db rights en UE; los teléfonos ni se exponen públicamente. Fuente primaria del MVP: **OSM + Wikidata** (base) + **registros de turismo abiertos** (contacto oficial) + **crawl de la web propia** del alojamiento (enriquecimiento). Booking Demand API prohíbe exactamente lo que este producto hace; Google Places queda fuera por coste/caché.
- [Cloudflare Browser Rendering: viabilidad y coste para scraping](issues/04-browser-rendering-viabilidad.md) — Viables a poco coste: gratis 10 browser-min/día, pago $5/mes + $0.09/h de sobrecoste. Catálogo de 5.000 lugares ≈ **$9–13/mes**, encaja con free/open. El tráfico se identifica como bot (sin rotación de IP) → Booking usa WAF JS: solo para fuentes que lo necesiten, no como vía Booking.
- [Domain model: Place, ContactMethod, Source, ScrapeJob](issues/03-domain-model.md) — Dominio fijado en `CONTEXT.md`: `Accommodation` con tipo, `ContactMethod` único tipado (7 canales), `Confidence` Verified/Inferred/Manual, fuentes con jerarquía determinista (web propia > registro > OSM > Wikidata), `ScrapeJob` canónico. Booking/Google Places fuera del vocabulario.
  - **Esquema D1** ya es ticketable → aterriza en [Pipeline de datos](issues/05-pipeline-datos-catalogo.md), que queda desbloqueado por esta resolución.
- [Provisionar cuenta Cloudflare + scaffold del monorepo](issues/02-provision-cloudflare-scaffold.md) — Terreno listo: gh y wrangler en **ryarturogi**; monorepo pnpm (`apps/web` Astro 7 SSR + `apps/worker` con cron); D1 `open-booking-db` e ID `e643b921-…`, KV `OPEN_BOOKING_KV` e ID `4d0eed9a-…`; desplegado web https://open-booking.r-arturogi.workers.dev y repo público https://github.com/ryarturogi/open-booking (MIT).
- [Pipeline de datos: catálogo desde OSM + Wikidata + registros de turismo → D1](issues/05-pipeline-datos-catalogo.md) — Ingesta pull+cron con cadencia por fuente; cruce por nombre+geo; conflicto Confidence > fecha; dirección/horario OSM como fallback; crawl fetch+regex con Browser Rendering solo free; **cobertura MVP = Colombia** (RNT + OSM + Wikidata + web propia); **cero pagos**; sin contacto → etiqueta "contacto pendiente".
- [Accesibilidad del RNT (MinCIT) como datos abiertos](issues/06-accesibilidad-rnt.md) — RNT accesible como **datos abiertos** en datos.gov.co (Socrata): dataset `thwd-ivmp`, descarga CSV completa (679.548 filas) y API JSON sin auth; 14 campos (nombre, tipo HOTEL/APARTAMENTO/CASA/HOSTAL..., municipio, RNT#, año); licencia **CC BY-SA 4.0** (republicación permitida con atribución + derivado bajo la misma licencia); sin captcha. **IMPORTANTE**: el RNT NO trae teléfono/email/web → solo identidad/ubicación/tipo; los contactos directos vienen de OSM/Wikidata/web propia.
- [Licencia del dataset frente a CC BY-SA del RNT](issues/07-licencia-dataset.md) — Código **MIT**; dataset derivado **CC BY-SA (RNT) + ODbL (OSM)**, Wikidata CC0; repo usa MIT `LICENSE` + `NOTICE.md`; atribución en 3 niveles (página `/atribucion`, footer, por dato en ContactMethod). `NOTICE.md` creado.
- [Esquema D1: accommodations, contactos, fuentes y cruce](issues/08-esquema-d1.md) — DDL en `apps/worker/migrations/0001_initial.sql`: PK UUID, `contact_methods` fila-por-valor con `is_active`+`needs_review`, `accommodation_external_ids` (splicing), `sources` jerarquizados (web_propia>rnt>osm>wikidata>manual), `scrape_jobs` auditados, índice por municipio. Validado localmente.
- [Búsqueda por ciudad: SearchResult en D1](issues/10-busqueda-por-ciudad.md) — Worker RPC `GET /api/search?city=` desplegado y verificado con datos reales (bogota→20.093, medellin→20.577, cartagena→20.539). Match dependency-free normalizado (acentos+case) con auto-resolve de prefijo y `matches` cuando es ambiguo. DTO flat paginado con contactPending + contacts ordenados por confidence. El contorno por ciudad es noun (no entidad).
- [ScrapeJob RNT: ingesta del dataset de datos abiertos de MinCIT](issues/09-scrapejob-rnt.md) — Implementado y ejecutado. **Import inicial local** `apps/worker/scripts/import-rnt.mjs` (chunks SQL + wrangler d1 --remote) porque plan Free (10ms CPU) no cabe parsear los 94MB; el Worker queda con **cron limpio semanal** (`0 3 * * 7`) solo health-check. Filtro alojamiento (500.905 de 679.548), upsert idempotente por CODIGO_RNT (433k duplicados → colapsa), delta mode en el script, mapeo sub_categoria→type. **Datos en D1 remota: 191.432 accommodations** (949 municipios), external ids rnt. Worker desplegado. El refresco incremental queda en fog.
- [ScrapeJob OSM: contactos directos vía Overpass](issues/11-scrapejob-osm.md) — Implementado y staged. Overpass bbox continental CO, filtro `addr:country`+prefijos tel extranjeros, confidence **inferred**, match slug+municipio (o standalone OSM), run **autoritativo** con purga de caídos y inserts idempotentes. Worker con `POST /__cron/osm?secret=` + cron `30 3 * * 7` (desplegado Version aedbf3b3); stage local `scripts/stage-osm.mjs` para el poblamiento inicial sin quemar el límite D1. **Staged 496 alojamientos (~1.600 contactos)** validado en D1 local; **aplicación a remoto pendiente de medianoche UTC** (límite D1 Free agotado, error 7500). Los OSM sin `addr:city` (~2.2k) quedan a fog de reverse-geocoding.
- [Auth + favoritos: cuentas de usuario en el Worker](issues/12-auth-favoritos.md) — Resuelto (grilling): **auth propietario mínimo**, scrypt WebCrypto + cookie **stateless HMAC** (AUTH_SECRET); tablas D1 `users`+`favorites` (migración 0002, PK compuesta); endpoints register/login/logout/me + toggle/listar favoritos; rate-limit KV por email/IP; Sin email_verified ni provider. Implementación pendiente.

## Not yet specified

- **Búsqueda por ciudad** — cómo se indexa ciudad→lugares (D1 queries vs KV) y el ranking por relevancia/Confidence.
- **Refresco incremental del RNT** — re-sincronizar sin reparsear los 94MB (reprocesar solo cambios; el cron semanal es ahora solo health).
- **Reverse-geocoding OSM** — los ~2.2k objetos OSM con contactos pero sin `addr:city` necesitan coords→municipio para entrar al catálogo (hoy quedan excluidos del match por ciudad).
- **ScrapeJob Wikidata** — misma plantilla que OSM, fuente nivel 4 (menor cobertura).
- **Verificación y refresco recursivo** de contactos (los contactos caducan).
- **Monetización/viabilidad** — free/open: donaciones, licencia del dataset, nada por ahora.
- **UI/design system, i18n, GDPR + opt-out** para lugares que no quieran salir.

## Out of scope

- Sistema de reservas o pagos (el objetivo es el contacto directo).
- App móvil nativa.
- Venta de datos a terceros.