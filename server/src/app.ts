import express, { type Express } from "express"
import { appConfig, type AppConfig } from "./config.js"
import { prisma } from "./db.js"
import { statusOf } from "./http.js"
import { archiveRoutes } from "./routes/archive.routes.js"
import { authRoutes } from "./routes/auth.routes.js"
import { catalogRoutes } from "./routes/catalog.routes.js"
import { applyClientRoutes, applyCrawlerRoutes } from "./seo.js"
import { applyApiPolicy, applySecurity, requestLogging } from "./security.js"

function applyHealthRoutes(app: Express) {
  // Liveness: the process answers. Readiness also proves the database does.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true })
  })
  app.get("/api/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ ok: true })
    } catch {
      res.status(503).json({ ok: false })
    }
  })
}

function applyErrorHandler(app: Express) {
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(error)
      const status = statusOf(error)
      res.status(status).json({
        error:
          status === 413
            ? "Request is too large."
            : status >= 500
              ? "Server error"
              : "Invalid request.",
      })
    },
  )
}

/// Builds the fully wired app. Exported separately from `index.ts` so tests can
/// drive it without binding a port.
export async function createApp(config: AppConfig = appConfig): Promise<Express> {
  const app = express()

  applySecurity(app, config)
  applyApiPolicy(app)
  requestLogging(app)

  applyHealthRoutes(app)
  app.use("/api", authRoutes)
  app.use("/api", archiveRoutes)
  app.use("/api", catalogRoutes)
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." })
  })

  applyCrawlerRoutes(app, config)
  if (config.production) await applyClientRoutes(app, config)

  applyErrorHandler(app)
  return app
}
