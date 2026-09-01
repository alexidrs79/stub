# Stub

Stub is a private movie and television archive built with React, Express,
PostgreSQL, Prisma, and TMDb.

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

The production server serves the compiled React application and the API from one
origin. The included `render.yaml` defines one Render web service and one managed
PostgreSQL database.

Required environment variables:

- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET` with at least 32 random characters
- `TMDB_API_KEY`
- `APP_URL`, the public HTTPS origin with no trailing slash
- `ALLOWED_ORIGINS`, normally the same value as `APP_URL`
- `RESEND_API_KEY`
- `RESEND_FROM`, a verified sender such as `Stub <help@example.com>`

Build, migrate, and start:

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

Use `/api/health` for process liveness and `/api/ready` for readiness checks that
include the database.

## Launch operations

- Enable automatic PostgreSQL backups in the hosting provider and perform a test
  restore before launch.
- Attach the custom domain in Render, confirm its managed TLS certificate is
  active, and set both URL variables to the final `https://` origin.
- Run `prisma migrate deploy` as a pre-deploy command, never `migrate dev`.
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
