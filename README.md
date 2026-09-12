# open-booking

Directorio abierto y gratuito de **contactos directos** de alojamientos. Sin intermediación: buscas por ciudad, ves el alojamiento y contactas directo con el hotel, apartamento o apart-estudio. Sin reservas, sin comisiones, sin pagos.

## Stack

- **Astro 7** + `@astrojs/cloudflare` (sitio SSR)
- **Cloudflare Workers** — D1 (datos), KV (caché), Queues (ingesta), Browser Rendering (scraping puntual)
- **pnpm** monorepo

## Estructura

```
apps/
  web/      # Astro 7 (frontend + SSR)
  worker/   # ScrapeJob / ingesta de fuentes
```

## Fuentes de datos

Post-research, las fuentes viables son: OpenStreetMap, Wikidata, registros oficiales de turismo, la web propia del alojamiento y curación manual. Booking.com y Google Places quedaron descartados (ToS, coste, caché de datos).

## Desarrollo

```bash
pnpm install
pnpm dev
```

## Licencia

MIT — ver [LICENSE](./LICENSE).
