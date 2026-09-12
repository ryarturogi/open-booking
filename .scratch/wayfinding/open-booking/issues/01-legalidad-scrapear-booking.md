# Legalidad de scrapear Booking y fuentes alternativas de contacto

Status: resolved
Type: research
Blocked by:

## Question

¿Es viable (técnica y legalmente) scrapear Booking.com para extraer contactos directos de alojamientos, o están obligadas las fuentes de datos realistas — APIs oficiales de afiliados, Booking Business API, OpenStreetMap, datos abiertos de turismo, buscadores de teléfono/email — y cuáles son sus costes, límites y calidad de contacto?

Resolver:
- robots.txt y ToS de Booking.com frente al scraping; riesgo legal real de extraer contactos directos (y de quien los republique).
- Alternativas viables para obtener: nombre/lugar, teléfono, email, WhatsApp, web, redes de hoteles/apartamentos.
- Para cada alternativa viable: coste, límites de uso, calidad de los datos de contacto, y encaje con un producto "gratis y abierto".
- Recomendación clara de la fuente primaria para el MVP.

## Answer

### 1. Scrapear Booking.com: riesgo legal y técnico

- **ToS**: la sección 2 de los Términos de Booking.com prohíbe expresamente cualquier acceso automatizado, scraper o robot "con o sin fines comerciales" sin permiso escrito previo. Un directorio que republique contactos extraídos viola el contrato. https://www.booking.com/content/terms.html
- **robots.txt**: no hay bloqueo global para el user-agent genérico, pero sí para bots concretos (p. ej. `psbot` → `Disallow: /`), y siempre hay protección técnica anti-bot (bloqueo de IPs, JS desafiante).
- **Precedente legal (EE.UU.)**: *hiQ vs LinkedIn* — el 9º Circuito (2022) sostuvo que scrapear datos públicos no es violación de la CFAA, pero el juzgado (nov. 2022) declaró ejecutable la cláusula anti-scraping del ToS por incumplimiento de contrato; el caso acabó con juicio de 500.000 USD contra hiQ, orden de borrar todos los datos extraídos e injunction permanente. Es decir: "public data ≠ CFAA", pero **el ToS sí vincula y puede costar dinero + borrado de datos**. https://natlawreview.com/article/linkedin-s-data-scraping-battle-hiq-labs-ends-proposed-judgment
- **En la UE (caso de este proyecto) el riesgo es mayor**: la base de datos de alojamientos de Booking.com probablemente goza del **derecho sui generis de la Directiva de bases de datos 96/9/EC**; extraer y republicar sistemáticamente parte sustancial viola ese derecho. A esto se suma incumplimiento contractual y competencia desleal.
- **Riesgo técnico adicional**: los teléfonos completos NO se exponen en las páginas públicas (botón "Llamar" / número enmascarado), y no hay email público fiable. Aunque fuera legal, scrapear no da los datos buscados.

**Veredicto**: scrapear Booking.com para un directorio de contactos directos NO es viable (ni legalmente recomendable ni productivo): viola ToS, riesgo de derechos de base de datos en UE (España), y los contactos ni siquiera están públicamente disponibles.

### 2. Alternativas realistas y coste/calidad

| Fuente | Coste | Límites | Calidad de contacto | Encaje producto libre/abierto |
|---|---|---|---|---|
| **OpenStreetMap** (`tourism=hotel/hostel/apartment/guest_house` + `website`, `phone`, `email`, `contact:`) | Gratis | Consultas Open Data Commons / Overpass por ciudad; sin límites duros | Nombre/tipo/geo excelentes; teléfono/email parciales (~40-70% según zona); sin WhatsApp | **Óptimo** — base legal y comunitaria |
| **Wikidata** (enlazado vía `wikidata=*` en OSM) | Gratis (CC0) | SPARQL público | P1329 teléfono, P856 web, P968 email, P2019 FB, P2002 IG; cobertura media-baja en hoteles pequeños | **Óptimo** — enriquecimiento legal |
| **Registros de turismo abiertos (España)** | Gratis (licencias CC) | Por CCAA; p. ej. Navarra actualiza diario, CLM semestral | Teléfono reservas, email, web, modalidad/categoría **oficiales** | **Óptimo** — contacto directo oficial por CCAA (no cubre alojamientos no registrados) |
| **Booking.com Demand API** (afiliado vía Commission Junction) | Gratis (comisión) | Requiere aprobación; 100 IDs/request | Devuelve `contacts.general.email/telephone` y datos "trader" (DSA) con teléfono, email y número de licencia | **NO encaja**: el acuerdo afiliado prohíbe copiar contenido, el contacto directo con proveedores y desarrollar servicios/replicas competidoras → terminaría la cuenta |
| **Booking Business/XML feeds** | Cerrado | Solo partners B2B aprobados, sin autoservicio | Alta pero bajo NDA | No accesible |
| **Google Places/Business** | Pagado (~17-32 USD/1.000 tras crédito) | Prohibido cachear/republicar contactos; límites por API key | Teléfono/web oficiales | Mal encaje para republicar |
| **Web oficial de cada alojamiento** (crawl propio) | Coste de scraping/computo | Sin límite legal si respetas robots de cada web | **Mejor calidad** (el propio hotel publica) | Viable como enriquecimiento manual/selector del MVP, no como base masiva |
| **APIs de scraping de pago** (ScrapingBee, etc.) | ~49 USD/mes | Mismo riesgo legal (scrapean Booking) | Depende del proveedor | Descartado por herencia de riesgo |

### 3. Recomendación MVP

**OSM + Wikidata como capa base** (nombre, tipo, dirección, geo, web, redes, teléfono cuando exista) **+ registros de turismo abiertos de la CCAA correspondiente como fuente de contacto directo oficial** (teléfono de reservas, email, web, modalidad) **+ enriquecimiento con la web propia del alojamiento** (teléfono/WhatsApp de contacto). No usar Booking.com (ni pública ni vía API): los términos del afiliado impiden construir justo este producto. Fuentes de referencia: https://wiki.openstreetmap.org/wiki/Tag:tourism=hotel · https://wiki.openstreetmap.org/wiki/Key:contact · https://datosabiertos.navarra.es/es/dataset/alojamientos-inscritos-en-el-registro-de-turismo-de-navarra · https://developers.booking.com/demand/docs/accommodations/look-accommodation-details