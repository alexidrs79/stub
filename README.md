# Stub

[![CI](https://github.com/alexidrs79/stub/actions/workflows/ci.yml/badge.svg)](https://github.com/alexidrs79/stub/actions/workflows/ci.yml)

**Live:** [https://stub-du13.onrender.com](https://stub-du13.onrender.com)

Stub is a private movie and television archive built with React, Express,
PostgreSQL, Prisma, and TMDb.

> Free Render instances sleep after idle time. The first visit after sleep can
> take about a minute.

![The Stub home page](docs/home.jpg)

## Stack

- React 19, TypeScript, Vite, React Router, Tailwind
- TanStack Query
- Express 5, Prisma, PostgreSQL
- JWT in an httpOnly cookie, bcrypt, Helmet, per-route rate limiting
- Vitest and Testing Library on the client, `node:test` and supertest on the server

## How the archive is modelled

A title sits in exactly one of three primary states — watchlist, watching, or
watched — and every state change runs inside a transaction that takes a
Postgres advisory lock on `(user, title)`, so concurrent tabs cannot interleave
into an inconsistent state.

Each watched title carries one dated diary stamp. Stamping a title again
revises that stamp rather than adding another, and removing it returns the
title to the watchlist. The date is the viewer's to set, so a title finished
last Tuesday need not be filed under today, and a stamp's score, note, and date
stay editable afterwards. The rating shown elsewhere in the app mirrors the
stamp, so the detail page and the diary never disagree.

TMDb card data — title, year, runtime, artwork, season counts — is cached in the
`title_cache` table for seven days. Hydrating an archive therefore costs one
database read rather than one upstream request per title, and a stale row is
still served when TMDb is unreachable, so the archive renders even during a
TMDb outage.

The API separates the two shapes this needs:

- `GET /api/titles/index` returns the whole archive with no artwork. It is what
  every page uses to mark titles you already saved, and it makes no upstream
  requests.
- `GET /api/titles?view=&sort=&mediaType=&page=` returns one hydrated page of a
  collection view. Sorting and filtering happen server-side over the whole view
  so paging stays stable.
- `GET /api/profile/stats` computes taste aggregates over the whole archive
  server-side and returns only the totals plus two short display lists.

## Local development

1. Create a PostgreSQL database.
2. Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL`,
   `JWT_SECRET`, and `TMDB_API_KEY`.
3. Install dependencies:

   ```sh
   npm --prefix client install
   npm --prefix server install
   ```

4. Apply migrations and start both applications:

   ```sh
   npm --prefix server run db:migrate
   npm --prefix server run dev
   npm --prefix client run dev
   ```

Vite proxies `/api` to the server during development.

## Production

The production server serves `client/dist` and the API from one Express origin.
`render.yaml` is a Render Blueprint: one Node 22 web service (`stub`) and one
Postgres database (`stub-db`). Do not add extra services. The Blueprint runs
`npm run build:prod` (installs compile tools even though `NODE_ENV` is
`production`, and skips lint — `npm run check` still gates CI), then on boot
`npm run db:migrate:deploy` (Prisma `migrate deploy`, never `migrate dev`) and
`npm start`. Free instances cannot use a pre-deploy command. Health check is
`GET /api/ready`.

### Deploy with the Blueprint

1. Open the [Render Dashboard](https://dashboard.render.com/).
2. Click **New** → **Blueprint**.
3. Click **Connect** on `alexidrs79/stub` (authorize the Render GitHub app first
   if the repo is missing).
4. Name the Blueprint, leave the branch as `main`, leave **Blueprint Path** as
   `render.yaml`.
5. On the env form, type only the `sync: false` values below. Do not invent
   `DATABASE_URL` or `JWT_SECRET`.
6. Click **Deploy Blueprint**.
7. After the first deploy, open the `stub` service and copy its public URL
   (currently `https://stub-du13.onrender.com`). Set `APP_URL` and
   `ALLOWED_ORIGINS` to that origin with `https://` and **no trailing slash**.
   They must be identical. Then **Manual Deploy** → **Deploy latest commit**.

This Blueprint uses Render’s **free** web and Postgres plans. No card is
required. Free web services sleep after ~15 minutes idle; the first request can
take about a minute. Free Postgres is small and expires unless you upgrade.
Render injects `PORT`; Express reads it.

### Environment

| Variable | Who sets it | Value |
|---|---|---|
| `NODE_VERSION` | Blueprint | `22` (matches root `package.json` `engines.node`) |
| `NODE_ENV` | Blueprint | `production` |
| `DATABASE_URL` | Render | Injected from `stub-db` |
| `JWT_SECRET` | Render | Generated, ≥32 characters |
| `PORT` | Render | Injected; do not set it |
| `APP_URL` | You | Public `https://` origin, no trailing slash |
| `ALLOWED_ORIGINS` | You | Same string as `APP_URL` |
| `TMDB_API_KEY` | You | TMDb API key |
| `RESEND_API_KEY` | You | Resend API key |
| `RESEND_FROM` | You | Verified sender, e.g. `Stub <help@example.com>` |

Do not commit these values. Local copies stay in `server/.env`.

```sh
npm run check
npm run build
npm run db:migrate:deploy
npm start
```

`npm run check` runs client and server linting, strict TypeScript builds, and the
frontend and database-backed test suites. GitHub Actions runs the same gate for
pushes and pull requests.

The server suite needs a PostgreSQL database with migrations applied and covers
authentication (session issuance, credential failures, session-version
revocation on password change, account deletion, cross-site request rejection),
authorization (no user can read or change another user's lists, diary stamps, or
archive, and every owner-scoped route refuses an anonymous caller), the
watch-state transitions under concurrency, and the title cache.

Use `/api/health` for process liveness and `/api/ready` for readiness (includes
the database).

## Launch operations

- Enable automatic PostgreSQL backups in the hosting provider and perform a test
  restore before launch.
- Attach the custom domain in Render, confirm its managed TLS certificate is
  active, and set both URL variables to the final `https://` origin.
- Run `prisma migrate deploy` on boot (free plan) or as a pre-deploy command
  on a paid plan. Never `migrate dev` in production.
- Rotate a compromised TMDb or Resend key in the provider, then redeploy.
- To rotate `JWT_SECRET`, replace it and redeploy; all users will be signed out.
- Review structured request logs for repeated `401`, `403`, `429`, and `500`
  responses. Never log cookies, passwords, reset tokens, or request bodies.
- The bundled rate limiter uses per-process memory. Keep the web service at one
  instance for launch. Before horizontal scaling, replace it with a shared
  Redis-backed store.

## Security notes

Authentication is stored in a secure, HTTP-only, SameSite cookie. Password changes
and password resets increment a session version, invalidating older JWTs. State
changing cross-site requests are blocked by exact-origin CORS and Fetch Metadata.
Account deletion requires the current password and cascades through the user's
archive.

TMDb data and images are used under TMDb's API terms. Stub is not endorsed or
certified by TMDb.
