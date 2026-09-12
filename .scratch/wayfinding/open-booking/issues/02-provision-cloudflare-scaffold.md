# Provisionar cuenta Cloudflare + scaffold del monorepo Astro 7

Status: claimed
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