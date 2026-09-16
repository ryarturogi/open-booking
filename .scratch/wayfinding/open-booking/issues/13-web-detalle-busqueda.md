# Detalle de alojamiento + búsqueda en la web (primera UI)

Status: resolved
Type: grilling
Blocked by: 10, 12
Resolved: 2026-09-13

## Answer

<!-- grilling vía herramienta de preguntas, todas las opciones recomendadas -->

**Arquitectura (BFF)**: **Astro hace de proxy** de `/api/*` al data-worker (`DATA_WORKER_URL`): el middleware reenvía method/headers (Cookie) y devuelve la respuesta pasando `Set-Cookie`. La cookie del browser vive en el dominio del sitio (open-booking web), nunca se expone al worker directamente. El web **no** toca D1/KV: solo reenvía. Todo el estado auth viaja en `open-booking.r-arturogi.workers.dev`.

**Detalle**: endpoint nuevo **`GET /api/accommodations/:slug`** en el worker (DTO extendido con contacts + favorite). Página Astro **`/a/[slug].astro`**; la URL del resultado enlaza a `/a/<slug>`. Trade-off registrado: slugs pueden colisionar entre municipios (poco frecuente en MVP); se desambigua antes en un ticket SEO futuro.

**Búsqueda**: página `/` con **form GET** → `/` ?`?q=` resuelve en **SSR puro**: Astro llama `/api/search` y renderiza la lista. Sin JS para resultados; islands solo cuando haga falta.

**Favorito**: **form POST sin JS** → `/api/favorites/:id` (proxy). El middleware hace **PRG**: tras el POST al worker (que alterna toggle), responde `303` a `Referer`. El endpoint worker convierte en **toggle único** (POST = insert si no existe, delete si existe; respuesta `{favorited}`).

**Estilos**: **CSS vanilla ligero** en `base.css`, system fonts, SSR-first, español fijo.

Nota fog heredada: "UI/design system, i18n, GDPR + opt-out" y "Buscar por ciudad indexación".