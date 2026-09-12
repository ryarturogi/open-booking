# Cloudflare Browser Rendering: viabilidad y coste para scraping

Status: resolved
Type: research
Blocked by:

## Question

Si el scraping de Booking (u otras fuentes web dinámicas) es viable, ¿es Cloudflare Browser Rendering (Workers + Playwright) la vía correcta, y a qué coste/límites?

Resolver:
- Estado actual de Browser Rendering en Workers: límites por minuto/día, plan gratuito vs de pago, sesiones/manejo de proxy.
- Alternativas comparadas: Workers + fetch directo, proxies de scraping dedicados, VPS/Playwright autoorquestado.
- Estimación honesta de coste para un catálogo realista (miles de lugares, refresco semanal) y si encaja con un producto gratis/abierto.
- Recomendación técnica del pipeline de extracción para el MVP.

## Answer

### Producto actual (2026)
Browser Rendering se renombró a **Browser Run** (docs: `developers.cloudflare.com/browser-run`). Disponible en Free y Paid. Dos vías: **Quick Actions** (REST, stateless) y **Browser Sessions** (Playwright/Puppeteer/CDP). El endpoint REST sigue con ruta legacy `/browser-rendering/content`. Cambios 2025-2026: pricing desde 20/08/2025; free tier ampliado; límites actualizados Ago 2026.

### Límites y precios (fuentes: /browser-run/limits y /browser-run/pricing, actualizados mid-late 2026)
- **Free**: 10 min de navegador/día (~5 h/mes); 3 navegadores concurrentes; 1 instancia nueva cada 20 s; timeout 60 s (extensible a 10 min con `keep_alive`); Quick Actions 1 req/10 s; `/crawl` 5 trabajos/día × 100 páginas. Marcapasos: errores 429 + `Retry-After`.
- **Paid** (plan Workers $5/mes): horas de navegador sin límite; ~120-200 concurrentes por cuenta; 3 instancias/s; 10 req/s Quick Actions. Sesión sin vida máxima fija mientras haya actividad.
- **Precio Paid**: **10 h de navegador incluidas/mes + 10 navegadores concurrentes** (media mensual del pico diario) incluidas. Exceso: **$0,09/hora de navegador** y **$2,00/navegador concurrente adicional/mes**. Facturación redondea al mes.

### Hallazgo crítico para Booking.com
- Documentación: *"Requests from Browser Run will always be identified as a bot"* (el userAgent no evita bot protection) y *"cannot configure per-request IP rotation. All rendering traffic comes from Cloudflare IP ranges"* (headers `cf-biso-*`). Sin proxy rotatorio integrado.
- Booking.com (probado 2026, `github.com/browser-use/browser-harness`): todo es HTML interactivo protegido por **AWS WAF JS challenge** (crypto puzzle ~1,3 MB, set cookie `aws-waf-token`) + detección comportamental. `fetch` directo NO sirve; requiere navegador real. Riesgo alto de bloqueo por las IPs de Cloudflare. Además Booking suele **ocultar contactos directos** (tel/email) para forzar reservas a través de Booking → ficha de Booking no es la fuente adecuada para el dato diferencial del proyecto.
- Ventaja: Booking **whitelistea sus sitemaps para Googlebot** (`sitembk-hotel-index.xml`, ~45k-50k URLs/página por idioma) → enumerar el catálogo sin navegador es gratis.

### Estimación de coste (catálogo 5.000 lugares, refresco semanal)
- ~10 s/página × 5.000 ≈ **14 h/refresco ≈ 56 h/mes**.
- **Free**: cubre solo ~5 h/mes (~9 % del catálogo). Insuficiente.
- **Paid**: 56 h − 10 h incluidas = 46 h × $0,09 = **~$4,14/mes** en horas; reutilizando sesiones (Durable Objects) y con ≤10 concurrentes, **$0** extra en concurrency; + $5 del plan → **~$9-13/mes total**. Encaja con un producto gratis/abierto: coste trivial.

### Alternativas comparadas
1. **Workers + fetch directo**: gratis; sirve para sitemaps de Booking (Googlebot) y fuentes SSR (webs de hoteles, directorios oficiales). No para la ficha de Booking (WAF). Elegir primero.
2. **Browser Run (Playwright en Workers)**: ~$9-13/mes para el catálogo, cero ops, integrado en Workers. Riesgo: IPs de Cloudflare + headers identificables → probable bloqueo en Booking.
3. **Proxies residenciales + Playwright** (~$1/GB): ~8-10 GB/refresco → ~$32-40/mes. Fiable pero caro para proyecto gratis.
4. **VPS propio + Playwright** (Hetzner ~€5/mes): horas ilimitadas, IP datacenter única (también bloqueable sin rotación), mantenimiento manual.

### Recomendación MVP
1) **Enumerar** el catálogo con fetch normal + user-agent Googlebot sobre los sitemaps de Booking (y directorios oficiales).
2) **Extraer contactos directos de fuentes donde sí están expuestos**: web del propio alojamiento, directorios turísticos oficiales, perfil Google Business. No depender de la ficha de Booking.
3) **Browser Run (paid) como navegador base** cuando el JS sea necesario: sesiones reutilizadas vía Durable Objects, concurrency ≤10, `browser.close()` siempre (evita minutos facturables por idle).
4) Cron semanal con Cron Triggers/Queues y degradación elegante (Retry-After / 429).

**Veredicto**: Browser Rendering/Run **sí**, como infraestructura (barata, cero ops, mismo stack Workers, coste ~$9-13/mes para el catálogo), pero **no como única vía para Booking** por riesgo real anti-bot; el cuello de botella de este proyecto no es el precio sino el anti-bot y que Booking no expone contactos directos.

### Fuentes
- https://developers.cloudflare.com/browser-run/
- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/browser-run/pricing/
- https://developers.cloudflare.com/changelog/post/2025-07-28-br-pricing
- https://developers.cloudflare.com/browser-run/puppeteer/ (userAgent no bypassa bot protection)
- FAQ Browser Run (GitHub cloudflare-docs): sin IP rotation, headers `cf-biso-*`
- https://github.com/browser-use/browser-harness/blob/main/agent-workspace/domain-skills/booking-com/scraping.md (AWS WAF; sitemaps Googlebot)
- https://dataimpulse.com/blog/how-to-scrape-booking (scraping Booking 2026, proxies residenciales)