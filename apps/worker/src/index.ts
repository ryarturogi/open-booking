/**
 * open-booking worker — RPC de búsqueda por ciudad + job de salud.
 * Ticket 10 (búsqueda por ciudad): GET /api/search?city=bogota&limit=50&offset=0
 * El match de ciudad es dependency-free: se trae la lista de municipios (949),
 * se normaliza (case + acentos) y se puntúa en memoria; por eso aquí no se usa
 * LIKE ni collations de SQLite.
 */

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
  const { results } = await env.open_booking_db
    .prepare("SELECT municipality AS m, COUNT(*) AS n FROM accommodations GROUP BY municipality")
    .all();
  const index = new Map(); // normalized -> { name, count }
  for (const r of results) index.set(normalize(r.m), { name: r.m, count: r.n });
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

async function handleScheduled(event, env) {
  const name = event.cron ?? "manual";
  console.log(`[scrapejob] trigger: ${name}`);
  await recordHealth(env, name);
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