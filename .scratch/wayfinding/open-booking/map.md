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

## Not yet specified

- **Monetización/viabilidad** — free: ¿donaciones, licencia del dataset, afiliación, verificación premium?
- **Verificación y refresco de contactos** en el tiempo (contactos caducan).
- **Ranking de resultados, i18n, UI/design system, GDPR + opt-out** para lugares que no quieran salir.

## Out of scope

- Sistema de reservas o pagos (el objetivo es el contacto directo).
- App móvil nativa.
- Venta de datos a terceros.