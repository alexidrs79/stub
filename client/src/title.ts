export type MediaType = "movie" | "tv"
type TitleStatus = "watchlist" | "watching" | "watched"

/// What the archive knows about a title without TMDb. Every page loads the full
/// set of these to mark titles the user already saved.
export type ArchiveEntry = {
  tmdbId: number
  mediaType: MediaType
  status: TitleStatus
  score: number | null
  note: string | null
  serial: string
  favorite: boolean
  progress: { season: number; episode: number } | null
  lastWatchedAt: string | null
  savedAt: string
  customListIds: string[]
}

/// An archive entry with its artwork. Only paged views load these.
export type SavedTitle = ArchiveEntry & {
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

export type Paged<T> = {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
} & T

export type SeasonOption = {
  season: number
  name: string
  episodeCount: number
  airDate: string | null
}

export type CollectionList = {
  id: string
  name: string
  type: "watchlist" | "watching" | "watched" | "custom"
  count: number
}

export type CustomCollection = {
  id: string
  name: string
  type: "custom"
  titles: SavedTitle[]
}

export type DiaryEvent = {
  id: string
  watchedAt: string
  score: number | null
  note: string | null
  title: SavedTitle
}

export type ArchivePage = Paged<{ titles: SavedTitle[] }>
export type DiaryPageResponse = Paged<{ events: DiaryEvent[] }>

export type ArchiveView = "watchlist" | "watching" | "watched" | "favorites"
export type ArchiveSort = "added" | "title" | "year" | "score"

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

type CastMember = {
  tmdbId: number
  name: string
  character: string
  profileUrl: string | null
}

export type PersonCredit = {
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

export type TitleDetail = SearchHit & {
  runtime: string
  genres: string[]
  genreRefs?: { id: number; name: string }[]
  director: string
  synopsis: string
  cast: CastMember[]
  trailerKey: string | null
  voteCount: number
  releaseDate: string | null
  seasonOptions: SeasonOption[]
}

export function titleKey(title: { mediaType: MediaType; tmdbId: number }) {
  return `${title.mediaType}-${title.tmdbId}`
}

export function upsertSaved<T extends { mediaType: MediaType; tmdbId: number }>(
  list: T[],
  title: T,
) {
  const key = titleKey(title)
  if (list.some((item) => titleKey(item) === key)) {
    return list.map((item) => (titleKey(item) === key ? title : item))
  }
  return [title, ...list]
}

/// Strips a hydrated title back to its archive fields, so a mutation response
/// can update the index without carrying artwork into it.
export function toArchiveEntry(title: SavedTitle): ArchiveEntry {
  return {
    tmdbId: title.tmdbId,
    mediaType: title.mediaType,
    status: title.status,
    score: title.score,
    note: title.note,
    serial: title.serial,
    favorite: title.favorite,
    progress: title.progress,
    lastWatchedAt: title.lastWatchedAt,
    savedAt: title.savedAt,
    customListIds: title.customListIds,
  }
}
