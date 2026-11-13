# Running the frontend in Docker (BIO-SERVER)

The frontend runs as one container: nginx serves the built React app and forwards `/api/`, `/admin/` and
`/static/` to the Django backend. The browser only talks to the frontend address, so login and CSRF work as
they do on one site (no CORS settings needed).

```
browser ──▶ frontend container :8003 ──▶ /            React app (built files)
                                     └─▶ /api/ /admin/ backend `web` container (Django)
```

## First time

In a terminal on BIO-SERVER, in the folder where this repository is checked out:

1. Settings (no secrets in this file):
   ```
   cp .env.example .env
   ```
   Check the backend's network name. It should be in the list as `invoicing_backend_default`:
   ```
   docker network ls
   ```
   If it has another name, put that name in `BACKEND_NETWORK` in `.env`.
2. The backend must be running (in the backend folder: `docker compose up -d web`).
3. Build and start:
   ```
   docker compose build
   docker compose up -d
   ```
4. Open `http://10.10.1.20:8003` and log in as usual.

The backend accepts the address because `DJANGO_ALLOWED_HOSTS` in the backend's `.env` already contains
`10.10.1.20`. If you open the app under another name (e.g. a domain through the Cloudflare tunnel), add that name
to `DJANGO_ALLOWED_HOSTS` and `https://<that name>` to `DJANGO_CSRF_TRUSTED_ORIGINS` in the **backend's** `.env`,
then restart the backend (`docker compose up -d web`).

## After a new release

```
git pull
docker compose build
docker compose up -d
```

The page is never cached by the browser, so people see the new version at their next reload.

## Checks

| What | Expected |
|---|---|
| `docker compose ps` | `frontend` is `Up` and `healthy` |
| `http://10.10.1.20:8003/healthz` | `ok` (the frontend container itself) |
| `http://10.10.1.20:8003/api/health` | `{"status": "ok", ...}` (forwarded to the backend) |
| `docker compose logs --tail 20 frontend` | no `[emerg]` lines |

If `/api/health` shows `502 Bad Gateway`, the backend is not running or `BACKEND_NETWORK` / `BACKEND_URL` is
wrong. As a fallback, set `BACKEND_URL=http://10.10.1.20:8002` in `.env` (the backend's own port) and run
`docker compose up -d` again.

## Public address (optional, decide first)

Today the Cloudflare tunnel sends `einvoice.ipolymersolutionscorp.com` straight to the backend (port 8002), so
that address shows only the API. To serve the app there, point that hostname at the frontend instead: in the
tunnel's settings, keep the same host as today and change port `8002` to `8003` (or, if the tunnel reaches the
backend by container name, use the frontend container on port 80). The frontend forwards `/api/` to the backend,
so the API keeps working at the same address, and local development (`npm run dev`) keeps working too. Then add
`einvoice.ipolymersolutionscorp.com` / `https://einvoice.ipolymersolutionscorp.com` to the backend's
`DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS` if they are not there yet.
