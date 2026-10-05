# Domain cutover: `raktasetu.in` → Railway

> **Status:** Active, cutover pending — **blocked: domain registration lapsed**
>
> **Last externally verified:** 2026-10-04 — `raktasetu.in` returns NXDOMAIN (WHOIS registry expiry 2026-08-12, GoDaddy); renew or recover it before any step below. The Railway production health endpoint returned HTTP 200 with version `2.0.13`. (2026-08-11: domain served a registrar parking lander.)

Prepare the codebase first (this checklist). **Do not** change DNS or set `CANONICAL_ORIGIN` on Railway until you are ready to cut over.

Live today: `https://raktasetu-production.up.railway.app/`  
Target: `https://raktasetu.in/`

## Env vars (Railway service `raktasetu`)

| Variable | When | Value |
|----------|------|--------|
| `VITE_SITE_ORIGIN` | Build time (Nixpacks frontend build) | Transition: keep default or set `https://raktasetu-production.up.railway.app`. At cutover: `https://raktasetu.in` (no trailing slash). |
| `FRONTEND_ORIGINS` | Runtime CORS | During transition include **both**: `https://raktasetu.in,https://raktasetu-production.up.railway.app` (plus localhost if needed). Same-origin production mostly does not need CORS, but OAuth / tooling may. |
| `CANONICAL_ORIGIN` | Runtime redirect | **Off by default** (unset). After custom domain works, set `https://raktasetu.in` so railway.app HTML pages 301 to the custom domain. `/api/*`, `/health`, and `/socket.io/*` stay exempt so Railway health checks on `*.up.railway.app` keep returning 200. |

Cookies: `rs_refresh` is **host-only** (no `Domain=`). No cookie Domain change is required for cutover; users sign in again on the new host.

## Checklist

### 1. DNS on Railway

1. Railway project → service **raktasetu** → Settings → Networking → Custom Domain.
2. Add `raktasetu.in` (and `www.raktasetu.in` if desired).
3. At your DNS provider, create the CNAME (or ALIAS/ANAME at apex) Railway shows — typically pointing at the Railway domain target.
4. Wait for Railway TLS certificate to become active.

### 2. Build / runtime env (transition)

1. Optionally set `VITE_SITE_ORIGIN=https://raktasetu.in` **only after** the custom domain serves HTTPS (otherwise OG/canonical URLs would point at a dead host). Until then, leave unset so the build default stays the Railway URL.
2. Extend `FRONTEND_ORIGINS` to include both origins during transition.
3. Redeploy so the SPA rebuild picks up `VITE_SITE_ORIGIN` (HTML meta, JSON-LD, `robots.txt`, `sitemap.xml` are injected at **build** time).

### 3. Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth Web client:

- Authorized JavaScript origins: add `https://raktasetu.in` (keep `https://raktasetu-production.up.railway.app` and `http://localhost:5173` during transition).
- Authorized redirect URIs: only if you use redirect-based flows (GIS button typically needs origins only).

### 4. Verify

```bash
# Still healthy on Railway host (even after CANONICAL_ORIGIN is set)
curl -sf https://raktasetu-production.up.railway.app/api/health

# Custom domain serves the app
curl -sfI https://raktasetu.in/
curl -sf https://raktasetu.in/api/health

# After CANONICAL_ORIGIN=https://raktasetu.in — HTML 301s, API does not
curl -sI https://raktasetu-production.up.railway.app/ | head -n 5   # expect 301 → https://raktasetu.in/
curl -sf https://raktasetu-production.up.railway.app/api/health      # expect 200 JSON
```

### 5. Share / SEO previews

1. Re-test WhatsApp (and optionally Slack/iMessage) link preview on `https://raktasetu.in/` after `VITE_SITE_ORIGIN` points at the custom domain and a fresh deploy has baked OG tags.
2. Confirm `https://raktasetu.in/robots.txt` and `/sitemap.xml` list the custom origin.
3. Optional: Google Search Console property for `raktasetu.in`.

### 6. Enable railway.app → custom domain redirects

When DNS + TLS + OAuth look good:

```bash
# Example — set on Railway (do not commit secrets; use dashboard or CLI)
railway variables set CANONICAL_ORIGIN="https://raktasetu.in"
```

Redeploy if needed. Keep `FRONTEND_ORIGINS` including both hosts until you are sure nothing still loads the Railway URL in a browser.

### 7. Cleanup (later)

- Prefer documenting `https://raktasetu.in` as the public URL in README / marketing.
- Optionally drop the Railway origin from Google OAuth and `FRONTEND_ORIGINS` once traffic has moved.
- Leave `CANONICAL_ORIGIN` set so old links and WhatsApp caches that still hit railway.app 301 to the custom domain.

## How the build injects origin

- `VITE_SITE_ORIGIN` defaults to `https://raktasetu-production.up.railway.app` in `frontend/vite.site-origin.js`.
- Vite replaces `%VITE_SITE_ORIGIN%` in `frontend/index.html` (canonical, Open Graph, Twitter, JSON-LD, noscript privacy link).
- The same plugin emits `robots.txt` and `sitemap.xml` into `dist/` (and serves them in `vite dev`) — no literal production origin remains in `frontend/public/`.
- Runtime SPA meta (`usePageMeta`) reads `import.meta.env.VITE_SITE_ORIGIN` via `frontend/src/siteOrigin.js`.

## Out of scope for this prep

- Changing DNS records
- Setting `CANONICAL_ORIGIN` or `VITE_SITE_ORIGIN` on Railway until cutover day
- Cookie `Domain=` attributes
