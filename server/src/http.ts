import type { NextFunction, Request, RequestHandler, Response } from "express"

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

export function parseMediaType(value: unknown) {
  return value === "movie" || value === "tv" ? value : null
}

export function parseTmdbId(value: unknown) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
