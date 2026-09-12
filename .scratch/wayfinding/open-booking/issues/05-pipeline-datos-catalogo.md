# Pipeline de datos: catálogo desde OSM + Wikidata + registros de turismo → D1

Status: resolved

## Answer

<!-- 2026-09-12, grilling vía la herramienta de preguntas -->

Pipeline decidido para el MVP (Colombia, cero pagos):

- **Ingesta**: pull periódico con cron (workerd `scheduled`), con webhook/push como opción por fuente cuando exista. Cadencia por fuente: registro (p.ej. RNT) más frecuente; OSM/Wikidata lenta (semanal/quincenal).
- **Cruce de fuentes**: coincidencia por nombre normalizado + coordenadas (radio pequeño); se crea un nuevo Accommodation si no coincide y se revisa después. ID externo (OSM/Wikidata) como refuerzo cuando exista.
- **Conflicto de canales**: precedencia **Confidence primero, luego fecha** (Verified > Inferred/Manual; dentro del mismo nivel gana el más reciente). Conflicto a igual nivel → flag `needs_review` y en UI se muestran ambos con su Confidence.
- **Secundarios**: dirección y horario se rellenan de OSM/Wikidata solo como fallback, nunca sobreescriben a la fuente principal.
- **Crawl web propia**: fetch SSR + regex (email/tel/WhatsApp/redes); Browser Rendering SOLO como fallback en webs dinámicas, y solo dentro del free tier (~10 browser-min/día, ~300 min/mes).
- **Cobertura MVP**: Colombia. Fuentes: **RNT (MinCIT)** + **OSM** + **Wikidata** (enriquecimiento) + **web propia** (crawl). Sin Google Places ni Booking (ya ruled out).
- **Presupuesto**: **cero coste** — ninguna herramienta de pago. Solo free tiers de Cloudflare.
- **Sin contacto directo**: el alojamiento se lista igualmente (tipo, nombre, geo, web si se encontró) con etiqueta **"contacto pendiente"** invitando a curación manual.

Fecha de verificación pendiente: accesibilidad del **RNT** como datos abiertos (delegada a research).
Type: grilling
Blocked by: 03

## Question

Decidir cómo se construye y mantiene el catálogo de open-booking con las fuentes que el research declaró viables — OSM + Wikidata como base, registros de turismo abiertos para el contacto oficial, y crawl de la web propia del alojamiento como enriquecimiento.

Resolver:
- Orden y mecanismo de ingesta: workers/colas que leen OSM/Wikidata/registros → normalizan → D1. ¿Pull periódico, push, refresh semanal?
- Cómo se cruzan fuentes para un mismo Place (coincidencia por nombre+geo) y qué fuente gana ante conflicto (confianza/verificación).
- Dónde entra el crawl de webs propias (Worker + fetch directo o Browser Rendering solo donde haga falta) y cómo se extrae teléfono/email/WhatsApp de la web.
- Qué mide el caso realista del pipeline: volumen, frecuencia, cuota de Browser Rendering dentro de los $9–13/mes estimados.
- Este ticket depende del "Domain model" (N03): sin Place/ContactMethod fijados no hay esquema D1 que llenar.