# Provisionar cuenta Cloudflare + scaffold del monorepo Astro 7

Status: resolved

## Answer

<!-- 2026-09-12, task ejecutada -->

Land listo y provisto con la cuenta `ryarturogi`:

- **gh**: activada la cuenta `ryarturogi`.
- **wrangler**: la config global quedó en la cuenta **ryarturogi** (`r.arturogi@gmail.com`, account id `9bc8d3c6220c0aad2065bd4a0f5bca5d`). Ojo: el token estaba expirado y la caché de cuenta apuntaba a carbonweb (`~/.wrangler/` + `node_modules/.cache/wrangler/wrangler-account.json`) — se purgó y el token se refrescó vía `wrangler whoami`.
- **Monorepo pnpm**: `apps/web` (Astro 7.3.2 + `@astrojs/cloudflare` 14.3.1, output server), `apps/worker` (Worker con `scheduled`/`fetch`, bindings D1+KV).
- **Infra CF**:
  - D1 `open-booking-db` → id `e643b921-b1fb-43c2-ac83-b45bdb25159c` (region ENAM).
  - KV `OPEN_BOOKING_KV` → id `4d0eed9a30894a84a06e208d9c44f9e5`.
  - KV `SESSION` auto-provisionado por el adapter.
- **Desplegado**:
  - web: https://open-booking.r-arturogi.workers.dev (HTTP 200)
  - worker: https://open-booking-worker.r-arturogi.workers.dev (health `ok`)
- **Repo**: https://github.com/ryarturogi/open-booking (público, MIT, `main`).
- Nota: `pnpm` warnía por build scripts — se movió `onlyBuiltDependencies` a `pnpm-workspace.yaml`.
Type: task
Blocked by:

## Question

Preparar el terreno sobre el que aterrizan el resto de decisiones: repo, monorepo pnpm (Astro 7 + Workers), y un shell desplegado en Cloudflare.

Con la cuenta **`ryarturogi`** en `gh` y `wrangler`:
- Crear repo público `open-booking` en GitHub y clonarlo aquí (`.git` + README + MIT license).
- `pnpm create` monorepo con `apps/web` (Astro 7 + `@astrojs/cloudflare`) y `apps/worker`.
- `wrangler login` con `ryarturogi`; crear D1 (`open-booking-db`) y namespace KV; dejarlos en `wrangler.toml`.
- Desplegar el shell vacío (Astro hello-world) a Cloudflare Workers para verificar que todo el pipeline (login → create → deploy) funciona con esta cuenta.
- Si algo falla (auth, cuota, dominios), registrar el hecho concreto: eso alimenta decisiones posteriores.