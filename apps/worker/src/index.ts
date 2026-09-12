/**
 * ScrapeJob — ingesta de fuentes (OSM, Wikidata, registros de turismo, web propia).
 * Shell: solo responde HTTP y marca el arranque. El pipeline real llega con el
 * ticket "Pipeline de datos: catálogo desde OSM + Wikidata + registros → D1".
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/__health') {
      return new Response('ok', { status: 200 });
    }
    return new Response('open-booking worker', { status: 200 });
  },
};

async function handleScheduled(event, env) {
  console.log(`[scrapejob] trigger: ${event.cron ?? 'manual'}`);
}