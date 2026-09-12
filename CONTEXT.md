# Open-booking

Directorio abierto y gratuito de contactos directos de alojamientos. Sin intermediación (reservas/pagos); el usuario busca por ciudad y contacta directo.

## Language

### Core

**Accommodation**:
Entidad central del catálogo — cualquier establecimiento de alojamiento (hotel, apartamento, apart-estudio, etc.). 
_Avoid_: Place (colisiona con la fuente OSM), Listing (suena a plataforma OTA), Lugar, Alojamiento (ambiguo).

**AccommodationType**:
Categoría de un Accommodation. Valores: Hotel, Apartamento, Apart-estudio, Hostal/Pensión, B&B/Casa rural, Hostel, Camping/Glamping.

**ContactMethod**:
Cada vía de contacto que una Accommodation expone al usuario. Modelo único con campo de tipo. 
Tipos de canal: Teléfono, WhatsApp, Email, Web, Redes, Horario de recepción, Dirección física.
_Avoid_: PhoneNumber, EmailAddress, Website (entidades separadas por canal).

**Confidence**:
Nivel de veracidad de un ContactMethod. Valores: Verified (oficial — web propia o registro turismo) / Inferred (derivo de listado de tercero) / Manual (curación humana).
Sin Confidence = no se muestra.

**Contact first, rest secondary**:
La interfaz prioriza los métodos de contacto directo (tel/WhatsApp/email/web/redes). Dirección y horario se muestran como datos secundarios si la fuente los provee, no como protagonists.

### Sources

**Source**:
Fuente de datos de la que procede un ContactMethod. Canónicas (jerarquía de resolución de conflicto):
1. **Web propia** — crawleo del sitio web del alojamiento. Gana siempre; mayor calidad.
2. **Registro turismo** — fichas oficiales de organismos públicos (CC). Verificado; gana a fuentes automáticas.
3. **OSM (OpenStreetMap)** — base geográfica; teléfono/web parciales. Gana a Wikidata.
4. **Wikidata** — enriquecimiento CC0; cobertura menor. No gana a nadie.
5. **Curación manual** — aporte de usuarios; misma jerarquía que el canal del que provenga.
Conflicto igual → flag de revisión manual.
_Avoid_: Booking, Google Places (no son fuentes viables; ruled out en el research).

**ScrapeJob**:
Proceso que extrae datos de una Source y los introduce en el catálogo. Ejemplo: "crawl semanal de registros de turismo de Navarra". 
_Avoid_: CrawlJob (sinónimo deprecated del ticket original).

### User accounts

**User**:
Cuenta con email/password que guarda favoritos y edita contactos (curación manual).

**Favorite**:
Relación Many-to-Many entre User y Accommodation. Simple flag; no tiene lógica propia.

### Resultado de búsqueda

**SearchResult**:
Resultado de buscar por ciudad. Devuelve Accommodations con sus ContactMethods ordenados por relevancia/Confidence. City search = noun; no se guarda como entidad — se ejecuta vía D1 queries.
_Avoid_: Query, PlaceResult.

## Rules

- **Solo fuentes viables (post-research)**: OSM, Wikidata, registros de turismo, web propia, curación humana. Booking.com y Google Places están ruled out (ToS, coste, caches de datos).
- **Confianza importa**: todo contacto tiene Confidence. Se mostraba Verified primero en la UI.
- **Jerarquía de fuentes es determinista**: web propia > registro turismo > OSM > Wikidata. Curación manual hereda la del canal original.
- **Sin reservas ni pagos**: el producto termina en el contacto directo del usuario. El importe/reserva es responsabilidad del hotel y el cliente.