/**
 * ScrapeJob OSM — contactos directos desde Overpass (ticket 11).
 * Match con el catálogo RNT: nombre normalizado + municipio; si no hay match,
 * accommodation standalone con external_id osm. Solo objetos con contactos.
 * confidence = inferred; purga de contactos OSM no vistos en el último run.
 */

const COLOMBIA_BBOX = "-4.23,-79.05,12.51,-66.80";

// Prefijos internacionales de países vecinos: si el teléfono los trae, no es CO.
const FOREIGN_PHONE = /^[+(]\s*(?:593|51|507|58|506|504|502|503|52)\b/;

const TOURISM_TO_TYPE = {
  hotel: 1,
  hostel: 6,
  guest_house: 5,
  apartment: 2,
  camp_site: 7,
  caravan_site: 7,
  motel: 4,
  bed_and_breakfast: 5,
  chalet: 5,
};

const CONTACT_KEYS = [
  "phone",
  "contact:phone",
  "contact:whatsapp",
  "email",
  "contact:email",
  "website",
  "contact:website",
  "instagram",
  "contact:instagram",
  "facebook",
  "contact:facebook",
  "twitter",
  "contact:twitter",
  "opening_hours",
];

export const normalize = (s) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (s) =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "acc";

const esc = (s) => (s ?? "").replace(/'/g, "''");

const CHANNEL = {
  telefono: 1,
  whatsapp: 2,
  email: 3,
  web: 4,
  redes: 5,
  horario: 6,
  direccion: 7,
};
const CONF_INFERRED = 2;

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
      if (attempt === 3) throw new Error(`overpass still failing: ${remark}`);
      await new Promise((r) => setTimeout(r, attempt * 15000));
      continue;
    }
    return d.elements ?? [];
  }
  return [];
}

// Traduce tags OSM → lista de { channel, value }.
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
    "instagram",
    "contact:instagram",
    "facebook",
    "contact:facebook",
    "twitter",
    "contact:twitter",
    "youtube",
    "contact:youtube",
  ]) {
    if (tags[k]) push(CHANNEL.redes, tags[k]);
  }
  push(CHANNEL.horario, tags.opening_hours);
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  if (street) push(CHANNEL.direccion, `${street}, ${tags["addr:city"] ?? ""}`.replace(/, $/, ""));
  return out;
}

async function listMunicipalities(env) {
  const cacheKey = "muni:v1";
  const cached = await env.OPEN_BOOKING_KV.get(cacheKey);
  if (cached) {
    return new Map(Object.entries(JSON.parse(cached)).map(([k, v]) => [k, v.name]));
  }
  const { results } = await env.open_booking_db
    .prepare("SELECT municipality AS m, COUNT(*) AS n FROM accommodations GROUP BY municipality")
    .all();
  const index = new Map();
  const cacheObj = {};
  for (const r of results) {
    index.set(normalize(r.m), r.m);
    cacheObj[normalize(r.m)] = { name: r.m, count: r.n };
  }
  await env.OPEN_BOOKING_KV.put(cacheKey, JSON.stringify(cacheObj), { expirationTtl: 86400 });
  return index;
}

