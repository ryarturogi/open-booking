/**
 * ScrapeJob — ingesta de fuentes (OSM, Wikidata, registros de turismo, web propia).
 * El job RNT se cablea aquí: se dispara por cron semanal (ver wrangler.toml).
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
    return new Response("open-booking worker", { status: 200 });
  },
};

async function handleScheduled(event, env) {
  const name = event.cron ?? "manual";
  console.log(`[scrapejob] trigger: ${name}`);
  // El import completo del RNT corre desde local (scripts/import-rnt.mjs) porque
  // parsear el CSV de 94MB excede el límite de CPU del plan Free (10ms).
  // El cron solo registra salud del job; si el conteo local/remote difiere, se
  // re-importa manualmente.
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