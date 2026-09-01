# Stub

Stub is a private movie and television archive built with React, Express,
PostgreSQL, Prisma, and TMDb.

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
