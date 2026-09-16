/**
 * open-booking worker — RPC de búsqueda por ciudad + jobs (RNT salud, OSM contactos).
 * Ticket 10 (búsqueda): GET /api/search?city=bogota&limit=50&offset=0
 * Ticket 11 (OSM): cron 30 3 * * 7 + dispatch manual POST /__cron/osm (no publicado; testing).
 * El match de ciudad es dependency-free: se trae la lista de municipios (949),
 * se normaliza (case + acentos) y se puntúa en memoria; por eso aquí no se usa
 * LIKE ni collations de SQLite.
 */

import { runOsmJob } from "./osm";
import { authRouter, readSession } from "./auth";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/__health") {
      return new Response("ok", { status: 200 });
    }
    if (url.pathname === "/api/search") {
      return searchHandler(request, url, env);
    }
    if (url.pathname.startsWith("/api/accommodations/") && request.method === "GET") {
      return accommodationHandler(request, url, env);
    }
    const authRes = await authRouter(request, url, env);
    if (authRes) return authRes;
    if (url.pathname === "/__cron/osm") {
      if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
      const secret = url.searchParams.get("secret");
      if (!env.OSM_JOB_SECRET || secret !== env.OSM_JOB_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      ctx.waitUntil(
        (async () => {
          try {
            const summary = await runOsmJob(env);
            await recordJob(env, "osm", "done", summary);
          } catch (err) {
            console.error("[osm] job failed:", err);
            await recordJob(env, "osm", "failed", { error: String(err) });
          }
        })(),
      );
      return new Response("osm job started", { status: 202 });
    }
    return new Response("open-booking worker", { status: 200 });
  },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const normalize = (s) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Similitud substring: cuántos tokens del término aparecen (como prefijo) del
// candidato normalizado. Dependency-free, suficiente para 949 municipios.
function scoreMatch(term, candidate) {
  if (candidate === term) return 1000;
  if (candidate.startsWith(term)) return 500 + term.length;
  if (candidate.includes(term)) return 200;
  const termTokens = term.split(" ");
  const hits = termTokens.filter((t) => t && candidate.includes(t)).length;
  return hits * 50;
}

async function listMunicipalities(env) {
  // KV cache: 0 lecturas D1 por búsqueda (el GROUP BY de 191k era brutal para el plan Free).
  const cacheKey = "muni:v1";
  const cached = await env.OPEN_BOOKING_KV.get(cacheKey);
  if (cached) {
    return new Map(Object.entries(JSON.parse(cached)));
  }
  const { results } = await env.open_booking_db
    .prepare("SELECT municipality AS m, COUNT(*) AS n FROM accommodations GROUP BY municipality")
    .all();
  const index = new Map(); // normalized -> { name, count }
  for (const r of results) index.set(normalize(r.m), { name: r.m, count: r.n });
  await env.OPEN_BOOKING_KV.put(cacheKey, JSON.stringify(Object.fromEntries(index)), {
    expirationTtl: 86400, // 24h; invalidar al re-importar RNT
  });
  return index;
}