export async function runOsmJob(env) {
  const marker = new Date().toISOString().slice(0, 19).replace("T", " "); // datetime('now') synced, second precision
  console.log("[osm] fetch overpass");
  const elements = await fetchOverpass();
  const munIndex = await listMunicipalities(env);

  const slugCache = new Map();
  const getSlugMap = async (municipality) => {
    if (!slugCache.has(municipality)) {
      const { results } = await env.open_booking_db
        .prepare("SELECT id, slug FROM accommodations WHERE municipality = ?")
        .bind(municipality)
        .all();
      slugCache.set(municipality, new Map(results.map((r) => [r.slug, r.id])));
    }
    return slugCache.get(municipality);
  };

  let standalone = 0,
    matched = 0,
    withoutCity = 0,
    notCo = 0,
    noContact = 0;
  const contactStmts = [];

  const flush = async (stmts) => {
    if (!stmts.length) return;
    await env.open_booking_db.batch(stmts);
    stmts.length = 0;
  };

  const externalId = (el) => `${el.type}:${el.id}`;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const country = tags["addr:country"];
    if (country && country.toUpperCase() !== "CO") {
      notCo++;
      continue;
    }
    const phoneRaw = tags.phone || tags["contact:phone"];
    if (phoneRaw && FOREIGN_PHONE.test(phoneRaw.replace(/\s+/g, ""))) {
      notCo++;
      continue;
    }

    const name = tags.name;
    if (!name) continue;

    const contacts = extractContacts(tags);
    if (!contacts.length) {
      noContact++;
      continue;
    }
    const typeId = TOURISM_TO_TYPE[tags.tourism];
    if (!typeId) continue;

    const addrCityRaw = tags["addr:city"];
    const municipality = addrCityRaw ? munIndex.get(normalize(addrCityRaw)) : undefined;
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    const lon = el.type === "node" ? el.lon : el.center?.lon;

    const slug = slugify(name);
    let accId = null;

    if (municipality) {
      const slugMap = await getSlugMap(municipality);
      accId = slugMap.get(slug) ?? null;
    } else {
      withoutCity++;
    }

    const stmts = [];
    if (accId) {
      matched++;
      const latStmt = lat != null ? `, lat = ${lat}` : "";
      const lonStmt = lon != null ? `, lon = ${lon}` : "";
      stmts.push(
        `UPDATE accommodations SET updated_at = datetime('now')${latStmt}${lonStmt} WHERE id = '${esc(accId)}'`,
      );
      stmts.push(
        `INSERT INTO accommodation_external_ids (accommodation_id, source, external_id) VALUES ('${esc(accId)}', 'osm', '${esc(externalId(el))}') ON CONFLICT(source, external_id) DO NOTHING`,
      );
    } else if (municipality) {
      standalone++;
      const uuid = crypto.randomUUID();
      const latv = lat ?? "NULL";
      const lonv = lon ?? "NULL";
      stmts.push(
        `INSERT INTO accommodations (id, name, slug, type_id, municipality, lat, lon, country_code, created_at, updated_at)
         VALUES ('${uuid}', '${esc(name)}', '${esc(slug)}', ${typeId}, '${esc(municipality)}', ${latv}, ${lonv}, 'CO', datetime('now'), datetime('now'))`,
      );
      stmts.push(
        `INSERT INTO accommodation_external_ids (accommodation_id, source, external_id) VALUES ('${uuid}', 'osm', '${esc(externalId(el))}') ON CONFLICT(source, external_id) DO NOTHING`,
      );
      accId = uuid;
      if (slugCache.has(municipality)) slugCache.get(municipality).set(slug, uuid);
    } else {
      continue;
    }

    for (const c of contacts) {
      stmts.push(
        `INSERT INTO contact_methods (id, accommodation_id, channel_id, value, confidence_id, source, is_active, needs_review, seen_at, created_at)
         SELECT '${crypto.randomUUID()}', '${esc(accId)}', ${c.channel}, '${esc(c.value)}', ${CONF_INFERRED}, 'osm', 1, 0, '${marker}', datetime('now')
         WHERE NOT EXISTS (SELECT 1 FROM contact_methods cm WHERE cm.accommodation_id = '${esc(accId)}' AND cm.channel_id = ${c.channel} AND cm.value = '${esc(c.value)}' AND cm.source = 'osm' AND cm.is_active = 1)`,
      );
      contactStmts.push(true);
    }
    await flush(stmts);
  }
  await flush(contactStmts);

  // El run es autoritativo: desactiva contactos OSM que no aparecieron (caídos).
  const purge = await env.open_booking_db
    .prepare(
      "UPDATE contact_methods SET is_active = 0 WHERE source = 'osm' AND is_active = 1 AND seen_at != ?",
    )
    .bind(marker)
    .run();
  console.log("purge changes:", purge.meta?.changes ?? purge.changes);

  const summary = {
    elements: elements.length,
    matched,
    standalone,
    withoutCity,
    notCo,
    noContact,
    purgeChanges: purge.meta?.changes ?? purge.changes,
    marker,
  };
  console.log("[osm] done", JSON.stringify(summary));
  return summary;
}