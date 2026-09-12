# Accesibilidad del RNT (MinCIT) como datos abiertos

Status: resolved
Type: research
Blocked by: 05

## Question

El Registro Nacional de Turismo (RNT) de Colombia, gestionado por el Ministerio de Comercio, Industria y Turismo (MinCIT), fue elegido como fuente principal de contacto oficial. ¿Es accesible como datos abiertos?

Resolver:
- ¿Existe descarga/dataset público del RNT (archivo CSV/Excel, API, sitio oficial de consulta)? ¿URLs concretas y formato?
- ¿Qué campos incluye (nombre del establecimiento, tipo, ubicación/ciudad, teléfono, email, web, RNT#)?
- ¿Fecha de actualización y cadencia conocida?
- ¿Condiciones de uso/restricciones para republicar los contactos (licencia, ToS)?
- Ventana de consulta tolerante a bots (¿bloquea? ¿hay log-in?).
- Si no es viable: ¿qué alternativa oficial colombiana hay (p.ej. otros listados de prestadores por departamento)?

## Answer

**Veredicto: SÍ, el RNT es accesible como datos abiertos con descarga masiva, PERO no incluye datos de contacto directo (teléfono/email/web/dirección).** Sirve como columna vertebral de identidad + ubicación + tipo + RNT#; los ContactMethods deben venir de enriquecimiento (web propia, OSM, Wikidata, curación).

### 1. Dataset / API público
- Portal Datos Abiertos Colombia (Socrata, publicado por MinCIT): https://www.datos.gov.co/Comercio-Industria-y-Turismo/Registro-Nacional-de-Turismo-RNT/thwd-ivmp
- **Descarga completa CSV (~23.6 MB, 679.548 filas)**: https://www.datos.gov.co/api/views/thwd-ivmp/rows.csv?accessType=DOWNLOAD
- API Socrata JSON (filtros/paginación, sin auth): `https://www.datos.gov.co/resource/thwd-ivmp.json` (`$limit`, `$offset`, `$where`, `$select·$group`)
- Consulta oficial pública (Confecámaras, SPA Angular: no apta para bulk): https://rnt.confecamaras.co/establecimientos
- Panel BI de MinCIT (tablas HTML queryables por filtro en URL, sin login): https://servicios.mincit.gov.co/rnt-bi/nuevosmensual_list.php?f=(SUBCATEGORIA~equals~HOTEL)

### 2. Campos del dataset (14 columnas)
`codigo_rnt` (RNT#), `estado_rnt` (ACTIVO), `razon_social_establecimiento` (nombre), `departamento`, `cod_dpto`, `municipio`, `cod_mun` (DANE), `nit`, `categoria` (p.ej. ESTABLECIMIENTOS DE ALOJAMIENTO TURÍSTICO), `sub_categoria` (HOTEL, APARTAMENTO TURÍSTICO, CASA TURÍSTICA, HOSTAL, APARTAHOTEL, CENTRO VACACIONAL, GLAMPING, FINCAS TURÍSTICAS… → mapean a AccommodationType), `habitaciones`, `camas`, `num_emp1`, `ano`.
**No hay teléfono, email, web ni dirección.** Un registro por prestador por año de vigencia.

### 3. Cadencia
- Sin cadencia documentada en el portal. Vigencia anual (renovación 1 ene–31 mar), por eso hay filas/establecimiento/año (2019–2026; ~120.400 filas para 2026).
- Último refresh detectado: `rowsUpdatedAt = 2026-07-08` (datos <3 meses al momento de este research). MinCIT publica "Nuevos" mensualmente en el panel BI.

### 4. Licencia / condiciones
**Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)**: https://creativecommons.org/licenses/by-sa/4.0/legalcode
- Permite uso comercial y republicación con atribución. Obligación: cualquier obra derivada debe distribuirse bajo la **misma licencia** (share-alike). Marco colombiano: Ley 1712/2014 de transparencia.
- **Implicación para el producto**: el dataset RNT derivado (tabla de Accommodations) deberá publicarse como CC BY-SA y atribuir a MinCIT.

### 5. Tolerancia a bots
- **datos.gov.co (Socrata)**: sin auth, sin captcha; descarga completa probada (HTTP 200). Límite estándar Socrata (~50k filas/request sin token). Vía recomendada.
- **rnt.confecamaras.co**: SPA Angular; el HTML no trae datos (requiere navegador headless); captcha no detectado en el shell pero no apto para extracción masiva.
- **BI de MinCIT** (`servicios.mincit.gov.co/rnt-bi`): tablas públicas filtrables por URL, sin login; funcionó con curl, pero no es el canal canónico.

### 6. Alternativa (no necesaria para el backbone, sí para contactos)
- RNT cubre identidad/ubicación/tipo; para **contactos directos** no existe fuente RNT: enriquecer con web propia (scrapeo), OSM y Wikidata, y curación manual.
- Complementos oficiales si se quisieran validar: ProColombia, DATUR y listados de secretarías de turismo departamentales (Vichada/La Guajira con cobertura RNT menor).