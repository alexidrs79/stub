const BASE = "https://api.themoviedb.org/3"
const IMG = "https://image.tmdb.org/t/p"

export type MediaType = "movie" | "tv"

type GenreMap = Map<number, string>

let movieGenres: GenreMap | null = null
let tvGenres: GenreMap | null = null
let movieGenresLoading: Promise<GenreMap> | null = null
let tvGenresLoading: Promise<GenreMap> | null = null

function apiKey() {
  const key = process.env.TMDB_API_KEY
  if (!key) {
    const error = new Error("TMDB_API_KEY is missing")
    ;(error as Error & { status: number }).status = 503
    throw error
  }
  return key
}

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set("api_key", apiKey())
  url.searchParams.set("language", "en-US")
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  } catch {
    const error = new Error("TMDb unavailable")
    ;(error as Error & { status: number }).status = 504
    throw error
  }
  if (!response.ok) {
    const error = new Error(`TMDb ${response.status}`)
    ;(error as Error & { status: number }).status = response.status
    throw error
  }
  return response.json() as Promise<T>
}

async function loadGenres(kind: MediaType): Promise<GenreMap> {
  const cached = kind === "movie" ? movieGenres : tvGenres
  if (cached) return cached
  const loading = kind === "movie" ? movieGenresLoading : tvGenresLoading
  if (loading) return loading

  const request = tmdb<{ genres: { id: number; name: string }[] }>(
    `/genre/${kind}/list`,
  ).then((data) => {
    const map = new Map(
      data.genres.map((genre) => [genre.id, genre.name.toUpperCase()]),
    )
    if (kind === "movie") movieGenres = map
    else tvGenres = map
    return map
  })
  if (kind === "movie") movieGenresLoading = request
  else tvGenresLoading = request
  try {
    return await request
  } finally {
    if (kind === "movie") movieGenresLoading = null
    else tvGenresLoading = null
  }
}

