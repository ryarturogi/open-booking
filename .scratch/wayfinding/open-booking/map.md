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

## Not yet specified

- **Búsqueda por ciudad** — cómo se indexa ciudad→lugares (D1 queries vs KV) y el ranking por relevancia/Confidence.
- **Auth + favoritos** — mecanismo de cuentas (¿Astro Sessions sobre KV? ¿mejor-auth en Worker?) y el perfil de guardado.
- **Verificación y refresco recursivo** de contactos (los contactos caducan).
- **Monetización/viabilidad** — free/open: donaciones, licencia del dataset, nada por ahora.
- **UI/design system, i18n, GDPR + opt-out** para lugares que no quieran salir.

## Out of scope

- Sistema de reservas o pagos (el objetivo es el contacto directo).
- App móvil nativa.
- Venta de datos a terceros.