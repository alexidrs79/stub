import type { NextFunction, Request, RequestHandler, Response } from "express"
import type { MediaType } from "./tmdb.js"

/**
 * Forwards a rejected handler to the error middleware. Express 5 does this for
 * async handlers already, but going through one wrapper keeps the behaviour
 * explicit and identical for every route.
 */
export function route(
  handler: (req: Request, res: Response) => Promise<unknown> | unknown,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res)).catch(next)
  }
}

/// TMDb failures carry an upstream status. Anything else is a server fault.
export function statusOf(error: unknown, fallback = 500) {
  return typeof error === "object" &&
    error &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : fallback
}

/**
 * A JSON route backed by TMDb. Upstream failures become the upstream status
 * with a fixed message, so no route repeats the same catch block.
 */
export function catalogRoute<T>(
  handler: (req: Request) => Promise<T>,
  errorMessage: string | ((status: number) => string),
): RequestHandler {
  return route(async (req, res) => {
    try {
      res.json(await handler(req))
    } catch (error) {
      // Bad input is the caller's fault and says exactly what was wrong;
      // upstream failures share one message so TMDb detail never leaks.
      if (error instanceof BadRequest) {
        res.status(400).json({ error: error.message })
        return
      }
      const status = statusOf(error)
      res.status(status).json({
        error:
          typeof errorMessage === "function" ? errorMessage(status) : errorMessage,
      })
    }
  })
}

/// Thrown by parsers so a route can reject bad input in one line.
export class BadRequest extends Error {
  status = 400

  constructor(message: string) {
    super(message)
  }
}

export function parseMediaType(value: unknown): MediaType | null {
  return value === "movie" || value === "tv" ? value : null
}

export function parseTmdbId(value: unknown) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function parseTitleRef(
  body: { tmdbId?: unknown; mediaType?: unknown } | undefined,
): { tmdbId: number; mediaType: MediaType } | null {
  if (!body) return null
  const tmdbId = parseTmdbId(body.tmdbId)
  const mediaType = parseMediaType(body.mediaType)
  if (!tmdbId || !mediaType) return null
  return { tmdbId, mediaType }
}

export function parseNote(value: unknown) {
  if (value == null || value === "") return { valid: true as const, note: null }
  if (typeof value !== "string") return { valid: false as const, note: null }
  const note = value.trim()
  if (note.length > 140) return { valid: false as const, note: null }
  return { valid: true as const, note: note || null }
}

export function parseScore(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10
    ? value
    : null
}

export function parsePage(value: unknown) {
  if (value == null || value === "") return 1
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : null
}

export function parsePageSize(value: unknown, fallback: number, max = 100) {
  if (value == null || value === "") return fallback
  const size = Number(value)
  if (!Number.isInteger(size) || size < 1) return null
  return Math.min(size, max)
}
