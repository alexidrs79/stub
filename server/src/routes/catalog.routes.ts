import { Router } from "express"
import { BadRequest, catalogRoute, parseMediaType, parseTmdbId } from "../http.js"
import {
  getCatalog,
  getGenreCatalog,
  getGenreTitles,
  getPerson,
  getSimilarTitles,
  getTitle,
  listGenres,
  searchTitles,
} from "../tmdb.js"

export const catalogRoutes = Router()

const UNAVAILABLE = "Catalog unavailable"

function requireMediaType(value: unknown) {
  const mediaType = parseMediaType(value)
  if (!mediaType) throw new BadRequest("Bad media type")
  return mediaType
}

function requireId(value: unknown, label: string) {
  const id = parseTmdbId(value)
  if (id == null) throw new BadRequest(`Bad ${label}`)
  return id
}

catalogRoutes.get(
  "/search",
  catalogRoute(async (req) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : ""
    if (query.length < 2) return []
    if (query.length > 100) {
      throw new BadRequest("Search terms can contain up to 100 characters.")
    }
    return searchTitles(query)
  }, "Search failed"),
)

catalogRoutes.get(
  "/catalog/now-playing",
  catalogRoute(() => getCatalog("now-playing"), UNAVAILABLE),
)
catalogRoutes.get(
  "/catalog/upcoming",
  catalogRoute(() => getCatalog("upcoming"), UNAVAILABLE),
)
catalogRoutes.get(
  "/catalog/trending",
  catalogRoute(() => getCatalog("trending"), UNAVAILABLE),
)
catalogRoutes.get(
  "/catalog/popular",
  catalogRoute(
    (req) => getCatalog("popular", requireMediaType(req.query.mediaType)),
    UNAVAILABLE,
  ),
)
catalogRoutes.get(
  "/catalog/top-rated",
  catalogRoute(
    (req) => getCatalog("top-rated", requireMediaType(req.query.mediaType)),
    UNAVAILABLE,
  ),
)
catalogRoutes.get(
  "/catalog/genre/:id",
  catalogRoute(
    (req) =>
      getGenreTitles(
        requireId(req.params.id, "genre"),
        requireMediaType(req.query.mediaType),
      ),
    UNAVAILABLE,
  ),
)

catalogRoutes.get("/genres", catalogRoute(() => listGenres(), UNAVAILABLE))
catalogRoutes.get(
  "/genre/:id",
  catalogRoute(
    (req) => getGenreCatalog(requireId(req.params.id, "genre")),
    (status) => (status === 404 ? "Genre not found" : UNAVAILABLE),
  ),
)

catalogRoutes.get(
  "/title/:mediaType/:id",
  catalogRoute(
    (req) =>
      getTitle(requireMediaType(req.params.mediaType), requireId(req.params.id, "title")),
    (status) => (status === 404 ? "Title not found" : "Title unavailable"),
  ),
)
catalogRoutes.get(
  "/title/:mediaType/:id/similar",
  catalogRoute(
    (req) =>
      getSimilarTitles(
        requireMediaType(req.params.mediaType),
        requireId(req.params.id, "title"),
      ),
    "Similar titles unavailable",
  ),
)

catalogRoutes.get(
  "/person/:id",
  catalogRoute(
    (req) => getPerson(requireId(req.params.id, "person")),
    (status) => (status === 404 ? "Person not found" : "Person unavailable"),
  ),
)