function yearFrom(date?: string | null) {
  if (!date || date.length < 4) return null
  const year = Number(date.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function imageUrl(size: string, path: string | null) {
  return path ? `${IMG}/${size}${path}` : null
}

function formatMinutes(minutes?: number | null) {
  if (!minutes) return "—"
  return `${minutes} MIN`
}

type SearchItem = {
  id: number
  media_type?: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path: string | null
  backdrop_path?: string | null
  genre_ids?: number[]
  vote_average?: number
  vote_count?: number
}

export type SearchHit = {
  tmdbId: number
  mediaType: MediaType
  title: string
  year: number | null
  releaseDate: string | null
  genre: string
  posterUrl: string | null
  backdropUrl: string | null
  voteAverage: number | null
}

function toSearchHit(item: SearchItem, mediaType: MediaType, genres: GenreMap): SearchHit {
  const genreId = item.genre_ids?.[0]
  return {
    tmdbId: item.id,
    mediaType,
    title: item.title ?? item.name ?? "Untitled",
    year: yearFrom(item.release_date ?? item.first_air_date),
    releaseDate: item.release_date ?? item.first_air_date ?? null,
    genre: (genreId ? genres.get(genreId) : null) ?? mediaType.toUpperCase(),
    posterUrl: imageUrl("w342", item.poster_path),
    backdropUrl: imageUrl("w1280", item.backdrop_path ?? null),
    voteAverage: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
  }
}

export async function searchTitles(query: string): Promise<SearchHit[]> {
  const [data, movies, shows] = await Promise.all([
    tmdb<{ results: SearchItem[] }>("/search/multi", {
      query,
      include_adult: "false",
    }),
    loadGenres("movie"),
    loadGenres("tv"),
  ])

  return data.results.flatMap((item) => {
    if (item.media_type !== "movie" && item.media_type !== "tv") return []
    const genres = item.media_type === "movie" ? movies : shows
    return [toSearchHit(item, item.media_type, genres)]
  })
}

type Credit = {
  id: number
  name: string
  job?: string
  character?: string
  profile_path?: string | null
}
type Video = { key: string; site: string; type: string; official?: boolean }

type DetailPayload = {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  runtime?: number | null
  episode_run_time?: number[]
  number_of_seasons?: number
  seasons?: {
    season_number: number
    name?: string
    episode_count: number
    air_date?: string | null
  }[]
  overview?: string
  poster_path: string | null
  backdrop_path: string | null
  genres?: { id: number; name: string }[]
  created_by?: { name: string }[]
  credits?: { cast?: Credit[]; crew?: Credit[] }
  videos?: { results?: Video[] }
  vote_average?: number
  vote_count?: number
}

export type TitleCard = {
  tmdbId: number
  mediaType: MediaType
  title: string
  year: number | null
  runtime: string
  genre: string
  genres: string[]
  posterUrl: string | null
  backdropUrl: string | null
  voteAverage: number | null
  seasonOptions: SeasonOption[]
}

type SeasonOption = {
  season: number
  name: string
  episodeCount: number
  airDate: string | null
}

type CastMember = {
  tmdbId: number
  name: string
  character: string
  profileUrl: string | null
}

type GenreRef = {
  id: number
  name: string
}

export type GenreInfo = {
  id: number
  name: string
  movie: boolean
  tv: boolean
}

export type GenreCatalog = GenreInfo & {
  movies: SearchHit[]
  shows: SearchHit[]
}

export type TitleDetail = TitleCard & {
  director: string
  synopsis: string
  cast: CastMember[]
  trailerKey: string | null
  voteCount: number
  releaseDate: string | null
  genreRefs: GenreRef[]
}

function runtimeOf(mediaType: MediaType, data: DetailPayload) {
  if (mediaType === "movie") return formatMinutes(data.runtime)
  if (data.episode_run_time?.[0]) return formatMinutes(data.episode_run_time[0])
  if (data.number_of_seasons) return `${data.number_of_seasons} SZN`
  return "—"
}

function seasonOptionsOf(data: DetailPayload): SeasonOption[] {
  return (data.seasons ?? [])
    .filter(
      (season) =>
        Number.isSafeInteger(season.season_number) &&
        season.season_number > 0 &&
        Number.isSafeInteger(season.episode_count) &&
        season.episode_count > 0,
    )
    .map((season) => ({
      season: season.season_number,
      name: season.name?.trim() || `Season ${season.season_number}`,
      episodeCount: season.episode_count,
      airDate: season.air_date ?? null,
    }))
    .sort((a, b) => a.season - b.season)
}

const cardCache = new Map<string, { at: number; card: TitleCard }>()
const CARD_TTL = 10 * 60 * 1000

export async function getTitleCard(mediaType: MediaType, id: number): Promise<TitleCard> {
  const key = `${mediaType}-${id}`
  const cached = cardCache.get(key)
  if (cached && Date.now() - cached.at < CARD_TTL) return cached.card

  const data = await tmdb<DetailPayload>(`/${mediaType}/${id}`)
  const genres = (data.genres ?? []).map((genre) => genre.name.toUpperCase())
  const card: TitleCard = {
    tmdbId: data.id,
    mediaType,
    title: data.title ?? data.name ?? "Untitled",
    year: yearFrom(data.release_date ?? data.first_air_date),
    runtime: runtimeOf(mediaType, data),
    genre: genres[0] ?? mediaType.toUpperCase(),
    genres: genres.length > 0 ? genres : [mediaType.toUpperCase()],
    posterUrl: imageUrl("w342", data.poster_path),
    backdropUrl: imageUrl("w1280", data.backdrop_path),
    voteAverage: data.vote_average ? Math.round(data.vote_average * 10) / 10 : null,
    seasonOptions: mediaType === "tv" ? seasonOptionsOf(data) : [],
  }
  cardCache.set(key, { at: Date.now(), card })
  return card
}

function pickTrailer(videos: Video[] | undefined) {
  if (!videos) return null
  const youtube = videos.filter((video) => video.site === "YouTube")
  const trailer =
    youtube.find((video) => video.type === "Trailer" && video.official) ??
    youtube.find((video) => video.type === "Trailer") ??
    youtube[0]
  return trailer?.key ?? null
}

const titleCache = new Map<string, { at: number; title: TitleDetail }>()
const TITLE_TTL = 10 * 60 * 1000

export async function getTitle(mediaType: MediaType, id: number): Promise<TitleDetail> {
  const cacheKey = `${mediaType}-${id}`
  const cached = titleCache.get(cacheKey)
  if (cached && Date.now() - cached.at < TITLE_TTL) return cached.title

  const data = await tmdb<DetailPayload>(`/${mediaType}/${id}`, {
    append_to_response: "credits,videos",
  })

  const directors =
    mediaType === "tv" && data.created_by?.length
      ? data.created_by.map((person) => person.name)
      : (data.credits?.crew ?? [])
          .filter((person) => person.job === "Director")
          .map((person) => person.name)

  const genreRefs = (data.genres ?? [])
    .filter((genre) => Number.isSafeInteger(genre.id) && genre.id > 0)
    .map((genre) => ({ id: genre.id, name: genre.name.toUpperCase() }))
  const genres = genreRefs.map((genre) => genre.name)
  const title: TitleDetail = {
    tmdbId: data.id,
    mediaType,
    title: data.title ?? data.name ?? "Untitled",
    year: yearFrom(data.release_date ?? data.first_air_date),
    runtime: runtimeOf(mediaType, data),
    genre: genres[0] ?? mediaType.toUpperCase(),
    genres: genres.length > 0 ? genres : [mediaType.toUpperCase()],
    genreRefs,
    posterUrl: imageUrl("w500", data.poster_path),
    backdropUrl: imageUrl("w1280", data.backdrop_path),
    voteAverage: data.vote_average ? Math.round(data.vote_average * 10) / 10 : null,
    director: directors.join(" & ") || "—",
    synopsis: data.overview?.trim() || "No synopsis on file.",
    cast: (data.credits?.cast ?? []).slice(0, 16).map((person) => ({
      tmdbId: person.id,
      name: person.name,
      character: person.character ?? "—",
      profileUrl: imageUrl("w185", person.profile_path ?? null),
    })),
    trailerKey: pickTrailer(data.videos?.results),
    voteCount: data.vote_count ?? 0,
    releaseDate: data.release_date ?? data.first_air_date ?? null,
    seasonOptions: mediaType === "tv" ? seasonOptionsOf(data) : [],
  }
  titleCache.set(cacheKey, { at: Date.now(), title })
  return title
}

type PersonCreditPayload = {
  id: number
  media_type?: string
  title?: string
  name?: string
  release_date?: string | null
  first_air_date?: string | null
  character?: string
  poster_path: string | null
  backdrop_path?: string | null
  genre_ids?: number[]
  vote_average?: number
  vote_count?: number
  popularity?: number
  order?: number
}

type PersonPayload = {
  id: number
  name: string
  biography?: string
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  known_for_department?: string
  profile_path: string | null
  combined_credits?: { cast?: PersonCreditPayload[] }
}

type PersonCredit = {
  tmdbId: number
  mediaType: MediaType
  title: string
  year: number | null
  character: string
  posterUrl: string | null
  voteAverage: number | null
}

export type PersonDetail = {
  tmdbId: number
  name: string
  biography: string
  birthday: string | null
  deathday: string | null
  placeOfBirth: string | null
  knownForDepartment: string
  profileUrl: string | null
  knownFor: SearchHit[]
  credits: {
    movies: PersonCredit[]
    tv: PersonCredit[]
  }
}

function creditMediaType(credit: PersonCreditPayload): MediaType | null {
  return credit.media_type === "movie" || credit.media_type === "tv"
    ? credit.media_type
    : null
}

function toPersonCredit(credit: PersonCreditPayload, mediaType: MediaType): PersonCredit {
  return {
    tmdbId: credit.id,
    mediaType,
    title: credit.title ?? credit.name ?? "Untitled",
    year: yearFrom(credit.release_date ?? credit.first_air_date),
    character: credit.character?.trim() || "—",
    posterUrl: imageUrl("w342", credit.poster_path),
    voteAverage: credit.vote_average
      ? Math.round(credit.vote_average * 10) / 10
      : null,
  }
}

function uniqueCredits(credits: PersonCreditPayload[], mediaType: MediaType) {
  const seen = new Set<number>()
  return credits
    .filter((credit) => creditMediaType(credit) === mediaType)
    .filter((credit) => {
      if (seen.has(credit.id)) return false
      seen.add(credit.id)
      return true
    })
    .sort((a, b) => {
      const yearDiff =
        (yearFrom(b.release_date ?? b.first_air_date) ?? -1) -
        (yearFrom(a.release_date ?? a.first_air_date) ?? -1)
      if (yearDiff !== 0) return yearDiff
      return (b.popularity ?? 0) - (a.popularity ?? 0)
    })
    .slice(0, 40)
    .map((credit) => toPersonCredit(credit, mediaType))
}

const personCache = new Map<string, { at: number; person: PersonDetail }>()
const PERSON_TTL = 10 * 60 * 1000

export async function getPerson(id: number): Promise<PersonDetail> {
  const key = String(id)
  const cached = personCache.get(key)
  if (cached && Date.now() - cached.at < PERSON_TTL) return cached.person

  const [data, movieGenreMap, tvGenreMap] = await Promise.all([
    tmdb<PersonPayload>(`/person/${id}`, {
      append_to_response: "combined_credits",
    }),
    loadGenres("movie"),
    loadGenres("tv"),
  ])
  const cast = data.combined_credits?.cast ?? []
  const acting = (data.known_for_department ?? "Acting").toLowerCase() === "acting"
  const talkGenres = new Set([10763, 10764, 10767])
  function isCameo(credit: PersonCreditPayload) {
    const character = (credit.character ?? "").toLowerCase()
    return (
      /\bself\b/.test(character) ||
      character.includes("himself") ||
      character.includes("herself") ||
      character.includes("archive footage") ||
      character.includes("uncredited")
    )
  }
  function isTalkCredit(credit: PersonCreditPayload) {
    return (credit.genre_ids ?? []).some((genreId) => talkGenres.has(genreId))
  }
  function knownForRank(a: PersonCreditPayload, b: PersonCreditPayload) {
    const votes = (b.vote_count ?? 0) - (a.vote_count ?? 0)
    if (votes !== 0) return votes
    const popularity = (b.popularity ?? 0) - (a.popularity ?? 0)
    return popularity || (a.order ?? 999) - (b.order ?? 999)
  }
  const ranked = [...cast]
    .filter((credit) => creditMediaType(credit) != null)
    .sort(knownForRank)
  const notable = ranked.filter((credit) => {
    if (acting && isTalkCredit(credit)) return false
    if (isCameo(credit) && (credit.vote_count ?? 0) < 5000) return false
    return true
  })
  const knownFor = (notable.length >= 6 ? notable : ranked)
  const seenKnownFor = new Set<string>()
  const knownForCards = knownFor.flatMap((credit) => {
    const mediaType = creditMediaType(credit)
    if (!mediaType) return []
    const creditKey = `${mediaType}-${credit.id}`
    if (seenKnownFor.has(creditKey)) return []
    seenKnownFor.add(creditKey)
    const genres = mediaType === "movie" ? movieGenreMap : tvGenreMap
    return [
      toSearchHit(
        {
          id: credit.id,
          media_type: mediaType,
          title: credit.title,
          name: credit.name,
          release_date: credit.release_date ?? undefined,
          first_air_date: credit.first_air_date ?? undefined,
          poster_path: credit.poster_path,
          backdrop_path: credit.backdrop_path,
          genre_ids: credit.genre_ids,
          vote_average: credit.vote_average,
        },
        mediaType,
        genres,
      ),
    ]
  }).slice(0, 12)

  const person: PersonDetail = {
    tmdbId: data.id,
    name: data.name,
    biography: data.biography?.trim() || "",
    birthday: data.birthday ?? null,
    deathday: data.deathday ?? null,
    placeOfBirth: data.place_of_birth?.trim() || null,
    knownForDepartment: data.known_for_department?.trim() || "PERFORMER",
    profileUrl: imageUrl("h632", data.profile_path),
    knownFor: knownForCards,
    credits: {
      movies: uniqueCredits(cast, "movie"),
      tv: uniqueCredits(cast, "tv"),
    },
  }
  personCache.set(key, { at: Date.now(), person })
  return person
}

type CatalogPath =
  | "now-playing"
  | "upcoming"
  | "trending"
  | "popular"
  | "top-rated"

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

/* TMDb's /movie/upcoming list is region-sensitive and keeps re-releases of old
   films, so it returns titles that are neither new nor upcoming. Discover with
   an explicit primary-release window is the only reliable "not out yet" feed. */
async function getUpcomingMovies(): Promise<SearchHit[]> {
  const today = new Date()
  const horizon = new Date(today)
  horizon.setMonth(horizon.getMonth() + 6)

  const [data, genres] = await Promise.all([
    tmdb<{ results: SearchItem[] }>("/discover/movie", {
      "primary_release_date.gte": isoDate(today),
      "primary_release_date.lte": isoDate(horizon),
      sort_by: "popularity.desc",
      include_adult: "false",
      "vote_count.gte": "0",
    }),
    loadGenres("movie"),
  ])

  return data.results
    .filter((item) => item.poster_path && item.release_date)
    .map((item) => toSearchHit(item, "movie", genres))
    .sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""))
    .slice(0, 18)
}

