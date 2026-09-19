# Deployment

**Status:** Configured for Netlify (frontend), Render (API and AI service) and a
hosted PostgreSQL with pgvector. No Docker and no CI/CD pipeline — each service
is deployed from this repository by the platform's own build.

Deployment changes nothing about the security model. The session cookie stays
`HttpOnly; SameSite=Strict`, there is no CORS anywhere, and the browser still
talks to a single origin — see [Why the proxy](#why-the-proxy-and-not-cors).

## Topology

```text
Browser
   |
   |  https://<site>.netlify.app
   v
Netlify  (static build of apps/web)
   |
   |  /api/*  ->  200 rewrite (proxy), generated at build time
   v
Render Web Service  (apps/api, Express)
   |                     |
   |  X-Internal-Token   |  DATABASE_URL (TLS)
   v                     v
Render Web Service    PostgreSQL + pgvector
(apps/ai-service)
```

Three rules follow from this shape, and each is enforced in code:

- The browser only ever reaches Netlify. The API's URL appears in no bundle.
- The AI service is reached only by the API, and only with a shared secret.
- The database is reached only by the API.

### Why the proxy, and not CORS

The session cookie is `SameSite=Strict`, so the browser attaches it only to
requests originating from the same site. Serving the portal from Netlify and
calling Render directly would be cross-site: the cookie would not be sent, and
no amount of CORS configuration changes that — `SameSite` is a separate control
from origin sharing. The two options were:

1. **Proxy `/api/*` through Netlify.** The browser sees one origin, the cookie
   keeps `SameSite=Strict`, the frontend keeps `credentials: "same-origin"`, and
   no CORS header exists anywhere. **This is what is implemented.**
2. Switch the cookie to `SameSite=None; Secure` and add CORS with credentials.
   This works, and it gives up the primary CSRF control described in
   [security.md](security.md) in exchange for nothing the proxy does not already
   provide. Not done.

Because the request reaches the API through Netlify, the `Origin` header the API
sees is the **Netlify site origin**. That is what `ALLOWED_ORIGINS` must contain
for `requireSameOrigin` to admit state-changing requests.

---

## A. Netlify — `apps/web`

| Setting | Value |
|---|---|
| Base directory | `apps/web` |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | 22 (`NODE_VERSION` in `netlify.toml`) |

These are already declared in [`netlify.toml`](../../netlify.toml) at the
repository root, so connecting the repository is enough. If Netlify reports that
the publish directory does not exist, set it to `apps/web/dist` — some Netlify
builds resolve `publish` from the repository root rather than from `base`.

### Environment variables

| Variable | Value | Secret? |
|---|---|---|
| `API_PROXY_TARGET` | `https://<your-api>.onrender.com` | No — a public URL |

`API_PROXY_TARGET` is the **origin only**: `https`, no trailing path. The build
validates it and fails with a message when it is missing or malformed, so a site
cannot be deployed with a proxy pointing nowhere.

**There are no `VITE_*` variables, and none may ever carry a secret.** Anything
prefixed `VITE_` is inlined into the JavaScript bundle and readable by every
visitor. The frontend needs no credential at all: it authenticates with the
session cookie, which the browser holds and JavaScript cannot read.

### Routing

`netlify.toml` declares no redirects. They are generated into `dist/_redirects`
by `apps/web/scripts/writeRedirects.mjs` during the build, because `netlify.toml`
cannot interpolate an environment variable into a redirect target and the
backend URL must not be committed to the repository. The generated file is:

```text
/api/*    https://<your-api>.onrender.com/api/:splat    200
/*        /index.html                                   200
```

Netlify evaluates these top to bottom and stops at the first match, so `/api/*`
resolves before the SPA fallback. The fallback is what makes a refresh on
`/projects/abc/work-packages`, `/vendor/opportunities` or `/admin/suppliers`
serve the application rather than a 404.

**Deploy previews** get their own origin
(`deploy-preview-12--<site>.netlify.app`). Sign-in fails there until that origin
is added to the API's `ALLOWED_ORIGINS`.

---

## B. Render — `apps/api` (Express)

| Setting | Value |
|---|---|
| Root directory | `apps/api` |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Pre-deploy command | `npm run migrate:prod` |
| Start command | `npm start` |
| Health check path | `/health` |
| Node version | from `engines` (`>=22.0.0 <23`) |

`npm run build` compiles `src/` **and** `scripts/` into `dist/`, so
`npm run migrate:prod` (`node dist/scripts/migrate.js`) runs with no dev
dependencies installed. `tsx` is never needed in a deployment.

`--include=dev` is not optional: with `NODE_ENV=production` in the environment,
npm omits dev dependencies, and TypeScript is one of them — the build would fail
with `tsc: not found`. The flag forces them in for the build only; the running
service still needs nothing beyond the four production dependencies.

`/health` is the only endpoint that needs no session, and it deliberately does
not touch the database — it stays green while the database is unreachable (D18).
`GET /api/v1/system/status` is the authenticated endpoint that reports database
and AI-service state.

### Environment variables

| Variable | Value | Secret? |
|---|---|---|
| `NODE_ENV` | `production` | No |
| `DATABASE_URL` | connection string from the database provider | **Yes** |
| `DATABASE_SSL_STRICT` | `false` unless the provider's chain verifies | No |
| `ALLOWED_ORIGINS` | `https://<site>.netlify.app` | No |
| `AI_SERVICE_URL` | `https://<your-ai-service>.onrender.com` | No |
| `AI_SERVICE_TOKEN` | shared secret, identical on both services | **Yes** |
| `AI_SERVICE_TIMEOUT_MS` | `60000` (see the cold-start note below) | No |
| `TRUST_PROXY` | `2` — see below | No |
| `STORAGE_DRIVER` | `local` | No |
| `UPLOAD_DIR` | `/var/data/uploads` — a mounted disk | No |
| `SESSION_COOKIE_SECURE` | leave unset; defaults to true under `NODE_ENV=production` | No |
| `SESSION_IDLE_MINUTES` / `SESSION_ABSOLUTE_HOURS` | optional | No |
| `PORT` | set by Render; do not override | No |

`SEED_DEMO_PASSWORD` is **not** set here — see [F](#f-demo-data).

The API refuses to start in production when `DATABASE_URL`, `ALLOWED_ORIGINS`,
`UPLOAD_DIR` or `AI_SERVICE_TOKEN` is missing, or when the session cookie would
not be `Secure`. A misconfiguration is then a failed deploy naming the variable,
rather than a running service that loses data quietly.

### `TRUST_PROXY`

`request.ip` keys the login and vendor-registration rate limiters. Two proxies
sit in front of the process (Netlify, then Render), so with the default
(`loopback`) every caller appears to share one address, and five failed
registrations would lock out everyone.

Start with `TRUST_PROXY=2`, then verify: sign in and check the `ip_address`
recorded against the session. It should be a real client address, not a platform
address; if it is a platform address, try `1`. Setting it higher than the number
of proxies actually in front of the service lets a caller spoof their address
through `X-Forwarded-For`, so do not raise it beyond what the chain has.

### Migrations

`npm run migrate:prod` is idempotent. It applies `migrations/*.sql` in filename
order, records each in `schema_migrations`, and runs each inside a transaction.
It takes a PostgreSQL advisory lock for the whole run, so two instances — or a
pre-deploy overlapping a still-running old instance — serialise rather than
race: the second waits, then finds nothing to apply.

There are three places to run it, and all three are safe. The advisory lock is
what makes that true: the usual objection to migrating on boot is that several
instances race each other, and here they cannot.

1. **Render's Pre-Deploy Command** — `npm run migrate:prod`. The cleanest: once
   per deploy, before any new instance starts, and a failure stops the deploy
   rather than the service. Requires a paid instance type.
2. **The start command** — `npm run migrate:prod && npm start`. The right choice
   when pre-deploy is unavailable, or when nobody wants to remember a manual
   step. It costs about a second per boot, and a failed migration becomes a
   crash-loop rather than a failed deploy — noisy, but never a half-migrated
   database. A database that is briefly unreachable at boot also prevents
   startup, where the service would otherwise start and report the outage.
3. **By hand, once, from a developer machine.** Enough on its own: migrations
   only need re-running when a new file is added to `migrations/`.

```bash
cd apps/api
DATABASE_URL='<the hosted connection string>' npm run migrate
```

---

## C. Render — `apps/ai-service` (FastAPI)

| Setting | Value |
|---|---|
| Root directory | `apps/ai-service` |
| Runtime | Python 3 |
| Build command | `pip install -r requirements.txt` |
| Start command | `python -m app` |
| Health check path | `/health` |

`python -m app` binds to `HOST`/`PORT` from the environment. Render provides
`PORT`; `HOST` must be set to `0.0.0.0` or the service binds loopback and Render
sees no open port. (`uvicorn app.main:app --host 0.0.0.0 --port $PORT` is an
equivalent start command.)

### Environment variables

| Variable | Value | Secret? |
|---|---|---|
| `ENVIRONMENT` | `production` | No |
| `HOST` | `0.0.0.0` | No |
| `AI_SERVICE_TOKEN` | the same value as on the API | **Yes** |
| `EMBEDDING_CACHE_DIR` | `/var/data/fastembed` if a disk is mounted | No |
| `AI_API_KEY` | Groq key, if a real model is wanted | **Yes** |
| `AI_BASE_URL` / `AI_MODEL` / `AI_MAX_TOKENS` | as in `.env.example` | No |
| `ANTHROPIC_API_KEY` | alternative provider | **Yes** |

With no provider key the service runs the deterministic stub and the platform
still works end to end — useful for a demonstration, and it costs nothing.

### Authentication

Every `/internal/v1/*` endpoint requires the `X-Internal-Token` header, compared
in constant time. A missing or wrong token gets 401. The dependency is attached
to each router rather than to individual endpoints, so an endpoint added later is
protected whether or not its author remembered — the same reasoning as mounting
`requireAuth` on the `/api/v1` prefix in the backend.

With `ENVIRONMENT=production` the service **refuses to start** without a token,
and `/docs`, `/redoc` and `/openapi.json` are switched off.

`/health` stays unauthenticated, because a platform health check cannot send a
custom header. It returns the service, provider and model names and the
embedding dimensions — no key, no token, no procurement data — and reads objects
already built at startup, so it never loads a model.

### The model, and cold starts

`BAAI/bge-small-en-v1.5` is unchanged. It is loaded **once**, during application
startup, and reused for the life of the process; no request loads it, and the
batch size of 16 in `embeddingClient.ts` is unchanged.

The deployment consequence is that a first boot downloads roughly 90 MB before
the service reports healthy. Two things follow:

- Give the service a **generous initial health-check grace period**, or the
  first deploy is killed while it is still downloading.
- Set `EMBEDDING_CACHE_DIR` to a path on a mounted disk to keep the model across
  restarts. Without a disk it is downloaded again on every deploy.

On an instance type that **sleeps when idle**, the first request after a sleep
pays for the entire cold start — process start, model load, then inference — and
can exceed the API's 60-second `AI_SERVICE_TIMEOUT_MS`. That timeout has not
been raised to paper over this: sixty seconds is already longer than an official
will wait, and the honest fixes are an instance type that does not sleep, or a
warm-up request before a demonstration. When semantic retrieval times out the
platform degrades to lexical-only matching rather than failing (D64).

**A private service would be better.** Render's private services are not
reachable from the public internet at all, which suits a component whose only
caller is another Render service. They require a paid plan. This configuration
therefore assumes a *public* web service — which is precisely why the
shared-secret authentication above is not optional.

---

## D. PostgreSQL

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://user:password@host/database?sslmode=require` |
| `DATABASE_SSL_STRICT` | `true` if the provider's certificate chain verifies, else `false` |

TLS is enabled automatically for any non-localhost host (`db/pool.ts`).

### Connection poolers (Neon, Supabase)

Neon and Supabase each offer two connection strings: a direct endpoint, and a
pooled one running PgBouncer in transaction mode (Neon marks it with `-pooler`
in the hostname). The application is fine on either — it holds no session state
between statements.

Migrations are the exception. The runner serialises concurrent runs with a
session-scoped advisory lock, and under transaction pooling the lock and the
unlock can land on different backends, leaving the lock held and the next run
blocking on it indefinitely. `migrate.ts` therefore detects a `-pooler` host and
skips the lock, logging that it did; `schema_migrations`' primary key still
prevents a migration being applied twice. Set
`MIGRATE_SKIP_ADVISORY_LOCK=true` to force the same behaviour on another
provider's pooler.

Use the **direct** connection string when running migrations if you want them
genuinely serialised across concurrent runners.

### pgvector is required

`migrations/006_work_package_matching.sql` runs `CREATE EXTENSION IF NOT EXISTS
vector`. **The production database must support the `vector` extension.** Render
PostgreSQL, Supabase and Neon all do; a provider that does not cannot run this
platform's semantic retrieval.

The migration is written not to hard-fail where the extension is unavailable, and
the backend then degrades to lexical-only retrieval (D64). That is a safety net
for local development, not a deployment target: with it in force, supplier
matching loses its semantic half. There is no application-level substitute for
pgvector, and none should be added.

### Procedure

```bash
# From a developer machine, against the hosted database:
cd apps/api
DATABASE_URL='<the hosted connection string>' npm run migrate
```

Or as Render's pre-deploy command, `npm run migrate:prod`, which is preferred
once the plan supports it.

---

## E. Uploaded document storage

Vendor compliance documents and response attachments are written through one
module, `vendor/documentStorage.ts`, which validates and names every file and
delegates the bytes to a driver selected by `STORAGE_DRIVER`.

**`local` is the only driver implemented.** It writes to `UPLOAD_DIR`.

A container filesystem does not survive a deploy, while the database rows
referencing those files do. Losing the directory therefore turns every stored
document into a broken reference. The API **refuses to start in production
unless `UPLOAD_DIR` is set**, and the value must be a genuinely persistent path:

- **Mount a Render disk** (paid) at `/var/data` and set
  `UPLOAD_DIR=/var/data/uploads`. This is the supported configuration.
- A disk cannot be attached to a service that scales beyond one instance. This
  platform runs as a single instance, so that is not a constraint today — but it
  is why the driver seam exists.

### Object storage (Cloudflare R2) — not implemented

There is no R2, S3 or other object-storage code anywhere in this repository, and
none was added. Doing it properly means either a new AWS SDK dependency or a
hand-written SigV4 signer, and neither could be verified here without
credentials. What exists instead is the seam it slots into.

To add it later:

1. Implement `DocumentStorageDriver` (`vendor/storage/types.ts`) — three
   methods, `write`, `read` and `remove`, all keyed by the opaque storage key.
2. Add `"s3"` to `StorageDriver` in `config/env.ts`, and a case in
   `vendor/storage/index.ts`.
3. Add `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   and `R2_ENDPOINT` to `apps/api/.env.example` and to the Render environment.
   All are **secrets** and belong in the platform's secret store.

No route, repository or database column changes: a storage key is already an
opaque identifier rather than a path. Existing keys keep working provided the
objects are copied into the bucket under the same keys.

Whichever driver is used, the rules do not change. Documents are never public:
every read goes through an authenticated route that scopes the query to the
signed-in vendor's own profile, to the official's organization, or — for the
administrator's registry view — to the platform-administration permission. Keys
are generated UUIDs, and no uploader-supplied filename ever reaches a path. An
object-storage driver must **not** make the bucket public, and must keep serving
bytes through the existing routes rather than handing out URLs.

---

## F. Demo data

**Demo seeding never runs automatically, and must not be added to any build,
start or pre-deploy command.** `scripts/seed.ts` refuses to run when
`NODE_ENV=production`, and it installs known credentials for four accounts —
exactly what must not exist on a public deployment holding real data.

For a hackathon demonstration on a throwaway database, seed it deliberately from
a developer machine:

```bash
cd apps/api
DATABASE_URL='<the hosted connection string>' SEED_DEMO_PASSWORD='<a strong value>' npm run seed
```

`NODE_ENV` is deliberately absent from that command — that is the production
guard being satisfied, so run it only against a database whose contents do not
matter. The script is idempotent and updates the existing accounts rather than
creating duplicates.

---

## Checklist for a first deployment

1. Create the database. Confirm `CREATE EXTENSION vector` succeeds.
2. Generate one `AI_SERVICE_TOKEN` (`node -e "console.log(crypto.randomUUID())"`).
3. Deploy the AI service. Confirm `/health` answers, and that
   `POST /internal/v1/embeddings` without the token returns 401.
4. Deploy the API with the variables in [B](#b-render--appsapi-express), the disk
   mounted, and `AI_SERVICE_URL` pointing at the AI service. Run the migrations.
5. Deploy the Netlify site with `API_PROXY_TARGET` set to the API's origin.
6. Set the API's `ALLOWED_ORIGINS` to the Netlify site origin and redeploy it.
7. Sign in. Check that `/api/v1/system/status` reports the database and the AI
   service as reachable, and that the recorded session IP is a real client
   address — if it is not, adjust `TRUST_PROXY`.

## Related documents

- [security.md](security.md) — the model this deployment preserves
- [../architecture/technology-stack.md](../architecture/technology-stack.md)
- [../architecture/decisions.md](../architecture/decisions.md)
- [testing-strategy.md](testing-strategy.md)
