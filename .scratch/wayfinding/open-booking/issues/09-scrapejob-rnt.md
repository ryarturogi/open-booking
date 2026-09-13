# ScrapeJob RNT: ingesta del dataset de datos abiertos de MinCIT

Status: resolved

## Answer

<!-- 2026-09-12, grilling vía la herramienta de preguntas + ejecución con override -->

ScrapeJob RNT implementado y ejecutado:

- **Origen**: descarga completa del CSV (~94 MB, 679.548 filas ACTIVO) en un único fetch. Cero-pago.
- **Ejecución**: la ingesta completa del CSV NO corre en el Worker. Medido: parsear el CSV completo = ~2.5s de CPU y >128 MB de pico, y el plan Free limita a 10ms CPU/invocación → excedido 200×. Decisión: **import inicial local con** `apps/worker/scripts/import-rnt.mjs` (Node, sin límites) que genera chunks SQL ~1 MB y `wrangler d1 execute open-booking-db --remote --file` los aplica. El Worker queda con **cron limpio** (`0 3 * * 7` = domingo 03:00 UTC) que solo registra el health check (count de accommodations) en logs — no reprocesa el dataset.
- **Filtro**: estado ACTIVO + solo categorías de alojamiento (VIVIENDAS TURÍSTICAS, ESTABLECIMIENTOS DE ALOJAMIENTO TURÍSTICO, OTROS TIPOS DE HOSPEDAJE TURÍSTICOS NO PERMANENTES) → 500.905 de 679.548. Mapeo sub_categoria→type_id (HOTEL→hotel, APARTAMENTO TURÍSTICO→apartamento, APARTAHOTEL→apart-estudio, HOSTAL→hostal, CASA/FINCA TURÍSTICA→bnb-casa-rural, ALBERGUE/REFUGIO→hostel, GLAMPING/CAMPAMENTO/CENTRO VACACIONAL→camping-glamping).
- **Idempotencia**: upsert por `(source='rnt', external_id=codigo_rnt)` vía CTE resolved. Tip: el dataset tiene **433.902 filas duplicadas por CODIGO_RNT** (679k filas → ~232k códigos únicos de alojamiento); el upsert colapsa a ~191k filas únicas.
- **Bug FK encontrado y arreglado**: en el batch original, cuando un external_id ya existía, el segundo statement usaba el UUID nuevo de la fila (nunca creado) → FK fail. Fix: resolver el accommodation_id dentro del segundo statement (CTE), no el UUID aleatorio.
- **Delta mode añadido al script**: `import-rnt.mjs <csv> <out> <existing-codes-json>` (exportar con `wrangler d1 execute --remote --json`) excluye códigos ya en D1 para re-sincronizar sin re-upsertar todo.
- **scrape_jobs** registra cada run: status, items_processed/upserted/failed, log con count_in_db para verificar coherencia.
- **Resultado en D1 remota**: 191.432 accommodations (949 municipios, 7 tipos), 191.432 external_ids rnt, verificados. Código desplegado + commit.
Type: grilling
Blocked by:

## Question

Primer ScrapeJob real: llevar el Registro Nacional de Turismo (dataset `thwd-ivmp` en datos.gov.co, CSV 679k filas / API JSON, sin auth) al esquema D1 recién fijado. Reutilizando la decisión del pipeline: pull + cron, cruce nombre+geo, fila-por-valor, flag activo.

Resolver:
- **Origen**: descarga completa CSV (~23 MB) vs API JSON paginada (50k filas/request → ~14 requests). ¿Descarga única al bucket/workdir y luego slice, o streaming? Con cero-pago y Workers, los límites de CPU/body de fetch importan → recomendación concreto.
- **Tasking**: correr en el Worker con `scheduled` con trigger de cola (Queues) o chunking en un solo `fetch` largo. ¿Cómo se parte el trabajo en runs de ≤30s? (Workers CPU limit).
- **Parse**: CSV fields (codigo_rnt, estado, razon_social, departamento/municipio, categoria/sub_categoria, NIT, habitaciones/camas, ano). Mapeo a `accommodations`, `accommodation_external_ids` (rnt code). Filtro: estado = vigente, categoria ∈ alojamiento (HOTEL/APARTAMENTO/CASA/HOSTAL/APARTAHOTEL/GLAMPING/APART-ESTUDIO).
- **Idempotencia**: upsert por (source='rnt', external_id=codigo_rnt) → nunca duplicar en re-runs; `scrape_jobs` registra cada run.
- **Cadencia**: refresh semanal via scheduled (RNT = lento).
- **Verificación**: qué cuenta como "éxito" de un run (items_processed vs upserted, health check).
- Entregable: DDL de migración 0002 (si hace falta), la implementación del ingestor en `apps/worker`, y su desplegado.