async function loadCatalog(
  kind: CatalogPath,
  mediaType: MediaType = "movie",
): Promise<SearchHit[]> {
  if (kind === "upcoming") return getUpcomingMovies()
  const path =
    kind === "trending"
      ? "/trending/all/week"
      : kind === "now-playing"
        ? "/movie/now_playing"
        : `/${mediaType}/${kind.replace("-", "_")}`
  const [data, movies, shows] = await Promise.all([
    tmdb<{ results: SearchItem[] }>(path),
    loadGenres("movie"),
    loadGenres("tv"),
  ])
  return data.results.flatMap((item) => {
    const kindFromItem =
      item.media_type === "movie" || item.media_type === "tv"
        ? item.media_type
        : mediaType
    const genres = kindFromItem === "movie" ? movies : shows
    return [toSearchHit(item, kindFromItem, genres)]
  })
}

const catalogCache = new Map<string, { at: number; titles: SearchHit[] }>()
const catalogLoading = new Map<string, Promise<SearchHit[]>>()
const CATALOG_TTL = 10 * 60 * 1000

export async function getCatalog(
  kind: CatalogPath,
  mediaType: MediaType = "movie",
): Promise<SearchHit[]> {
  const key = `${kind}:${mediaType}`
  const cached = catalogCache.get(key)
  if (cached && Date.now() - cached.at < CATALOG_TTL) return cached.titles
  const loading = catalogLoading.get(key)
  if (loading) return loading

  const request = loadCatalog(kind, mediaType).then((titles) => {
    catalogCache.set(key, { at: Date.now(), titles })
    return titles
  })
  catalogLoading.set(key, request)
  try {
    return await request
  } finally {
    if (catalogLoading.get(key) === request) catalogLoading.delete(key)
  }
}

