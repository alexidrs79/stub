import { config as loadEnv } from "dotenv"
import { resolve } from "node:path"

loadEnv({ path: resolve(import.meta.dirname, "../.env"), quiet: true })

const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "JWT_SECRET",
  "TMDB_API_KEY",
  "APP_URL",
  "RESEND_API_KEY",
  "RESEND_FROM",
] as const

function normalizeOrigin(value: string, label: string, production: boolean) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be a valid absolute URL`)
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must contain only an origin`)
  }
  if (
    production &&
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error(`${label} must use HTTPS in production`)
  }
  return url.origin
}

function build() {
  const production = process.env.NODE_ENV === "production"

  if (production) {
    const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name])
    if (missing.length > 0) {
      throw new Error(`Missing production environment: ${missing.join(", ")}`)
    }
    if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
      throw new Error("JWT_SECRET must contain at least 32 characters")
    }
  }

  const appOrigin = normalizeOrigin(
    process.env.APP_URL ?? "http://localhost:5273",
    "APP_URL",
    production,
  )
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "http://localhost:5273")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => normalizeOrigin(origin, "ALLOWED_ORIGINS", production)),
  )

  return {
    production,
    port: Number(process.env.PORT) || 3101,
    appOrigin,
    allowedOrigins,
    /// HSTS and the HTTPS redirect only make sense once the public origin is
    /// actually HTTPS, which it is not for a local production build.
    secureProduction: production && new URL(appOrigin).protocol === "https:",
    clientDirectory: resolve(import.meta.dirname, "../../client/dist"),
  }
}

export const appConfig = build()
export type AppConfig = typeof appConfig
