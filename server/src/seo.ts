import express, { type Express } from "express"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { AppConfig } from "./config.js"
import { statusOf } from "./http.js"
import { genrePath, personPath, slugify, titlePath } from "./paths.js"
import { getGenreCatalog, getPerson, getTitle, listGenres, type MediaType } from "./tmdb.js"

type ShareMeta = {
  title: string
  description: string
  canonicalPath: string
  image?: string | null
  indexable?: boolean
}

const PRIVATE_PATHS = [
  "/profile",
  "/settings",
  "/collection/",
  "/lists/",
  "/diary",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]

const PRIVATE_PAGE_PATTERN =
  /^\/(?:collection\/|lists\/|diary$|profile$|settings$|login$|signup$|forgot-password$|reset-password$)/

const STATIC_PAGES: Record<string, { title: string; description: string }> = {
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

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char,
  )
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  )
}

function displayName(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

/// Replaces a tag if the template already has it, otherwise appends it to head.
function upsertTag(html: string, pattern: RegExp, tag: string) {
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `  ${tag}\n  </head>`)
}

export function withShareMeta(html: string, meta: ShareMeta, appOrigin: string) {
  const description = escapeHtml(meta.description.slice(0, 280))
  const title = escapeHtml(meta.title)
  const canonical = escapeHtml(new URL(meta.canonicalPath, appOrigin).toString())
  const robots = meta.indexable === false ? "noindex,nofollow" : "index,follow"

  let next = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
  const tags: [RegExp, string][] = [
    [/<meta name="description"[^>]*>/, `<meta name="description" content="${description}" />`],
    [/<meta name="robots"[^>]*>/, `<meta name="robots" content="${robots}" />`],
    [/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`],
    [/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`],
    [/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}" />`],
    [/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}" />`],
    [/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}" />`],
    [/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}" />`],
  ]
  for (const [pattern, tag] of tags) next = upsertTag(next, pattern, tag)

  if (meta.image) {
    const image = escapeHtml(meta.image)
    next = upsertTag(
      next,
      /<meta property="og:image"[^>]*>/,
      `<meta property="og:image" content="${image}" />`,
    )
    next = upsertTag(
      next,
      /<meta name="twitter:image"[^>]*>/,
      `<meta name="twitter:image" content="${image}" />`,
    )
    next = upsertTag(
      next,
      /<meta name="twitter:card"[^>]*>/,
      `<meta name="twitter:card" content="summary_large_image" />`,
    )
  }
  return next
}

export function applyCrawlerRoutes(app: Express, { appOrigin }: AppConfig) {
  app.get("/robots.txt", (_req, res) => {
    res
      .type("text/plain")
      .send(
        [
          "User-agent: *",
          "Allow: /",
          "",
          ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
          "",
          `Sitemap: ${appOrigin}/sitemap.xml`,
          "",
        ].join("\n"),
      )
  })

  app.get("/sitemap.xml", async (_req, res) => {
    const paths = ["/", "/search", "/genres", "/privacy", "/terms"]
    try {
      const genres = await listGenres()
      paths.push(...genres.map((genre) => genrePath(genre)))
    } catch {
      // Public pages still belong in the sitemap if TMDb is unavailable.
    }
    res.type("application/xml").send(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...paths.map((path) => `  <url><loc>${escapeXml(`${appOrigin}${path}`)}</loc></url>`),
        "</urlset>",
        "",
      ].join("\n"),
    )
  })
}

/**
 * Serves the built client, rewriting head tags per route so a shared link
 * previews as the title, person, or genre it points at rather than as the
 * generic shell an SPA would otherwise hand a crawler.
 */
export async function applyClientRoutes(app: Express, config: AppConfig) {
  const { appOrigin, clientDirectory } = config
  let indexHtml = ""
  try {
    indexHtml = await readFile(resolve(clientDirectory, "index.html"), "utf8")
  } catch {
    indexHtml = ""
  }

  const render = (res: express.Response, meta: ShareMeta, status = 200) => {
    res.status(status).type("html").send(withShareMeta(indexHtml, meta, appOrigin))
  }

  const sendCatalogError = (
    res: express.Response,
    error: unknown,
    canonicalPath: string,
    label: string,
  ) => {
    const status = statusOf(error) === 404 ? 404 : 503
    if (status === 503) res.setHeader("Retry-After", "60")
    render(
      res,
      {
        title: status === 404 ? "Page not found · Stub" : `${label} unavailable · Stub`,
        description:
          status === 404
            ? "This screen is not on the Stub programme."
            : `${label} is temporarily unavailable. Please try again shortly.`,
        canonicalPath,
        indexable: false,
      },
      status,
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

  app.use(async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || !req.accepts("html") || !indexHtml) {
      next()
      return
    }
    res.setHeader("Cache-Control", "no-cache")

    const legacyTitle = /^\/title\/(movie|tv)\/(\d+)$/.exec(req.path)
    const canonicalTitle = /^\/(movies|tv)\/(.+)-(\d+)$/.exec(req.path)
    const mediaType: MediaType | null = legacyTitle
      ? (legacyTitle[1] as MediaType)
      : canonicalTitle?.[1] === "movies"
        ? "movie"
        : canonicalTitle
          ? "tv"
          : null
    const titleId = Number(legacyTitle?.[2] ?? canonicalTitle?.[3])
    if (mediaType && Number.isSafeInteger(titleId)) {
      try {
        const title = await getTitle(mediaType, titleId)
        const canonicalPath = titlePath(title)
        if (req.path !== canonicalPath) {
          res.redirect(308, canonicalPath)
          return
        }
        render(res, {
          title: `${title.title} · Stub`,
          description: title.synopsis,
          image: title.posterUrl ?? title.backdropUrl,
          canonicalPath,
        })
      } catch (error) {
        sendCatalogError(res, error, req.path, "Title")
      }
      return
    }

    const legacyPerson = /^\/person\/(\d+)$/.exec(req.path)
    const canonicalPerson = /^\/people\/(.+)-(\d+)$/.exec(req.path)
    const personId = Number(legacyPerson?.[1] ?? canonicalPerson?.[2])
    if (Number.isSafeInteger(personId)) {
      try {
        const person = await getPerson(personId)
        const canonicalPath = personPath(person)
        if (req.path !== canonicalPath) {
          res.redirect(308, canonicalPath)
          return
        }
        render(res, {
          title: `${person.name} · Stub`,
          description:
            person.biography || `${person.name} on Stub — filmography and known titles.`,
          image: person.profileUrl,
          canonicalPath,
        })
      } catch (error) {
        sendCatalogError(res, error, req.path, "Person")
      }
      return
    }

    const legacyGenre = /^\/genre\/(\d+)$/.exec(req.path)
    if (legacyGenre) {
      try {
        res.redirect(308, genrePath(await getGenreCatalog(Number(legacyGenre[1]))))
      } catch (error) {
        sendCatalogError(res, error, req.path, "Genre")
      }
      return
    }

    const canonicalGenre = /^\/genres\/([^/]+)$/.exec(req.path)
    if (canonicalGenre) {
      try {
        const genres = await listGenres()
        const match = genres.find((item) => slugify(item.name) === canonicalGenre[1])
        if (!match) {
          sendCatalogError(
            res,
            Object.assign(new Error("Genre not found"), { status: 404 }),
            req.path,
            "Genre",
          )
          return
        }
        const catalog = await getGenreCatalog(match.id)
        const count = catalog.movies.length + catalog.shows.length
        render(res, {
          title: `${displayName(catalog.name)} · Stub`,
          description: `Browse ${count} ${catalog.name.toLowerCase()} titles on Stub.`,
          image: catalog.movies[0]?.posterUrl ?? catalog.shows[0]?.posterUrl,
          canonicalPath: genrePath(catalog),
        })
      } catch (error) {
        sendCatalogError(res, error, req.path, "Genre")
      }
      return
    }

    if (PRIVATE_PAGE_PATTERN.test(req.path)) {
      render(res, {
        title: "Stub — Your private watch archive",
        description: "Your private movie and television archive on Stub.",
        canonicalPath: req.path,
        indexable: false,
      })
      return
    }

    const staticPage = STATIC_PAGES[req.path]
    if (staticPage) {
      render(res, { ...staticPage, canonicalPath: req.path })
      return
    }

    render(
      res,
      {
        title: "Page not found · Stub",
        description: "This screen is not on the Stub programme.",
        canonicalPath: req.path,
        indexable: false,
      },
      404,
    )
  })
}
