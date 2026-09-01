import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { ApiError, fetchJson } from "./api"
import { setPageMeta } from "./pageMeta"
import { genrePath, slugify } from "./paths"
import { PosterCard } from "./PosterRail"
import type { ArchiveEntry, GenreCatalog, GenreInfo, SearchHit } from "./title"
import { titleKey } from "./title"

type GenrePageProps = {
  archive: ArchiveEntry[]
  signedIn: boolean
  onSave: (title: SearchHit) => void
}

type Filter = "all" | "movie" | "tv"

function displayName(name: string) {
  return name.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function PosterGrid({
  titles,
  archive,
  signedIn,
  onSave,
}: {
  titles: SearchHit[]
  archive: ArchiveEntry[]
  signedIn: boolean
  onSave: (title: SearchHit) => void
}) {
  const savedByKey = new Map(archive.map((title) => [titleKey(title), title]))

  return (
    <div className="genre-posters">
      {titles.map((item, index) => (
        <PosterCard
          key={titleKey(item)}
          title={item}
          saved={savedByKey.get(titleKey(item))}
          onSave={onSave}
          showStatus={signedIn}
          meta={`${item.year ?? "—"}${
            item.voteAverage != null ? ` · ${item.voteAverage.toFixed(1)}` : ""
          } · ${item.mediaType.toUpperCase()}`}
          loading={index < 12 ? "eager" : "lazy"}
        />
      ))}
    </div>
  )
}

export function GenrePage({ archive, signedIn, onSave }: GenrePageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id, genreSlug } = useParams()
  const genres = useQuery({
    queryKey: ["genres"],
    queryFn: () => fetchJson<GenreInfo[]>("/api/genres"),
    staleTime: 1000 * 60 * 60,
  })
  const matchedGenre = genreSlug
    ? genres.data?.find((item) => slugify(item.name) === genreSlug)
    : undefined
  const genreId = id ? Number(id) : (matchedGenre?.id ?? Number.NaN)
  const validId = Number.isSafeInteger(genreId) && genreId > 0
  const [filter, setFilter] = useState<Filter>("all")
  const genre = useQuery({
    queryKey: ["genre", genreId],
    queryFn: () => fetchJson<GenreCatalog>(`/api/genre/${genreId}`),
    enabled: validId,
    staleTime: 1000 * 60 * 15,
    retry: false,
  })

  useEffect(() => {
    if (!genre.data) return
    const data = genre.data
    const canonicalPath = genrePath(data)
    if (location.pathname !== canonicalPath) {
      navigate(canonicalPath, { replace: true })
      return
    }
    setPageMeta({
      title: `${displayName(data.name)} · Stub`,
      description: `Browse ${data.name.toLowerCase()} movies and television on Stub.`,
      image: data.movies[0]?.posterUrl ?? data.shows[0]?.posterUrl,
      canonicalPath,
    })
  }, [genre.data, location.pathname, navigate])

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate("/genres")
  }

  const notFound =
    ((!id && !genres.isLoading && !matchedGenre) || (id != null && !validId)) ||
    (genre.error instanceof ApiError &&
      (genre.error.status === 400 || genre.error.status === 404))

  if (notFound) {
    return (
      <main className="person-state">
        <button type="button" className="back-control" onClick={goBack}>
          ← BACK
        </button>
        <p>OFF THE BILL</p>
        <h1>Genre not found</h1>
        <span>This category is not listed in today’s programme.</span>
        <Link to="/genres" className="button-primary">
          BROWSE GENRES
        </Link>
      </main>
    )
  }

  if (genre.isError) {
    return (
      <main className="person-state">
        <button type="button" className="back-control" onClick={goBack}>
          ← BACK
        </button>
        <p>PROGRAMME DELAYED</p>
        <h1>Genre page unavailable</h1>
        <span>We could not load titles for this category.</span>
        <button
          type="button"
          className="button-primary"
          onClick={() => void genre.refetch()}
        >
          RETRY
        </button>
      </main>
    )
  }

  if (!genre.data) {
    return (
      <main className="py-24">
        <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
          LOADING
        </p>
      </main>
    )
  }

  const data = genre.data
  const filters: { id: Filter; label: string; hidden: boolean }[] = [
    { id: "all", label: "ALL", hidden: !(data.movie && data.tv) },
    { id: "movie", label: "MOVIES", hidden: !data.movie },
    { id: "tv", label: "TV", hidden: !data.tv },
  ]
  const visible = filters.filter((option) => !option.hidden)
  const showMovies = filter !== "tv" && data.movies.length > 0
  const showShows = filter !== "movie" && data.shows.length > 0
  const empty =
    (filter === "movie" && data.movies.length === 0) ||
    (filter === "tv" && data.shows.length === 0) ||
    (filter === "all" && data.movies.length === 0 && data.shows.length === 0)

  return (
    <main className="pb-24 pt-12">
      <button type="button" className="back-control" onClick={goBack}>
        ← BACK
      </button>
      <p className="mt-8 font-mono text-[10px] tracking-[0.16em] text-accent">
        GENRE
      </p>
      <h1 className="mt-3 font-display text-display-lg font-normal">
        {displayName(data.name)}
      </h1>
      <p className="mt-3 font-mono text-[11px] tracking-[0.06em] text-text-dim">
        {data.movies.length} MOVIES · {data.shows.length} TV
      </p>
      {visible.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {visible.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              className={filter === option.id ? "genre-chip is-active" : "genre-chip"}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {empty && (
        <div className="rail-state mt-16">
          <p>NO TITLES ON THIS REEL</p>
        </div>
      )}

      {showMovies && (
        <section className="mt-16">
          <div className="section-heading">
            <h2 className="font-display text-display-sm font-normal">Movies</h2>
            <span className="font-mono text-[11px] tracking-[0.06em] text-text-dim">
              {data.movies.length}
            </span>
          </div>
          <PosterGrid
            titles={data.movies}
            archive={archive}
            signedIn={signedIn}
            onSave={onSave}
          />
        </section>
      )}

      {showShows && (
        <section className="mt-16">
          <div className="section-heading">
            <h2 className="font-display text-display-sm font-normal">Television</h2>
            <span className="font-mono text-[11px] tracking-[0.06em] text-text-dim">
              {data.shows.length}
            </span>
          </div>
          <PosterGrid
            titles={data.shows}
            archive={archive}
            signedIn={signedIn}
            onSave={onSave}
          />
        </section>
      )}

      <Link to="/genres" className="back-control mt-16 inline-flex">
        ALL GENRES
      </Link>
    </main>
  )
}