async function searchHandler(request, url, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rawQuery = url.searchParams.get("city") ?? "";
  const term = normalize(rawQuery);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  if (!term) {
    return json({ error: "missing city", query: rawQuery }, 400);
  }

  const index = await listMunicipalities(env);
  const hit = index.get(term);

  // Sin match exacto: si hay un prefijo fuerte e inequívoco, se auto-resuelve
  // (ej. "bogota" → "BOGOTA D.C."). Si no, se devuelven candidatos.
  if (!hit) {
    const [best, second] = [...index.entries()]
      .map(([norm, m]) => ({ norm, m, s: scoreMatch(term, norm) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.m.count - a.m.count);
    if (best && best.s >= 500 && (!second || second.s < 400)) {
      return resultsResponse({ m: best.m, total: best.m.count });
    }
    const matches = [best, second, ...(best || second ? [undefined] : [])]
      .filter(Boolean)
      .slice(0, 8)
      .map(({ m }) => ({ municipality: m.name, count: m.count }));
    return json({ query: rawQuery, normalized: term, total: 0, limit, offset, items: [], matches });
  }
  return resultsResponse({ m: hit, total: hit.count });

  async function resultsResponse({ m, total }) {
    const municipality = m.name;

    const { results: rows } = await env.open_booking_db
      .prepare(
        `SELECT a.id, a.name, a.slug, t.slug AS type, a.municipality, a.lat, a.lon,
                (SELECT COUNT(*) FROM contact_methods cm
                  WHERE cm.accommodation_id = a.id AND cm.is_active = 1) AS contact_count
         FROM accommodations a JOIN accommodation_types t ON t.id = a.type_id
         WHERE a.municipality = ?
         ORDER BY contact_count DESC, t.id ASC, a.name ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(municipality, limit, offset)
      .all();

    const ids = rows.map((r) => r.id);
    const contactsByAcc = new Map();
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      const { results: contacts } = await env.open_booking_db
        .prepare(
          `SELECT cm.accommodation_id AS acc, cc.slug AS channel, cm.value, cl.slug AS confidence,
                  cm.source, cm.needs_review
           FROM contact_methods cm
           JOIN contact_channels cc ON cc.id = cm.channel_id
           JOIN confidence_levels cl ON cl.id = cm.confidence_id
           WHERE cm.accommodation_id IN (${placeholders}) AND cm.is_active = 1
           ORDER BY cl.id ASC, cc.id ASC`,
        )
        .bind(...ids)
        .all();
      for (const c of contacts) {
        const list = contactsByAcc.get(c.acc) ?? [];
        list.push({
          channel: c.channel,
          value: c.value,
          confidence: c.confidence,
          source: c.source,
          needsReview: c.needs_review === 1,
        });
        contactsByAcc.set(c.acc, list);
      }
    }

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.type,
      municipality: r.municipality,
      lat: r.lat,
      lon: r.lon,
      contactPending: !(r.contact_count > 0), // N05: label "contacto pendiente"
      contacts: contactsByAcc.get(r.id) ?? [],
    }));

    return json({
      query: rawQuery,
      normalized: term,
      municipality,
      total,
      limit,
      offset,
      items,
      matches: [],
    });
  }
}

async function accommodationHandler(request, url, env) {
  const slug = url.pathname.slice("/api/accommodations/".length).toLowerCase();
  if (!slug || slug.includes("/")) return json({ error: "missing slug" }, 400);

  const rows = await env.open_booking_db
    .prepare(
      `SELECT a.id, a.name, a.slug, a.type_id, t.slug AS type, a.municipality, a.lat, a.lon
       FROM accommodations a
       LEFT JOIN accommodation_types t ON t.id = a.type_id
       WHERE a.slug = ? ORDER BY a.name LIMIT 1`,
    )
    .bind(slug)
    .all();
  const row = rows.results?.[0];
  if (!row) return json({ error: "not found" }, 404);

  const contactRows = await env.open_booking_db
    .prepare(
      `SELECT cm.id, cm.channel_id, c.slug AS channel, cm.value, cm.is_active,
              cl.slug AS confidence, cm.source, cm.needs_review
       FROM contact_methods cm
       JOIN contact_channels c ON c.id = cm.channel_id
       JOIN confidence_levels cl ON cl.id = cm.confidence_id
       WHERE cm.accommodation_id = ? AND cm.is_active = 1
       ORDER BY cm.confidence_id ASC, c.id ASC`,
    )
    .bind(row.id)
    .all();
  const contacts = (contactRows.results ?? []).map((c) => ({
    id: c.id,
    channel: c.channel,
    value: c.value,
    confidence: c.confidence,
    source: c.source,
    needsReview: !!c.needs_review,
  }));

  let favorited = false;
  if (env.AUTH_SECRET) {
    const userId = await readSession(request.headers.get("Cookie"), env.AUTH_SECRET);
    if (userId) {
      const fav = await env.open_booking_db
        .prepare("SELECT 1 FROM favorites WHERE user_id = ? AND accommodation_id = ?")
        .bind(userId, row.id)
        .first();
      favorited = !!fav;
    }
  }

  return json({
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    municipality: row.municipality,
    lat: row.lat,
    lon: row.lon,
    contactPending: contacts.length === 0,
    contacts,
    favorited,
  });
}

async function handleScheduled(event, env) {
  const name = event.cron ?? "manual";
  console.log(`[scrapejob] trigger: ${name}`);

  // Cron 2 (30 3 * * 7): job OSM de contactos. Cron 1 (0 3 * * 7): solo salud.
  if (name === "30 3 * * 7") {
    try {
      const summary = await runOsmJob(env);
      await recordJob(env, "osm", "done", summary);
    } catch (err) {
      console.error("[osm] job failed:", err);
      await recordJob(env, "osm", "failed", { error: String(err) });
    }
    return;
  }
  await recordHealth(env, name);
}

async function recordJob(env, slug, status, summary) {
  try {
    const src = await env.open_booking_db
      .prepare("SELECT id FROM sources WHERE slug = ?")
      .bind(slug)
      .first();
    if (!src) return;
    await env.open_booking_db
      .prepare(
        "INSERT INTO scrape_jobs (id, source_id, status, started_at, finished_at, items_processed, items_upserted, items_failed, log) VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, ?, 0, ?)",
      )
      .bind(
        crypto.randomUUID(),
        src.id,
        status,
        summary?.elements ?? 0,
        summary?.matched ?? 0,
        JSON.stringify(summary).slice(0, 900),
      )
      .run();
  } catch (err) {
    console.error(`[scrapejob] recordJob failed:`, err);
  }
}

async function recordHealth(env, name) {
  try {
    const first = await env.open_booking_db
      .prepare("SELECT count(*) AS n FROM accommodations")
      .first();
    console.log(`[scrapejob] health cron=${name} accommodations=${first?.n ?? 0}`);
  } catch (err) {
    console.error(`[scrapejob] health check failed:`, err);
  }
}