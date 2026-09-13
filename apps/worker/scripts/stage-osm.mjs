/**
 * Stage local del ScrapeJob OSM (ticket 11) — patrón N09.
 * Descarga Overpass real, matchea contra el catálogo RNT (leído del CSV) y genera
 * chunks SQL listos para `wrangler d1 execute --file` cuando el límite diario de
 * lecturas D1 del plan Free se restablezca (medianoche UTC).
 *
 * Uso:
 *   node scripts/stage-osm.mjs <dir-salida> [<csv-rnt>]
 *   # luego: for f in /tmp/osm_chunks/*.sql; do wrangler d1 execute open-booking-db --remote --file $f; done
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const csvPath = process.argv[3] ?? "/tmp/rnt_full.csv";
const outDir = process.argv[2] ?? "/tmp/osm_chunks";

// Colombia continental (excluye San Andrés ~ -81.7 para no coger Panamá/Perú/Ecuador
// por el oeste; el archipiélago queda como fog de reverse-geocoding).
const COLOMBIA_BBOX = "-4.23,-79.05,12.51,-66.80";

// Prefijos internacionales de países vecinos: si el teléfono los trae, no es CO.
const FOREIGN_PHONE = /^[+(]\s*(?:593|51|507|58|506|504|502|503|52)\b/;

const TOURISM_TO_TYPE = {
  hotel: 1, hostel: 6, guest_house: 5, apartment: 2, camp_site: 7,
  caravan_site: 7, motel: 4, bed_and_breakfast: 5, chalet: 5,
};

const CONTACT_KEYS = [
  "phone", "contact:phone", "contact:whatsapp", "email", "contact:email",
  "website", "contact:website", "instagram", "contact:instagram",
  "facebook", "contact:facebook", "twitter", "contact:twitter", "opening_hours",
];

const CHANNEL = { telefono: 1, whatsapp: 2, email: 3, web: 4, redes: 5, horario: 6, direccion: 7 };
const CONF_INFERRED = 2;

const normalize = (s) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const slugify = (s) =>
  normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "acc";
const esc = (s) => (s ?? "").replace(/'/g, "''");

function overpassQuery() {
  return `[out:json][timeout:100];
(
  nwr["tourism"~"^(hotel|hostel|guest_house|apartment|camp_site|caravan_site|motel|bed_and_breakfast|chalet)$"](${COLOMBIA_BBOX})[~"phone|contact|email|website|instagram|facebook|twitter|opening_hours"~"."];
);
out center tags;`;
}

async function fetchOverpass() {
  const body = `data=${encodeURIComponent(overpassQuery())}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "open-booking/0.1 (direct accommodation contacts research; r.arturogi@gmail.com)",
      },
      body,
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const d = await res.json();
    const remark = d.remark ?? "";
    if (/rate_limited|exceeded|timed out/i.test(remark)) {
      if (attempt === 3) throw new Error(`overpass: ${remark}`);
      await new Promise((r) => setTimeout(r, attempt * 15000));
      continue;
    }
    return d.elements ?? [];
  }
  return [];
}

function extractContacts(tags) {
  const out = [];
  const push = (channel, value) => {
    const v = (value ?? "").trim();
    if (v) out.push({ channel, value: v });
  };
  push(CHANNEL.telefono, tags.phone || tags["contact:phone"]);
  push(CHANNEL.whatsapp, tags["contact:whatsapp"]);
  push(CHANNEL.email, tags.email || tags["contact:email"]);
  push(CHANNEL.web, tags.website || tags["contact:website"]);
  for (const k of [
    "instagram", "contact:instagram", "facebook", "contact:facebook",
    "twitter", "contact:twitter", "youtube", "contact:youtube",
  ])
    if (tags[k]) push(CHANNEL.redes, tags[k]);
  push(CHANNEL.horario, tags.opening_hours);
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  if (street) push(CHANNEL.direccion, `${street}, ${tags["addr:city"] ?? ""}`.replace(/, $/, ""));
  return out;
}

// Catálogo RNT desde el CSV: ciudad normalizada -> Map(slug -> nombre muestreado).
function loadRntCatalog() {
  const text = readFileSync(csvPath, "utf8");
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
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

  const headers = rows[0];
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const cat = new Set([
    "VIVIENDAS TURÍSTICAS",
    "ESTABLECIMIENTOS DE ALOJAMIENTO TURÍSTICO",
    "OTROS TIPOS DE HOSPEDAJE TURÍSTICOS NO PERMANENTES",
  ]);
  const rntCatalog = new Map(); // normcity -> Map(slug -> { name, city })
  const byCode = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row2 = rows[r];
    const estado = (row2[idx["ESTADO_RNT"]] ?? "").toUpperCase();
    const categoria = (row2[idx["CATEGORIA"]] ?? "").trim();
    const code = (row2[idx["CODIGO_RNT"]] ?? "").trim();
    const name = (row2[idx["RAZON_SOCIAL_ESTABLECIMIENTO"]] ?? "").trim();
    const city = (row2[idx["MUNICIPIO"]] ?? "").trim();
    if (estado !== "ACTIVO" || !cat.has(categoria) || !code || !name || !city) continue;
    if (byCode.has(code)) continue;
    byCode.set(code, { name, city, slug: slugify(name) });
  }
  for (const a of byCode.values()) {
    const nrm = normalize(a.city);
    if (!rntCatalog.has(nrm)) rntCatalog.set(nrm, new Map());
    const m = rntCatalog.get(nrm);
    if (!m.has(a.slug)) m.set(a.slug, a);
  }
  return rntCatalog;
}

async function main() {
  console.log("[osm] fetch overpass");
  const elements = await fetchOverpass();
  console.log(`[osm] elements: ${elements.length}`);
  const rntCatalog = loadRntCatalog();

  mkdirSync(outDir, { recursive: true });
  let chunk = 0, stmtsInChunk = 0, out = "";
  let matched = 0, standalone = 0, withoutCity = 0, noCity = 0, notCo = 0, noContact = 0, unknownType = 0, noName = 0;
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
    if (stmtsInChunk >= 1000) flush();
  };

  const externalId = (el) => `${el.type}:${el.id}`;
  const marker = new Date().toISOString().slice(0, 19).replace("T", " ");

  for (const el of elements) {
    const tags = el.tags ?? {};
    const country = tags["addr:country"];
    if (country && country.toUpperCase() !== "CO") { notCo++; continue; }
    const phoneRaw = tags.phone || tags["contact:phone"];
    if (phoneRaw && FOREIGN_PHONE.test(phoneRaw.replace(/\s+/g, ""))) { notCo++; continue; }
    const name = tags.name;
    if (!name) { noName++; continue; }
    const contacts = extractContacts(tags);
    if (!contacts.length) { noContact++; continue; }
    const typeId = TOURISM_TO_TYPE[tags.tourism];
    if (!typeId) { unknownType++; continue; }

    const cityNrm = normalize(tags["addr:city"]);
    const cityMap = cityNrm ? rntCatalog.get(cityNrm) : undefined;
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lon = el.type === "node" ? el.lon : el.center?.lon;
    const slug = slugify(name);

    if (cityMap && cityMap.has(slug)) {
      // Match RNT → enlazar el osm a la fila existente + contactos.
      matched++;
      const rnt = cityMap.get(slug);
      push(`INSERT INTO accommodation_external_ids (accommodation_id, source, external_id)
SELECT a.id, 'osm', '${esc(externalId(el))}' FROM accommodations a
WHERE a.municipality = '${esc(rnt.city)}' AND a.slug = '${esc(slug)}'
  AND NOT EXISTS (SELECT 1 FROM accommodation_external_ids x WHERE x.source = 'osm' AND x.external_id = '${esc(externalId(el))}')
LIMIT 1;`);
      push(`UPDATE accommodations SET lat = ${lat ?? "lat"}, lon = ${lon ?? "lon"}, updated_at = datetime('now')
WHERE municipality = '${esc(rnt.city)}' AND slug = '${esc(slug)}';`);
      for (const c of contacts) {
        push(`INSERT INTO contact_methods (id, accommodation_id, channel_id, value, confidence_id, source, is_active, needs_review, seen_at, created_at)
SELECT '${crypto.randomUUID()}', a.id, ${c.channel}, '${esc(c.value)}', ${CONF_INFERRED}, 'osm', 1, 0, '${marker}', datetime('now') FROM accommodations a
WHERE a.municipality = '${esc(rnt.city)}' AND a.slug = '${esc(slug)}'
  AND NOT EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.accommodation_id = a.id AND cm.channel_id = ${c.channel} AND cm.value = '${esc(c.value)}' AND cm.source = 'osm' AND cm.is_active = 1)
LIMIT 1;`);
      }
    } else if (cityMap) {
      // Sin match por slug → accommodation standalone OSM (external_id osm).
      standalone++;
      const uuid = crypto.randomUUID();
      const sampleCity = [...cityMap.values()][0].city;
      push(`INSERT INTO accommodations (id, name, slug, type_id, municipality, lat, lon, country_code, created_at, updated_at)
VALUES ('${uuid}', '${esc(name)}', '${esc(slug)}', ${typeId}, '${esc(sampleCity)}', ${lat ?? "NULL"}, ${lon ?? "NULL"}, 'CO', datetime('now'), datetime('now'));`);
      push(`INSERT INTO accommodation_external_ids (accommodation_id, source, external_id) VALUES ('${uuid}', 'osm', '${esc(externalId(el))}');`);
      for (const c of contacts) {
        push(`INSERT INTO contact_methods (id, accommodation_id, channel_id, value, confidence_id, source, is_active, needs_review, seen_at, created_at)
VALUES ('${crypto.randomUUID()}', '${uuid}', ${c.channel}, '${esc(c.value)}', ${CONF_INFERRED}, 'osm', 1, 0, '${marker}', datetime('now'));`);
      }
    } else {
      // Sin municipio RNT: no indexable por ciudad → outsider.
      if (!cityNrm) noCity++; else withoutCity++;
      continue;
    }
  }
  flush();

  const summary = { elements: elements.length, matched, standalone, withoutCity, noCity, noName, notCo, noContact, unknownType, marker, chunks: chunk };
  console.log("[osm] staged:", JSON.stringify(summary, null, 2));
  writeFileSync(`${outDir}/00_summary.json`, JSON.stringify(summary));
  console.log(`[osm] chunks en ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });