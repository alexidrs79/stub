import cookieParser from "cookie-parser"
import compression from "compression"
import cors from "cors"
import { config } from "dotenv"
import express from "express"
import rateLimit from "express-rate-limit"
import helmet from "helmet"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  changePassword,
  deleteAccount,
  forgotPassword,
  resetPassword,
  updateProfile,
} from "./account.js"
import { login, logout, me, signup } from "./auth.js"
import {
  addCollectionTitle,
  createCollection,
  deleteDiaryEvent,
  deleteCollection,
  getCollection,
  listCollections,
  listDiary,
  removeCollectionTitle,
  removeFavorite,
  renameCollection,
  setFavorite,
  updateProgress,
} from "./collections.js"
import { prisma } from "./db.js"
import {
  genrePath,
  personPath,
  slugify,
  titlePath,
} from "./paths.js"
import {
  addToWatchlist,
  listTitles,
  markWatched,
  rateTitle,
  removeTitle,
} from "./lists.js"
import {
  getCatalog,
  getGenreCatalog,
  getGenreTitles,
  getPerson,
  getSimilarTitles,
  getTitle,
  listGenres,
  searchTitles,
  type MediaType,
} from "./tmdb.js"

config({ path: resolve(import.meta.dirname, "../.env"), quiet: true })

const app = express()
const port = Number(process.env.PORT) || 3001
const production = process.env.NODE_ENV === "production"

function normalizeOrigin(value: string, label: string) {
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

const appOrigin = normalizeOrigin(
  process.env.APP_URL ?? "http://localhost:5173",
  "APP_URL",
)
const secureProduction = production && new URL(appOrigin).protocol === "https:"
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => normalizeOrigin(origin, "ALLOWED_ORIGINS")),
)

if (production) {
  const missing = [
    "DATABASE_URL",
    "JWT_SECRET",
    "TMDB_API_KEY",
    "APP_URL",
    "RESEND_API_KEY",
    "RESEND_FROM",
  ].filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`Missing production environment: ${missing.join(", ")}`)
  }
  if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters")
  }
  app.set("trust proxy", 1)
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Try again shortly." },
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
})
const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many recovery attempts. Try again later." },
})
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many changes. Try again shortly." },
})

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
  if (
    secureProduction &&
    req.get("x-forwarded-proto") &&
    req.get("x-forwarded-proto") !== "https"
  ) {
    res.redirect(308, new URL(`${publicOrigin()}${req.originalUrl}`).toString())
    return
  }
  next()
})
app.use((req, res, next) => {
  const origin = req.get("origin")
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: "Origin not allowed." })
    return
  }
  if (
    req.get("sec-fetch-site") === "cross-site" &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  ) {
    res.status(403).json({ error: "Cross-site request blocked." })
    return
  }
  next()
})
app.use(cors({ origin: [...allowedOrigins], credentials: true }))
app.use(express.json({ limit: "16kb", strict: true }))
app.use(cookieParser())
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store")
  next()
})
app.use("/api", apiLimiter)
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next()
    return
  }
  writeLimiter(req, res, next)
})
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

app.post("/api/auth/signup", authLimiter, (req, res, next) => {
  signup(req, res).catch(next)
})
app.post("/api/auth/login", authLimiter, (req, res, next) => {
  login(req, res).catch(next)
})
app.post("/api/auth/logout", logout)
app.get("/api/auth/me", (req, res, next) => {
  me(req, res).catch(next)
})
app.post("/api/auth/forgot-password", recoveryLimiter, (req, res, next) => {
  forgotPassword(req, res).catch(next)
})
app.post("/api/auth/reset-password", recoveryLimiter, (req, res, next) => {
  resetPassword(req, res).catch(next)
})
app.patch("/api/account/profile", (req, res, next) => {
  updateProfile(req, res).catch(next)
})
app.put("/api/account/password", authLimiter, (req, res, next) => {
  changePassword(req, res).catch(next)
})
app.delete("/api/account", authLimiter, (req, res, next) => {
  deleteAccount(req, res).catch(next)
})

app.get("/api/titles", (req, res, next) => {
  listTitles(req, res).catch(next)
})
app.post("/api/watchlist", (req, res, next) => {
  addToWatchlist(req, res).catch(next)
})
app.post("/api/watched", (req, res, next) => {
  markWatched(req, res).catch(next)
})
app.put("/api/ratings", (req, res, next) => {
  rateTitle(req, res).catch(next)
})
app.delete("/api/titles/:mediaType/:id", (req, res, next) => {
  removeTitle(req, res).catch(next)
})
app.get("/api/lists", (req, res, next) => {
  listCollections(req, res).catch(next)
})
app.post("/api/lists", (req, res, next) => {
  createCollection(req, res).catch(next)
})
app.get("/api/lists/:id", (req, res, next) => {
  getCollection(req, res).catch(next)
})
app.patch("/api/lists/:id", (req, res, next) => {
  renameCollection(req, res).catch(next)
})
app.delete("/api/lists/:id", (req, res, next) => {
  deleteCollection(req, res).catch(next)
})
app.post("/api/lists/:id/titles", (req, res, next) => {
  addCollectionTitle(req, res).catch(next)
})
app.delete("/api/lists/:id/titles/:mediaType/:tmdbId", (req, res, next) => {
  removeCollectionTitle(req, res).catch(next)
})
app.put("/api/favorites", (req, res, next) => {
  setFavorite(req, res).catch(next)
})
app.delete("/api/favorites/:mediaType/:tmdbId", (req, res, next) => {
  removeFavorite(req, res).catch(next)
})
app.put("/api/progress", (req, res, next) => {
  updateProgress(req, res).catch(next)
})
app.get("/api/diary", (req, res, next) => {
  listDiary(req, res).catch(next)
})
app.delete("/api/diary/:eventId", (req, res, next) => {
  deleteDiaryEvent(req, res).catch(next)
})

app.get("/api/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : ""
  if (query.length < 2) {
    res.json([])
    return
  }
  if (query.length > 100) {
    res.status(400).json({ error: "Search terms can contain up to 100 characters." })
    return
  }
  try {
    res.json(await searchTitles(query))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: "Search failed" })
  }
})

function parseMediaType(value: unknown): MediaType | null {
  return value === "movie" || value === "tv" ? value : null
}

app.get("/api/catalog/now-playing", async (_req, res, next) => {
  getCatalog("now-playing").then((data) => res.json(data)).catch(next)
})
app.get("/api/catalog/upcoming", async (_req, res, next) => {
  getCatalog("upcoming").then((data) => res.json(data)).catch(next)
})
app.get("/api/catalog/trending", async (_req, res, next) => {
  getCatalog("trending").then((data) => res.json(data)).catch(next)
})
app.get("/api/catalog/popular", async (req, res) => {
  const mediaType = parseMediaType(req.query.mediaType)
  if (!mediaType) {
    res.status(400).json({ error: "Bad media type" })
    return
  }
  try {
    res.json(await getCatalog("popular", mediaType))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: "Catalog unavailable" })
  }
})
app.get("/api/catalog/top-rated", async (req, res) => {
  const mediaType = parseMediaType(req.query.mediaType)
  if (!mediaType) {
    res.status(400).json({ error: "Bad media type" })
    return
  }
  try {
    res.json(await getCatalog("top-rated", mediaType))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: "Catalog unavailable" })
  }
})
app.get("/api/catalog/genre/:id", async (req, res) => {
  const mediaType = parseMediaType(req.query.mediaType)
  const id = Number(req.params.id)
  if (!mediaType || !Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Bad genre" })
    return
  }
  try {
    res.json(await getGenreTitles(id, mediaType))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: "Catalog unavailable" })
  }
})
app.get("/api/genres", async (_req, res) => {
  try {
    res.json(await listGenres())
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: "Catalog unavailable" })
  }
})
app.get("/api/genre/:id", async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Bad genre" })
    return
  }
  try {
    res.json(await getGenreCatalog(id))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({
      error: status === 404 ? "Genre not found" : "Catalog unavailable",
    })
  }
})

app.get("/api/title/:mediaType/:id", async (req, res) => {
  const mediaType = req.params.mediaType
  const id = Number(req.params.id)
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    res.status(400).json({ error: "Bad title" })
    return
  }
  try {
    res.json(await getTitle(mediaType as MediaType, id))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: "Title not found" })
  }
})

app.get("/api/title/:mediaType/:id/similar", async (req, res) => {
  const mediaType = parseMediaType(req.params.mediaType)
  const id = Number(req.params.id)
  if (!mediaType || !Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Bad title" })
    return
  }
  try {
    res.json(await getSimilarTitles(mediaType, id))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({ error: "Similar titles unavailable" })
  }
})

app.get("/api/person/:id", async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Bad person" })
    return
  }
  try {
    res.json(await getPerson(id))
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500
    res.status(status).json({
      error: status === 404 ? "Person not found" : "Person unavailable",
    })
  }
})

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." })
})

function publicOrigin() {
  return appOrigin
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char,
  )
}

app.get("/robots.txt", (_req, res) => {
  const sitemap = `${publicOrigin()}/sitemap.xml`
  res
    .type("text/plain")
    .send(
      [
        "User-agent: *",
        "Allow: /",
        "",
        "Disallow: /profile",
        "Disallow: /settings",
        "Disallow: /collection/",
        "Disallow: /lists/",
        "Disallow: /diary",
        "Disallow: /login",
        "Disallow: /signup",
        "Disallow: /forgot-password",
        "Disallow: /reset-password",
        "",
        `Sitemap: ${sitemap}`,
        "",
      ].join("\n"),
    )
})

app.get("/sitemap.xml", async (_req, res) => {
  const origin = publicOrigin()
  const paths = ["/", "/search", "/genres", "/privacy", "/terms"]
  try {
    const genres = await listGenres()
    paths.push(...genres.map((genre) => genrePath(genre)))
  } catch {
    // Public pages still belong in the sitemap if TMDb is unavailable.
  }
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map(
      (path) =>
        `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`,
    ),
    "</urlset>",
    "",
  ].join("\n")
  res.type("application/xml").send(body)
})

