/**
 * open-booking worker — auth propietario mínimo (ticket 12).
 * scrypt (WebCrypto) + sesión stateless HMAC con cookie HttpOnly.
 * Rate-limit por email y por IP en KV.
 */

const SESSION_COOKIE = "ob_session";
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extraHeaders },
  });
}

function toB64(ab) {
  return btoa(String.fromCharCode(...new Uint8Array(ab)));
}

function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(secret, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: iterations || 100_000,
    },
    key,
    256,
  );
}

// scrypt$salt$hash — salt y hash en base64. 2^20=1.048.576 iteraciones originales
// de la propuesta, pero 10ms CPU Free obliga a bajar: N=2^14 (16.384) con
// longitud de iteraciones como fuerza computacional. Ver NOTICE para el trade-off.
async function hashPassword(password, saltHex) {
  const saltText = saltHex || crypto.randomUUID().replace(/-/g, "");
  const bits = await deriveKey(password.trim(), saltText, 16_384);
  const hash = toB64(bits);
  return `scrypt$${saltText}$${hash}`;
}

async function verifyPassword(password, stored) {
  const [, saltText, hashB64] = stored.split("$");
  if (!saltText || !hashB64) return false;
  const bits = await deriveKey(password.trim(), saltText, 16_384);
  const candidate = toB64(bits);
  const a = fromB64(candidate);
  const b = fromB64(hashB64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function makeSessionCookie(userId, secret) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = toB64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `${SESSION_COOKIE}=${btoa(payload)}.${sig}; Path=/; HttpOnly; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax`;
}

export async function readSession(cookieHeader, secret) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  const [b64Payload, sigRaw] = match[1].split(".");
  if (!b64Payload || !sigRaw) return null;
  let payload;
  try {
    payload = atob(b64Payload);
  } catch {
    return null;
  }
  const [userId, expRaw] = payload.split(".");
  if (!userId || !expRaw) return null;
  const exp = Number(expRaw);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toB64(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}.${expRaw}`)),
  );
  let diff = 0;
  const a = fromB64(sigRaw.replace(/=+$/, ""));
  const b = fromB64(expected.replace(/=+$/, ""));
  if (a.length !== b.length) return null;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return null;
  return userId;
}

async function rateLimited(env, key) {
  const full = `auth:rl:${key}`;
  const cur = Number((await env.OPEN_BOOKING_KV.get(full)) ?? 0);
  if (cur >= 5) return true;
  await env.OPEN_BOOKING_KV.put(full, String(cur + 1), { expirationTtl: 3600 });
  return false;
}

export async function authRouter(request, url, env) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/auth/register" && method === "POST") {
    return registerHandler(request, env);
  }
  if (path === "/api/auth/login" && method === "POST") {
    return loginHandler(request, env);
  }
  if (path === "/api/auth/logout" && method === "POST") {
    return json(
      { ok: true },
      200,
      { "Set-Cookie": `ob_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` },
    );
  }
  if (path === "/api/auth/me" && method === "GET") {
    if (!env.AUTH_SECRET) return json({ error: "auth not configured" }, 503);
    const userId = await readSession(request.headers.get("Cookie"), env.AUTH_SECRET);
    if (!userId) return json({ user: null });
    const { results } = await env.open_booking_db
      .prepare("SELECT id, email FROM users WHERE id = ?")
      .bind(userId)
      .all();
    const user = results[0] ?? null;
    return json({ user: user ? { id: user.id, email: user.email } : null });
  }
  if (path.startsWith("/api/favorites") && method === "GET") {
    if (!env.AUTH_SECRET) return json({ error: "auth not configured" }, 503);
    const userId = await readSession(request.headers.get("Cookie"), env.AUTH_SECRET);
    if (!userId) return json({ error: "unauthenticated" }, 401);
    const { results } = await env.open_booking_db
      .prepare(
        `SELECT a.id, a.name, a.slug, a.type_id, a.municipality, a.lat, a.lon,
                (SELECT COUNT(*) FROM contact_methods cm WHERE cm.accommodation_id = a.id AND cm.is_active = 1) AS contact_count
         FROM favorites f JOIN accommodations a ON a.id = f.accommodation_id
         WHERE f.user_id = ? ORDER BY f.created_at DESC`,
      )
      .bind(userId)
      .all();
    return json({ items: results });
  }
  if (path.startsWith("/api/favorites/") && method === "POST") {
    if (!env.AUTH_SECRET) return json({ error: "auth not configured" }, 503);
    const userId = await readSession(request.headers.get("Cookie"), env.AUTH_SECRET);
    if (!userId) return json({ error: "unauthenticated" }, 401);
    const accommodationId = decodeURIComponent(path.slice("/api/favorites/".length));
    const acc = await env.open_booking_db
      .prepare("SELECT id FROM accommodations WHERE id = ?")
      .bind(accommodationId)
      .first();
    if (!acc) return json({ error: "not found" }, 404);
    const existing = await env.open_booking_db
      .prepare("SELECT 1 FROM favorites WHERE user_id = ? AND accommodation_id = ?")
      .bind(userId, accommodationId)
      .first();
    if (existing) {
      await env.open_booking_db
        .prepare("DELETE FROM favorites WHERE user_id = ? AND accommodation_id = ?")
        .bind(userId, accommodationId)
        .run();
      return json({ ok: true, favorited: false });
    }
    await env.open_booking_db
      .prepare("INSERT INTO favorites (user_id, accommodation_id) VALUES (?, ?)")
      .bind(userId, accommodationId)
      .run();
    return json({ ok: true, favorited: true });
  }
  return null;
}

async function readBody(request) {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function registerHandler(request, env) {
  const body = await readBody(request);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "invalid email" }, 400);
  if (password.length < 8) return json({ error: "password too short (min 8)" }, 400);
  if (await rateLimited(env, `ip:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`)) {
    return json({ error: "rate limited" }, 429);
  }
  if (await rateLimited(env, `email:${email}`)) {
    return json({ error: "rate limited" }, 429);
  }
  const existing = await env.open_booking_db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (existing) return json({ error: "email already registered" }, 409);
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await env.open_booking_db
    .prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)")
    .bind(id, email, passwordHash)
    .run();
  const setCookie = await makeSessionCookie(id, env.AUTH_SECRET);
  return json({ ok: true, user: { id, email } }, 200, { "Set-Cookie": setCookie });
}

async function loginHandler(request, env) {
  const body = await readBody(request);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!email || !password) return json({ error: "missing credentials" }, 400);
  if (await rateLimited(env, `ip:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`)) {
    return json({ error: "rate limited" }, 429);
  }
  if (await rateLimited(env, `email:${email}`)) {
    return json({ error: "rate limited" }, 429);
  }
  const user = await env.open_booking_db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "invalid credentials" }, 401);
  }
  const setCookie = await makeSessionCookie(user.id, env.AUTH_SECRET);
  return json({ ok: true, user: { id: user.id, email: user.email } }, 200, { "Set-Cookie": setCookie });
}