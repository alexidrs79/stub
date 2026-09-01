import { useQuery } from "@tanstack/react-query"
import { type CSSProperties, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { fetchJson } from "./api"
import { Marquee } from "./Marquee"
import { MediaImage } from "./MediaImage"
import { PosterRail } from "./PosterRail"
import { genrePath, titlePath } from "./paths"
import { TicketStub } from "./TicketStub"
import type { ArchiveEntry, GenreInfo, MediaType, SavedTitle, SearchHit } from "./title"
import { useArchivePage } from "./useArchive"
import { titleKey } from "./title"

const fanTilt = [-3.2, 2.2, -1.4, 2.8, -2.4, 1.6]
const genres = [
  { id: 18, label: "Drama" },
  { id: 35, label: "Comedy" },
  { id: 53, label: "Thriller" },
  { id: 878, label: "Sci-Fi" },
  { id: 27, label: "Horror" },
  { id: 16, label: "Animation" },
  { id: 99, label: "Documentary" },
  { id: 80, label: "Crime" },
]

function kindLabel(genre: GenreInfo | undefined) {
  if (!genre) return null
  if (genre.movie && genre.tv) return "MOVIES · TV"
  return genre.tv ? "TV" : "MOVIES"
}

function releaseLabel(title: SearchHit) {
  if (!title.releaseDate) return title.year ? String(title.year) : "—"
  const date = new Date(`${title.releaseDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(title.year ?? "—")
  return date
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase()
}

function EmptyStubs({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex items-center gap-6">
      <div className="stub-ghost" aria-hidden="true" />
      <p className="font-mono text-[11px] leading-6 tracking-[0.06em] text-text-dim">
        {children}
      </p>
    </div>
  )
}

function StubRack({
  heading,
  titles,
  total,
  loading,
  justStamped,
  onMarkWatched,
  onToggleFavorite,
}: {
  heading: string
  titles: SavedTitle[]
  total: number
  loading: boolean
  justStamped: string | null
  onMarkWatched: (tmdbId: number, mediaType: MediaType, name: string) => void
  onToggleFavorite: (entry: ArchiveEntry) => void
}) {
  if (loading) {
    return (
      <section className="mt-16">
        <div className="section-heading">
          <h2 className="font-display text-display-sm font-normal">{heading}</h2>
        </div>
        <div className="skeleton-pulse mt-6 h-36 bg-surface" />
      </section>
    )
  }
  return (
    <section className="mt-16">
      {titles.length === 0 ? (
        <>
          <div className="section-heading">
            <h2 className="font-display text-display-sm font-normal">{heading}</h2>
          </div>
          <EmptyStubs>
            Nothing here yet —{" "}
            <Link to="/search" className="text-accent hover:underline">
              search for something to add.
            </Link>
          </EmptyStubs>
        </>
      ) : (
        <Marquee
          count={titles.length}
          heading={
            <>
              <h2 className="font-display text-display-sm font-normal">{heading}</h2>
              <span className="shrink-0 font-mono text-[11px] tracking-[0.06em] text-text-dim">
                {total} {total === 1 ? "TITLE" : "TITLES"}
              </span>
            </>
          }
        >
          {titles.map((title, index) => (
            <div
              key={titleKey(title)}
              className="marquee-item ticket-tilt"
              style={{
                "--ticket-angle": `${fanTilt[index % fanTilt.length]}deg`,
                "--ticket-hover-angle": `${Math.sign(fanTilt[index % fanTilt.length]) * Math.max(0, Math.abs(fanTilt[index % fanTilt.length]) - 1)}deg`,
              } as CSSProperties}
            >
              <TicketStub
                title={title}
                animateStamp={justStamped === titleKey(title)}
                onMarkWatched={onMarkWatched}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          ))}
        </Marquee>
      )}
    </section>
  )
}

type HomePageProps = {
  archive: ArchiveEntry[]
  signedIn: boolean
  justStamped: string | null
  onSave: (title: SearchHit) => void
  onMarkWatched: (tmdbId: number, mediaType: MediaType, name: string) => void
  onToggleFavorite: (entry: ArchiveEntry) => void
}

/// Each rack shows the first handful of a view rather than the whole archive,
/// so the home page costs the same whether a user has ten titles or a thousand.
const RACK_SIZE = 12

export function HomePage({
  archive,
  signedIn,
  justStamped,
  onSave,
  onMarkWatched,
  onToggleFavorite,
}: HomePageProps) {
  const trending = useQuery({
    queryKey: ["catalog", "trending"],
    queryFn: () => fetchJson<SearchHit[]>("/api/catalog/trending"),
    staleTime: 1000 * 60 * 15,
  })
  const theatres = useQuery({
    queryKey: ["catalog", "now-playing"],
    queryFn: () => fetchJson<SearchHit[]>("/api/catalog/now-playing"),
    staleTime: 1000 * 60 * 15,
  })
  const movies = useQuery({
    queryKey: ["catalog", "popular", "movie"],
    queryFn: () => fetchJson<SearchHit[]>("/api/catalog/popular?mediaType=movie"),
    staleTime: 1000 * 60 * 15,
  })
  const shows = useQuery({
    queryKey: ["catalog", "popular", "tv"],
    queryFn: () => fetchJson<SearchHit[]>("/api/catalog/popular?mediaType=tv"),
    staleTime: 1000 * 60 * 15,
  })
  const upcoming = useQuery({
    queryKey: ["catalog", "upcoming"],
    queryFn: () => fetchJson<SearchHit[]>("/api/catalog/upcoming"),
    staleTime: 1000 * 60 * 15,
  })
  const genreCatalog = useQuery({
    queryKey: ["genres"],
    queryFn: () => fetchJson<GenreInfo[]>("/api/genres"),
    staleTime: 1000 * 60 * 60,
  })

  const rackOptions = { pageSize: RACK_SIZE, enabled: signedIn }
  const watchlist = useArchivePage("watchlist", rackOptions)
  const watching = useArchivePage("watching", rackOptions)
  const watched = useArchivePage("watched", rackOptions)

  const genreById = new Map((genreCatalog.data ?? []).map((genre) => [genre.id, genre]))
  const featured = trending.data?.find((title) => title.backdropUrl)
  const savedKeys = new Set(archive.map(titleKey))

  return (
    <main className="pb-24">
      <h1 className="sr-only">Stub movie and television archive</h1>
      {featured ? (
        <section
          className="hero-panel enter relative -mx-4 h-[320px] overflow-hidden border-b border-border bg-surface-raised sm:-mx-8 lg:h-[420px]"
        >
          <MediaImage
            src={featured.backdropUrl}
            alt=""
            className="media-image-fill inset-0"
            imageClassName="object-cover object-center"
            fallback=""
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/10" />
          <div className="relative flex h-full max-w-2xl flex-col justify-end p-8 sm:p-12">
            <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
              FEATURE PRESENTATION
            </p>
            <h2 className="mt-3 font-display text-display-lg font-normal leading-none sm:text-[64px]">
              {featured.title}
            </h2>
            <p className="mt-4 font-mono text-[11px] tracking-[0.06em] text-text-dim">
              {featured.year ?? "—"} · {featured.genre}
              {featured.voteAverage != null ? ` · TMDB ${featured.voteAverage.toFixed(1)}` : ""}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={titlePath(featured)}
                className="button-outline px-6 py-3 text-body-sm font-semibold"
              >
                View stub
              </Link>
              {!savedKeys.has(titleKey(featured)) && (
                <button
                  type="button"
                  onClick={() => onSave(featured)}
                  className="button-primary px-6 py-3 text-body-sm font-semibold"
                >
                  Save to Watchlist
                </button>
              )}
            </div>
          </div>
          {featured.posterUrl && (
            <Link
              to={titlePath(featured)}
              className="poster-card absolute bottom-12 right-12 hidden w-[144px] lg:block"
            >
              <div className="overflow-hidden border border-border bg-surface">
                <MediaImage
                  src={featured.posterUrl}
                  alt={`${featured.title} poster`}
                  className="poster w-full"
                  imageClassName="object-cover"
                  fallback="NO POSTER"
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            </Link>
          )}
        </section>
      ) : trending.isError ? (
        <section className="hero-panel -mx-4 grid h-[320px] place-items-center border-b border-border bg-surface sm:-mx-8 lg:h-[420px]">
          <div className="text-center">
            <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
              FEATURE PRESENTATION UNAVAILABLE
            </p>
            <button
              type="button"
              onClick={() => trending.refetch()}
              className="button-outline mt-5 px-5 py-3 text-body-sm"
            >
              Retry
            </button>
          </div>
        </section>
      ) : (
        <div className="skeleton-pulse -mx-4 h-[320px] bg-surface sm:-mx-8 lg:h-[420px]" />
      )}

      <PosterRail
        title="Trending this week"
        titles={trending.data ?? []}
        loading={trending.isLoading}
        error={trending.isError}
        onRetry={() => void trending.refetch()}
        archive={archive}
        onSave={onSave}
        showArchiveStatus={signedIn}
        enter
      />
      <PosterRail title="Now in theatres" titles={theatres.data ?? []} loading={theatres.isLoading} error={theatres.isError} onRetry={() => void theatres.refetch()} archive={archive} onSave={onSave} showArchiveStatus={signedIn} />
      <PosterRail title="Popular movies" titles={movies.data ?? []} loading={movies.isLoading} error={movies.isError} onRetry={() => void movies.refetch()} archive={archive} onSave={onSave} showArchiveStatus={signedIn} />
      <PosterRail title="Popular TV" titles={shows.data ?? []} loading={shows.isLoading} error={shows.isError} onRetry={() => void shows.refetch()} archive={archive} onSave={onSave} showArchiveStatus={signedIn} />
      <PosterRail title="Coming soon" titles={upcoming.data ?? []} loading={upcoming.isLoading} error={upcoming.isError} onRetry={() => void upcoming.refetch()} metaFor={releaseLabel} archive={archive} onSave={onSave} showArchiveStatus={signedIn} />

      <section className="mt-20">
        <div className="section-heading">
          <h2 className="font-display text-display-sm font-normal">By genre</h2>
          <Link to="/genres" className="section-link">
            ALL GENRES
          </Link>
        </div>
        <div className="genre-board">
          {genres.map((item) => (
            <Link
              key={item.id}
              to={genrePath({ name: genreById.get(item.id)?.name ?? item.label })}
            >
              <span className="genre-board-name">{item.label}</span>
              <span className="genre-board-kind">
                {kindLabel(genreById.get(item.id)) ?? ""}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {signedIn ? (
        <section className="mt-24">
          <div className="bulb-strip" aria-hidden="true" />
          <p className="mt-6 font-mono text-[10px] tracking-[0.16em] text-accent">
            YOUR COLLECTION
          </p>
          <h2 className="mt-3 font-display text-display-md font-normal">My stubs</h2>
          {(
            [
              ["Watchlist", watchlist],
              ["Currently watching", watching],
              ["Watched", watched],
            ] as const
          ).map(([heading, rack]) => (
            <StubRack
              key={heading}
              heading={heading}
              titles={rack.data?.titles ?? []}
              total={rack.data?.total ?? 0}
              loading={rack.isLoading}
              justStamped={justStamped}
              onMarkWatched={onMarkWatched}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </section>
      ) : (
        <div className="mt-24 max-w-xl border-t border-border pt-10">
          <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
            YOUR ARCHIVE
          </p>
          <h2 className="mt-3 font-display text-display-sm font-normal">
            Keep a private ticket stub
          </h2>
          <p className="mt-3 text-body-sm leading-6 text-text-dim">
            Search is public. Saving titles, scores, and your diary needs an account.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/signup" className="button-primary px-6 py-3 text-body-sm font-semibold">
              Sign up
            </Link>
            <Link to="/login" className="button-outline px-6 py-3 text-body-sm font-semibold">
              Log in
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