if (production) {
  const clientDirectory = resolve(import.meta.dirname, "../../client/dist")
  const indexPath = resolve(clientDirectory, "index.html")
  let indexHtml = ""
  try {
    indexHtml = await readFile(indexPath, "utf8")
  } catch {
    indexHtml = ""
  }

  function displayName(value: string) {
    return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
  }

  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
    )
  }

  function withShareMeta(
    html: string,
    meta: {
      title: string
      description: string
      canonicalPath: string
      image?: string | null
      indexable?: boolean
    },
  ) {
    const description = escapeHtml(meta.description.slice(0, 280))
    const title = escapeHtml(meta.title)
    const canonical = escapeHtml(
      new URL(meta.canonicalPath, process.env.APP_URL).toString(),
    )
    const robots = meta.indexable === false ? "noindex,nofollow" : "index,follow"
    let next = html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
      .replace(
        /<meta name="description"[^>]*>/,
        `<meta name="description" content="${description}" />`,
      )
      .replace(
        /<meta name="robots"[^>]*>/,
        `<meta name="robots" content="${robots}" />`,
      )
      .replace(
        /<link rel="canonical"[^>]*>/,
        `<link rel="canonical" href="${canonical}" />`,
      )
      .replace(
        /<meta property="og:title"[^>]*>/,
        `<meta property="og:title" content="${title}" />`,
      )
      .replace(
        /<meta property="og:description"[^>]*>/,
        `<meta property="og:description" content="${description}" />`,
      )
      .replace(
        /<meta property="og:url"[^>]*>/,
        `<meta property="og:url" content="${canonical}" />`,
      )
      .replace(
        /<meta name="twitter:title"[^>]*>/,
        `<meta name="twitter:title" content="${title}" />`,
      )
      .replace(
        /<meta name="twitter:description"[^>]*>/,
        `<meta name="twitter:description" content="${description}" />`,
      )
    if (!next.includes('rel="canonical"')) {
      next = next.replace(
        "</head>",
        `  <link rel="canonical" href="${canonical}" />\n  </head>`,
      )
    }
    if (meta.image) {
      const image = escapeHtml(meta.image)
      if (next.includes('property="og:image"')) {
        next = next.replace(
          /<meta property="og:image"[^>]*>/,
          `<meta property="og:image" content="${image}" />`,
        )
      } else {
        next = next.replace(
          "</head>",
          `  <meta property="og:image" content="${image}" />\n  </head>`,
        )
      }
      if (next.includes('name="twitter:image"')) {
        next = next.replace(
          /<meta name="twitter:image"[^>]*>/,
          `<meta name="twitter:image" content="${image}" />`,
        )
      } else {
        next = next.replace(
          "</head>",
          `  <meta name="twitter:image" content="${image}" />\n  </head>`,
        )
      }
      next = next.replace(
        /<meta name="twitter:card"[^>]*>/,
        `<meta name="twitter:card" content="summary_large_image" />`,
      )
    }
    return next
  }

  function sendCatalogError(
    res: express.Response,
    error: unknown,
    canonicalPath: string,
    label: string,
  ) {
    const upstreamStatus =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500
    const status = upstreamStatus === 404 ? 404 : 503
    if (status === 503) res.setHeader("Retry-After", "60")
    res.status(status).type("html").send(
      withShareMeta(indexHtml, {
        title: status === 404 ? "Page not found · Stub" : `${label} unavailable · Stub`,
        description:
          status === 404
            ? "This screen is not on the Stub programme."
            : `${label} is temporarily unavailable. Please try again shortly.`,
        canonicalPath,
        indexable: false,
      }),
    )
  }

  app.use(
    express.static(clientDirectory, {
      index: false,
      maxAge: "1h",
      setHeaders(res, filePath) {
        if (filePath.includes(`${resolve(clientDirectory, "assets")}/`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
        }
      },
    }),
  )
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) ||
      !req.accepts("html") ||
      !indexHtml
    ) {
      next()
      return
    }
    res.setHeader("Cache-Control", "no-cache")
    const legacyTitleMatch = /^\/title\/(movie|tv)\/(\d+)$/.exec(req.path)
    const canonicalTitleMatch = /^\/(movies|tv)\/(.+)-(\d+)$/.exec(req.path)
    const legacyPersonMatch = /^\/person\/(\d+)$/.exec(req.path)
    const canonicalPersonMatch = /^\/people\/(.+)-(\d+)$/.exec(req.path)
    const legacyGenreMatch = /^\/genre\/(\d+)$/.exec(req.path)
    const canonicalGenreMatch = /^\/genres\/([^/]+)$/.exec(req.path)
    const mediaType = legacyTitleMatch
      ? (legacyTitleMatch[1] as MediaType)
      : canonicalTitleMatch?.[1] === "movies"
        ? "movie"
        : canonicalTitleMatch
          ? "tv"
          : null
    const titleId = Number(legacyTitleMatch?.[2] ?? canonicalTitleMatch?.[3])
    if (mediaType && Number.isSafeInteger(titleId)) {
      getTitle(mediaType, titleId)
        .then((title) => {
          const canonicalPath = titlePath(title)
          if (req.path !== canonicalPath) {
            res.redirect(308, canonicalPath)
            return
          }
          res.type("html").send(
            withShareMeta(indexHtml, {
              title: `${title.title} · Stub`,
              description: title.synopsis,
              image: title.posterUrl ?? title.backdropUrl,
              canonicalPath,
            }),
          )
        })
        .catch((error) => {
          sendCatalogError(res, error, req.path, "Title")
        })
      return
    }
    const personId = Number(legacyPersonMatch?.[1] ?? canonicalPersonMatch?.[2])
    if (Number.isSafeInteger(personId)) {
      getPerson(personId)
        .then((person) => {
          const canonicalPath = personPath(person)
          if (req.path !== canonicalPath) {
            res.redirect(308, canonicalPath)
            return
          }
          res.type("html").send(
            withShareMeta(indexHtml, {
              title: `${person.name} · Stub`,
              description:
                person.biography ||
                `${person.name} on Stub — filmography and known titles.`,
              image: person.profileUrl,
              canonicalPath,
            }),
          )
        })
        .catch((error) => {
          sendCatalogError(res, error, req.path, "Person")
        })
      return
    }
    if (legacyGenreMatch) {
      const id = Number(legacyGenreMatch[1])
      getGenreCatalog(id)
        .then((genre) => {
          res.redirect(308, genrePath(genre))
        })
        .catch((error) => {
          sendCatalogError(res, error, req.path, "Genre")
        })
      return
    }
    if (canonicalGenreMatch) {
      listGenres()
        .then((genres) => {
          const genre = genres.find(
            (item) => slugify(item.name) === canonicalGenreMatch[1],
          )
          if (!genre) {
            sendCatalogError(
              res,
              Object.assign(new Error("Genre not found"), { status: 404 }),
              req.path,
              "Genre",
            )
            return
          }
          return getGenreCatalog(genre.id).then((catalog) => {
            const canonicalPath = genrePath(catalog)
            const count = catalog.movies.length + catalog.shows.length
            res.type("html").send(
              withShareMeta(indexHtml, {
                title: `${displayName(catalog.name)} · Stub`,
                description: `Browse ${count} ${catalog.name.toLowerCase()} titles on Stub.`,
                image: catalog.movies[0]?.posterUrl ?? catalog.shows[0]?.posterUrl,
                canonicalPath,
              }),
            )
          })
        })
        .catch((error) => {
          sendCatalogError(res, error, req.path, "Genre")
        })
      return
    }
    const privatePage =
      /^\/(?:collection\/|lists\/|diary$|profile$|settings$|login$|signup$|forgot-password$|reset-password$)/.test(
        req.path,
      )
    if (privatePage) {
      res.type("html").send(
        withShareMeta(indexHtml, {
          title: "Stub — Your private watch archive",
          description: "Your private movie and television archive on Stub.",
          canonicalPath: req.path,
          indexable: false,
        }),
      )
      return
    }
    const staticPages: Record<string, { title: string; description: string }> = {
      "/": {
        title: "Stub — Your private watch archive",
        description:
          "Track movies and television with a private watchlist, viewing diary, ratings, favorites, and custom lists.",
      },
      "/search": {
        title: "Search · Stub",
        description: "Search movies and television to add to your Stub archive.",
      },
      "/genres": {
        title: "Genres · Stub",
        description: "Browse movies and television by genre on Stub.",
      },
      "/privacy": {
        title: "Privacy · Stub",
        description: "How Stub stores and uses your private watch archive.",
      },
      "/terms": {
        title: "Terms · Stub",
        description: "House rules for using Stub.",
      },
    }
    const staticPage = staticPages[req.path]
    if (staticPage) {
      res.type("html").send(
        withShareMeta(indexHtml, {
          ...staticPage,
          canonicalPath: req.path,
        }),
      )
      return
    }
    res.status(404).type("html").send(
      withShareMeta(indexHtml, {
        title: "Page not found · Stub",
        description: "This screen is not on the Stub programme.",
        canonicalPath: req.path,
        indexable: false,
      }),
    )
  })
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)
  const status =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500
  res.status(status).json({
    error:
      status === 413
        ? "Request is too large."
        : status >= 500
          ? "Server error"
          : "Invalid request.",
  })
})

const server = app.listen(port, () => {
  console.log(`Stub listening on port ${port}`)
})

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once("SIGTERM", () => void shutdown("SIGTERM"))
process.once("SIGINT", () => void shutdown("SIGINT"))
