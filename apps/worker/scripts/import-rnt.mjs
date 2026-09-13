/**
 * Import inicial del RNT — se ejecuta UNA vez desde local para poblar la D1 remota.
 * Motivo (ticket 09): el plan Free limita la CPU a 10ms/invocación; parsear el CSV
 * completo (~2.5s de CPU + 94MB en memoria) no cabe en un Worker. La carga inicial
 * corre aquí (máquina local, sin límite) y la ingesta incremental futura se decide
 * en ticket propio.
 *
 * Uso:
 *   node scripts/import-rnt.mjs <ruta-csv> <dir-salida-batches>
 *   # luego, por cada chunk .sql:
 *   wrangler d1 execute open-booking-db --remote --file chunks/<n>.sql
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const [, , csvPath = "/tmp/rnt.csv", outDir = "/tmp/rnt_chunks"] = process.argv;

const ALOJAMIENTO_CATEGORIAS = new Set([
  "VIVIENDAS TURÍSTICAS",
  "ESTABLECIMIENTOS DE ALOJAMIENTO TURÍSTICO",
  "OTROS TIPOS DE HOSPEDAJE TURÍSTICOS NO PERMANENTES",
]);

const TIPO_BY_SUBCATEGORIA = {
  HOTEL: 1,
  "APARTAMENTO TURÍSTICO": 2,
  "OTROS TIPOS DE VIVIENDA TURÍSTICA": 2,
  APARTAHOTEL: 3,
  HOSTAL: 4,
  "CASA TURÍSTICA": 5,
  "FINCAS TURÍSTICAS (ALOJAMIENTO RURAL)": 5,
  ALBERGUE: 6,
  REFUGIO: 6,
  "OTROS TIPOS DE HOSPEDAJE TURÍSTICOS NO PERMANENTES": 6,
  GLAMPING: 7,
  CAMPAMENTO: 7,
  "CENTRO VACACIONAL": 7,
};

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const esc = (s) => (s ?? "").replace(/'/g, "''");
const slugify = (s) =>
  (s.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "acc");

const text = readFileSync(csvPath, "utf8");
const rows = parseCsv(text);
const headers = rows[0];
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const col = (r, name) => (r[idx[name]] ?? "").trim();

console.log(`parsed: ${rows.length} filas`);
let sqlAcc = 0, sqlExt = 0, skipped = 0, chunk = 0, stmtsInChunk = 0;
let out = "";
mkdirSync(outDir, { recursive: true });

const flush = () => {
  if (out) {
    writeFileSync(`${outDir}/${chunk}.sql`, out);
    console.log(`chunk ${chunk}.sql (${stmtsInChunk} stmts)`);
    chunk++; out = ""; stmtsInChunk = 0;
  }
};
const push = (stmt) => {
  out += stmt + "\n";
  stmtsInChunk++;
  if (stmtsInChunk >= 2000) flush(); // ~2 stmts por fila → ~1000 filas/chunk (~1MB)
};

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  const estado = col(row, "ESTADO_RNT").toUpperCase();
  const categoria = col(row, "CATEGORIA");
  const sub = col(row, "SUB_CATEGORIA");
  const name = col(row, "RAZON_SOCIAL_ESTABLECIMIENTO");
  const municipality = col(row, "MUNICIPIO");
  const municipalityCode = col(row, "CODIGO_MUNICIPIO");
  const externalId = col(row, "CODIGO_RNT");

  if (estado !== "ACTIVO") { skipped++; continue; }
  if (!ALOJAMIENTO_CATEGORIAS.has(categoria)) { skipped++; continue; }
  const typeId = TIPO_BY_SUBCATEGORIA[sub];
  if (!typeId || !name || !externalId) { skipped++; continue; }

  const uuid = crypto.randomUUID();
  const slug = slugify(name);

  // Mismo SQL que rnt.ts: la CTE resolved reusa el accommodation_id de un código
  // ya visto (duplicados en el CSV) → colapsan a una fila por CODIGO_RNT.
  push(`WITH resolved AS (SELECT accommodation_id FROM accommodation_external_ids WHERE source = 'rnt' AND external_id = '${esc(externalId)}')
INSERT INTO accommodations (id, name, slug, type_id, municipality, municipality_code, country_code, created_at, updated_at)
VALUES (COALESCE((SELECT accommodation_id FROM resolved), '${uuid}'), '${esc(name)}', '${esc(slug)}', ${typeId}, '${esc(municipality)}', '${esc(municipalityCode) || "NULL"}', 'CO', datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug, type_id = excluded.type_id, municipality = excluded.municipality, municipality_code = excluded.municipality_code, updated_at = datetime('now');`);
  push(`WITH resolved AS (SELECT accommodation_id FROM accommodation_external_ids WHERE source = 'rnt' AND external_id = '${esc(externalId)}')
INSERT INTO accommodation_external_ids (accommodation_id, source, external_id)
VALUES (COALESCE((SELECT accommodation_id FROM resolved), '${uuid}'), 'rnt', '${esc(externalId)}')
ON CONFLICT(source, external_id) DO UPDATE SET accommodation_id = excluded.accommodation_id;`);
  sqlAcc++; sqlExt++;
}
flush();
console.log(`accommodations: ${sqlAcc}, external_ids: ${sqlExt}, skipped/ño alojamiento: ${skipped}, chunks: ${chunk}`);

// registro del job maestro (status 'partial' = import manual)
const jobId = crypto.randomUUID();
writeFileSync(`${outDir}/00_job.sql`, `INSERT INTO scrape_jobs (id, source_id, status, started_at, finished_at, items_processed, items_upserted, items_failed, log) SELECT '${jobId}', id, 'done', datetime('now'), datetime('now'), ${sqlAcc}, ${sqlAcc}, 0, 'manual import (node script)' FROM sources WHERE slug = 'rnt';`);
console.log(`job maestro: ${outDir}/00_job.sql`);