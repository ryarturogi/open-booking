import { defineMiddleware } from 'astro:middleware';
import { workerFetch } from './lib/worker-fetch';

// BFF: reenvía /api/* al data-worker. Forward de Cookie + Set-Cookie para que la
// sesión viva en el dominio del sitio. PRG para mutaciones (forms sin JS).
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals } = context;
  const url = new URL(request.url);

  // Expone la cookie al render SSR (páginas) para forward al data-worker.
  const cookie = request.headers.get('cookie') ?? '';
  locals.cookie = cookie;

  // Si hay sesión, resuelve el usuario para el render SSR (favoritos, nav).
  if (cookie.includes('ob_session=')) {
    try {
      const me = await workerFetch('/api/auth/me', { headers: { cookie } });
      if (me.ok) locals.user = (await me.json()).user;
    } catch {
      /* sin sesión válida: render público */
    }
  }

  if (!url.pathname.startsWith('/api/')) return next();

  const res = await workerFetch(`${url.pathname}${url.search}`, {
    method: request.method,
    headers: {
      cookie: request.headers.get('cookie') ?? '',
      'content-type': request.headers.get('content-type') ?? 'application/json',
      'x-forwarded-for': request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown',
    },
    body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) ? request.body : undefined,
  });
  const headers = new Headers();
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) headers.set('set-cookie', setCookie);

  // PRG: mutaciones -> redirect (el form POST no muestra el JSON del worker).
  const isMutation = request.method === 'POST';
  if (isMutation) {
    const back = request.headers.get('referer') ?? '/';
    const ok = res.status >= 200 && res.status < 400;
    const backUrl = new URL(back, request.url);
    if (!ok) backUrl.searchParams.set('error', 'no-ok');
    const prg = { location: backUrl.pathname + backUrl.search };
    const cookieHeader = res.headers.get('set-cookie');
    if (cookieHeader) prg['set-cookie'] = cookieHeader;
    return new Response(null, { status: 303, headers: prg });
  }

  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      ...Object.fromEntries(headers),
    },
  });
});