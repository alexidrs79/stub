import compression from "compression"
import cookieParser from "cookie-parser"
import cors from "cors"
import express, { type Express } from "express"
import rateLimit from "express-rate-limit"
import helmet from "helmet"
import type { AppConfig } from "./config.js"

const FIFTEEN_MINUTES = 15 * 60 * 1000

/**
 * Rate limits, split by how expensive abuse of each surface is. These count in
 * per-process memory, so the web service has to stay at one instance until they
 * move to a shared store.
 */
export const limiters = {
  api: rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Try again shortly." },
  }),
  auth: rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again later." },
  }),
  recovery: rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many recovery attempts. Try again later." },
  }),
  write: rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many changes. Try again shortly." },
  }),
}

const READ_METHODS = ["GET", "HEAD", "OPTIONS"]

export function applySecurity(app: Express, config: AppConfig) {
  const { allowedOrigins, appOrigin, production, secureProduction } = config

  if (production) app.set("trust proxy", 1)

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          frameAncestors: ["'none'"],
          frameSrc: ["'self'", "https://www.youtube-nocookie.com"],
          imgSrc: ["'self'", "data:", "https://image.tmdb.org"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          upgradeInsecureRequests: secureProduction ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: secureProduction,
      referrerPolicy: { policy: "no-referrer" },
    }),
  )
  app.use(compression())

  app.use((req, res, next) => {
    const forwardedProto = req.get("x-forwarded-proto")
    if (secureProduction && forwardedProto && forwardedProto !== "https") {
      res.redirect(308, new URL(`${appOrigin}${req.originalUrl}`).toString())
      return
    }
    next()
  })

  // Exact-origin checks plus Fetch Metadata. Together they stop a cross-site
  // page from driving state changes with the session cookie attached.
  app.use((req, res, next) => {
    const origin = req.get("origin")
    if (origin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: "Origin not allowed." })
      return
    }
    if (
      req.get("sec-fetch-site") === "cross-site" &&
      !READ_METHODS.includes(req.method)
    ) {
      res.status(403).json({ error: "Cross-site request blocked." })
      return
    }
    next()
  })

  app.use(cors({ origin: [...allowedOrigins], credentials: true }))
  app.use(express.json({ limit: "16kb", strict: true }))
  app.use(cookieParser())
}

/// Applied to the API only: no caching of private data, a global read budget,
/// and a tighter budget for anything that writes.
export function applyApiPolicy(app: Express) {
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store")
    next()
  })
  app.use("/api", limiters.api)
  app.use("/api", (req, res, next) => {
    if (READ_METHODS.includes(req.method)) {
      next()
      return
    }
    limiters.write(req, res, next)
  })
}

export function requestLogging(app: Express) {
  app.use((req, res, next) => {
    const startedAt = Date.now()
    res.on("finish", () => {
      console.log(
        JSON.stringify({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      )
    })
    next()
  })
}