async function discoverByGenre(
  mediaType: MediaType,
  genreId: number,
  pages: number,
): Promise<SearchHit[]> {
  const [genreMap, ...responses] = await Promise.all([
    loadGenres(mediaType),
    ...Array.from({ length: pages }, (_, index) =>
      tmdb<{ results: SearchItem[] }>(`/discover/${mediaType}`, {
        with_genres: String(genreId),
        sort_by: "popularity.desc",
        include_adult: "false",
        page: String(index + 1),
      }),
    ),
  ])
  const seen = new Set<number>()
  const titles: SearchHit[] = []
  for (const data of responses) {
    for (const item of data.results) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      titles.push(toSearchHit(item, mediaType, genreMap))
    }
  }
  return titles
}

export async function getGenreTitles(
  genreId: number,
  mediaType: MediaType,
): Promise<SearchHit[]> {
  return discoverByGenre(mediaType, genreId, 1)
}

export async function listGenres(): Promise<GenreInfo[]> {
  const [movies, shows] = await Promise.all([
    loadGenres("movie"),
    loadGenres("tv"),
  ])
  const byId = new Map<number, GenreInfo>()
  for (const [id, name] of movies) {
    byId.set(id, { id, name, movie: true, tv: false })
  }
  for (const [id, name] of shows) {
    const existing = byId.get(id)
    if (existing) existing.tv = true
    else byId.set(id, { id, name, movie: false, tv: true })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const genreCatalogCache = new Map<number, { at: number; catalog: GenreCatalog }>()
const GENRE_TTL = 15 * 60 * 1000

export async function getGenreCatalog(genreId: number): Promise<GenreCatalog> {
  const cached = genreCatalogCache.get(genreId)
  if (cached && Date.now() - cached.at < GENRE_TTL) return cached.catalog

  const info = (await listGenres()).find((genre) => genre.id === genreId)
  if (!info) {
    const error = new Error("Genre not found")
    ;(error as Error & { status: number }).status = 404
    throw error
  }

  const [movies, shows] = await Promise.all([
    info.movie ? discoverByGenre("movie", genreId, 2) : Promise.resolve([]),
    info.tv ? discoverByGenre("tv", genreId, 2) : Promise.resolve([]),
  ])
  const catalog = { ...info, movies, shows }
  genreCatalogCache.set(genreId, { at: Date.now(), catalog })
  return catalog
}

const similarCache = new Map<string, { at: number; titles: SearchHit[] }>()

export async function getSimilarTitles(
  mediaType: MediaType,
  id: number,
): Promise<SearchHit[]> {
  const cacheKey = `${mediaType}-${id}`
  const cached = similarCache.get(cacheKey)
  if (cached && Date.now() - cached.at < TITLE_TTL) return cached.titles

  const [data, genres] = await Promise.all([
    tmdb<{ results: SearchItem[] }>(`/${mediaType}/${id}/similar`),
    loadGenres(mediaType),
  ])
  const ranked = [...data.results].sort(
    (a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0),
  )
  const filtered = ranked.filter((item) => (item.vote_count ?? 0) >= 80)
  const titles = (filtered.length >= 6 ? filtered : ranked)
    .slice(0, 12)
    .map((item) => toSearchHit(item, mediaType, genres))
  similarCache.set(cacheKey, { at: Date.now(), titles })
  return titles
}
