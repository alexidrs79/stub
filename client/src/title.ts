export type MediaType = "movie" | "tv"
type TitleStatus = "watchlist" | "watching" | "watched"

export type SavedTitle = {
  tmdbId: number
  mediaType: MediaType
  title: string
  year: number | null
  runtime: string
  genre: string
  genres: string[]
  posterUrl: string | null
  status: TitleStatus
  score: number | null
  note: string | null
  serial: string
  favorite: boolean
  progress: { season: number; episode: number } | null
  lastWatchedAt: string | null
  savedAt: string
  customListIds: string[]
  seasonOptions: SeasonOption[]
}

type SeasonOption = {
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

export function upsertSaved(list: SavedTitle[], title: SavedTitle) {
  const key = titleKey(title)
  if (list.some((item) => titleKey(item) === key)) {
    return list.map((item) => (titleKey(item) === key ? title : item))
  }
  return [title, ...list]
}
