# Domain model: Place, ContactMethod, Source, ScrapeJob

Status: resolved

## Answer

<!-- 2026-09-12, grilling vía la herramienta de preguntas -->

Dominio fijado por decisión del usuario; [CONTEXT.md](../../../../CONTEXT.md) creado.

- **Entidad central**: `Accommodation` (accommodation type como campo, no entidad separada).
- **ContactMethod**: modelo único con canal tipado — teléfono, WhatsApp, email, web, redes, horario de recepción, dirección física.
- **Confidence**: Verified / Inferred / Manual; sin Confidence no se muestra.
- **UI**: contacto primero, dirección/horario secundarios.
- **Fuentes (Source)**: OSM, Wikidata, registro de turismo, web propia, curación manual — jerarquía determinista web propia > registro > OSM > Wikidata; conflicto igual → revision manual.
- **ScrapeJob**: término canónico; CrawlJob = sinónimo deprecated.
- **User/Favorite**: cuentas con favoritos y curación manual de contactos.
- Booking.com y Google Places quedan explícitamente fuera del vocabulario.
Type: grilling
Blocked by:

## Question

Fijar el lenguaje canónico del dominio (vía grilling + domain-modeling): qué es un **Place** (hotel/apartamento/apart-estudio), qué es un **ContactMethod** (teléfono, WhatsApp, email, web, redes), de dónde viene cada contacto (**Source**/provenance y confianza), y el **ScrapeJob**/pipeline que lo alimenta.

Resolver:
- Vocabulario único y no ambiguo → `CONTEXT.md` + ADRs cuando haya una decisión dura.
- Modelo entidad-relación de alto nivel (lugares, contactos, fuentes, trabajos de scraping) y cómo se relacionan.
- Qué cuenta como "contacto directo verificado" frente a "contacto derivado del listado".
- Este ticket hila el esquema D1 (que sale del fog cuando esto se cierra).