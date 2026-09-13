# Auth + favoritos: cuentas de usuario en el Worker

Status: resolved
Type: grilling
Blocked by: 08, 10
Resolved: 2026-09-13

## Answer

<!-- grilling vía herramienta de preguntas, todas las opciones recomendadas -->

**Mecanismo auth**: **propietario mínimo** en el Worker — sin librería. Email+password, scrypt vía WebCrypto (`crypto.subtle.deriveBits`), esquema `/etc` own. Zero dependencias, cabe en 10ms CPU Free.

**Sesión**: **cookie stateless HMAC** — payload `{userId, exp}` firmado con `createHmac('sha256', AUTH_SECRET)` (HMAC en node:crypto, síncrono y barato). Idempotente, sin tabla de sesiones, sin reads D1 para `/me`. Revocación = cambio de AUTH_SECRET (aceptable MVP) o exp (±7 días).

**Password hashing**: scrypt WebCrypto con salt por usuario (`N/r/p` moderados: 2^14, 8, 1), formato autodescriptivo `scrypt$<iter>$<salt>b64$<hash>b64`. Nunca loguear.

**D1 tablas** (migración `0002_auth.sql`):
- `users` (id UUID, email TEXT UNIQUE COLLATE NOCASE, password_hash TEXT, created_at, updated_at)
- `favorites` (user_id FK→users, accommodation_id FK→accommodations, created_at, PK compuesta (user_id, accommodation_id))
- Sin `email_verified` (sin emails transaccionales; Cloudflare Email Service fuera de alcance).

**Endpoints Worker**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; favoritos `POST /api/favorites/:accommodationId` (toggle upsert/delete), `GET /api/favorites` (join accommodations + contactos top). Heart en SSR vía sesión (cookie), sin cambiarse el DTO de search/detalle.

**Seguridad**: hashing+HMAC, cookie `HttpOnly; SameSite=Lax; Secure` (Secure solo en prod), no passwords en logs, CSRF protegido con SameSite=Lax + comprobación `Origin` en POSTs mutadores.

**Rate limit**: **KV window counter** en `/register` y `/login` — `auth:rl:<email>` 5 fallos/hora TTL 1h; global `auth:rl:ip:<ip>` 20/hora. Coste D1 nulo (llaves en KV).

Nota fog heredada: "Auth + favoritos — mecanismo de cuentas (¿Astro Sessions sobre KV? ¿mejor-auth en Worker?) y el perfil de guardado".