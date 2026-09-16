import { env } from 'cloudflare:workers';

const workerUrl = env.DATA_WORKER_URL ?? 'http://localhost:8787';

export async function getSearch(q: string, locals: any) {
  const res = await fetch(`${workerUrl}/api/search?city=${encodeURIComponent(q)}&limit=50`, {
    headers: { cookie: locals?.cookie ?? '' },
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return res.json();
}

export async function getAccommodation(slug: string, locals: any) {
  const res = await fetch(`${workerUrl}/api/accommodations/${encodeURIComponent(slug)}`, {
    headers: { cookie: locals?.cookie ?? '' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`accommodation ${res.status}`);
  return res.json();
}

export async function getMe(locals: any) {
  try {
    const res = await fetch(`${workerUrl}/api/auth/me`, {
      headers: { cookie: locals?.cookie ?? '' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user ?? null;
  } catch {
    return null;
  }
}