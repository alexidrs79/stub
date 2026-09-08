import { useQuery } from "@tanstack/react-query"
import { useEffect, useState, type CSSProperties } from "react"
import { Link } from "react-router-dom"
import { fetchJson } from "./api"
import { Marquee } from "./Marquee"
import { PageState } from "./PageState"
import { PosterRail } from "./PosterRail"
import { genrePath } from "./paths"
import { TicketStub } from "./TicketStub"
import type { ArchiveEntry, GenreInfo, SavedTitle, SearchHit } from "./title"
import { titleKey } from "./title"

const fanTilt = [-3.2, 2.2, -1.4, 2.8, -2.4, 1.6]

type ProfilePageProps = {
  displayName: string
  onToggleFavorite: (entry: ArchiveEntry) => void
}

/// Aggregates are computed server-side over the whole archive; the page only
/// receives the totals plus two short display lists.
type ProfileStats = {
  counts: {
    total: number
    watched: number
    watchlist: number
    watching: number
    favorites: number
    rated: number
  }
  average: number | null
  byScore: Record<number, number>
  genres: { name: string; count: number }[]
  recent: SavedTitle[]
  highlights: SavedTitle[]
}

const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const gridlines = [0, 25, 50, 75, 100]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-stat">
      <p>{label}</p>
      <p className="mt-3 font-display text-display-md leading-none">{value}</p>
    </div>
  )
}

function ScoreChart({
  byScore,
  rated,
}: {
  byScore: Record<number, number>
  rated: number
}) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const max = Math.max(1, ...scores.map((score) => byScore[score] ?? 0))
  const peakScores = scores.filter((score) => (byScore[score] ?? 0) === max)
  const scoreInsight =
    rated === 0
      ? "Rate a stamped title to start your score pattern."
      : peakScores.length === 1
        ? `You stamp most often at ${peakScores[0]}.`
        : `Your most-used scores are ${peakScores.join(", ")}.`

  return (
    <div className="profile-score-card">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] tracking-[0.14em] text-accent">SCORE CARD</p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-text-dim">
          {rated === 0 ? "NOTHING RATED YET" : `PEAK ${max}`}
        </p>
      </div>
      <h2 className="mt-3 font-display text-display-sm font-normal">How you stamp</h2>
      <p className="mt-2 text-body-sm text-text-dim">
        {scoreInsight}
      </p>

      <div className="relative mt-8 h-40">
        {gridlines.map((line) => (
          <div
            key={line}
            className="absolute inset-x-0 border-t border-border"
            style={{ bottom: `${line}%`, opacity: line === 0 ? 1 : 0.45 }}
            aria-hidden="true"
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-2">
          {scores.map((score) => {
            const count = byScore[score] ?? 0
            const height = count === 0 ? 0 : (count / max) * 100
            return (
              <div
                key={score}
                className="flex h-full flex-1 items-end"
                title={`${count} ${count === 1 ? "title" : "titles"} at ${score}`}
              >
                <div
                  className="w-full origin-bottom bg-accent transition-transform duration-300 ease-out"
                  style={{
                    height: `${height}%`,
                    transform: grown ? "scaleY(1)" : "scaleY(0)",
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {scores.map((score) => (
          <span
            key={score}
            className="flex-1 text-center font-mono text-[10px] tracking-[0.06em] text-text-dim"
          >
            {score}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProfilePage({ displayName, onToggleFavorite }: ProfilePageProps) {
  const catalog = useQuery({
    queryKey: ["genres"],
    queryFn: () => fetchJson<GenreInfo[]>("/api/genres"),
    staleTime: 1000 * 60 * 60,
  })
  const profile = useQuery({
    queryKey: ["profile", "stats"],
    queryFn: () => fetchJson<ProfileStats>("/api/profile/stats"),
  })

  const loading = profile.isLoading
  const error = profile.isError
  const stats = profile.data
  const counts = stats?.counts
  const highlightLabel =
    counts && counts.favorites > 0 ? "Pinned favorites" : "Highest stamps"
  const maxGenre = Math.max(1, ...(stats?.genres ?? []).map((genre) => genre.count))
  const genreByName = new Map(
    (catalog.data ?? []).map((genre) => [genre.name, genre]),
  )
  const highlights: SearchHit[] = (stats?.highlights ?? []).map((title) => ({
    tmdbId: title.tmdbId,
    mediaType: title.mediaType,
    title: title.title,
    year: title.year,
    releaseDate: null,
    genre: title.genre,
    posterUrl: title.posterUrl,
    backdropUrl: null,
    voteAverage: null,
  }))

  return (
    <main className="pb-24 pt-12">
      <div className="bulb-strip" aria-hidden="true" />
      <header className="profile-lobby-header">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-accent">TASTE</p>
          <h1 className="mt-3 font-display text-display-lg font-normal">{displayName}</h1>
          {counts && (
            <p className="mt-4 font-mono text-[11px] tracking-[0.08em] text-text-dim">
              {counts.watched} WATCHED · {counts.watching} WATCHING ·{" "}
              {counts.watchlist} ON THE LIST · {counts.favorites}{" "}
              {counts.favorites === 1 ? "FAVORITE" : "FAVORITES"}
            </p>
          )}
        </div>
        <Link to="/settings" className="back-control">
          ACCOUNT SETTINGS
        </Link>
      </header>

      {loading ? (
        <div className="profile-stat-strip mt-12" aria-hidden="true">
          {[0, 1, 2].map((cell) => (
            <div key={cell} className="profile-stat">
              <div className="skeleton-pulse h-3 w-16" />
              <div className="skeleton-pulse mt-4 h-8 w-12" />
            </div>
          ))}
        </div>
      ) : error ? (
        <PageState
          heading="Profile unavailable"
          body="Your collection could not be loaded."
          action={
            <button
              type="button"
              className="button-primary"
              onClick={() => void profile.refetch()}
            >
              Retry
            </button>
          }
        />
      ) : !stats || !counts ? null : counts.watched === 0 && counts.total > 0 ? (
        <PageState
          heading="Your first feature is queued"
          body={`You have ${counts.watching + counts.watchlist} ${
            counts.watching + counts.watchlist === 1 ? "title" : "titles"
          } waiting, but nothing stamped yet.`}
          action={
            <Link to="/collection/watchlist" className="button-primary">
              Open collection
            </Link>
          }
        />
      ) : counts.watched === 0 ? (
        <PageState
          heading="Your archive is empty"
          body="Find a title and claim your first stub."
          action={
            <Link to="/search" className="button-primary">
              Search titles
            </Link>
          }
        />
      ) : (
        <>
          <div className="mt-12">
            <div className="profile-stat-strip enter">
              <Stat label="WATCHED" value={String(counts.watched)} />
              <Stat
                label="AVERAGE"
                value={stats.average == null ? "—" : stats.average.toFixed(1)}
              />
              <Stat
                label={counts.favorites === 1 ? "FAVORITE" : "FAVORITES"}
                value={String(counts.favorites)}
              />
            </div>
            <div className="enter enter-2">
              <ScoreChart byScore={stats.byScore} rated={counts.rated} />
            </div>
          </div>

          <section className="enter enter-3 mt-16">
            <Marquee
              count={stats.recent.length}
              heading={
                <div className="profile-section-title">
                  <div>
                    <p>THE DIARY</p>
                    <h2>Recent stamps</h2>
                  </div>
                  <Link to="/diary">VIEW DIARY →</Link>
                </div>
              }
            >
              {stats.recent.map((title, index) => (
                <div
                  key={titleKey(title)}
                  className="marquee-item ticket-tilt"
                  style={
                    {
                      "--ticket-angle": `${fanTilt[index % fanTilt.length]}deg`,
                      "--ticket-hover-angle": `${Math.sign(fanTilt[index % fanTilt.length]) * Math.max(0, Math.abs(fanTilt[index % fanTilt.length]) - 1)}deg`,
                    } as CSSProperties
                  }
                >
                  <TicketStub title={title} onToggleFavorite={onToggleFavorite} />
                </div>
              ))}
            </Marquee>
          </section>

          <section className="profile-taste-block">
            <div className="profile-genres">
              <p className="profile-kicker">TOP BILLING</p>
              <h2>Your programme</h2>
              <p className="profile-explainer">
                Genres are ranked by how often they appear in your stamped archive.
              </p>
              <ol>
                {stats.genres.map(({ name, count }, index) => (
                  <li key={name}>
                    <span className="profile-genre-rank">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p>
                {genreByName.has(name) ? (
                  <Link to={genrePath(genreByName.get(name)!)}>{name}</Link>
                        ) : (
                          name
                        )}
                      </p>
                      <div className="profile-genre-track">
                        <div style={{ width: `${(count / maxGenre) * 100}%` }} />
                      </div>
                    </div>
                    <span className="profile-genre-count">{count}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="profile-highlights">
              <PosterRail
                title={highlightLabel}
                titles={highlights}
                compact
                metaFor={(item) => {
                  const saved = stats.highlights.find(
                    (title) => titleKey(title) === titleKey(item),
                  )
                  if (!saved) return null
                  return saved.favorite
                    ? "★ PINNED"
                    : saved.score == null
                      ? "STAMPED"
                      : `YOUR STAMP ${saved.score}`
                }}
              />
            </div>
          </section>
        </>
      )}
    </main>
  )
}
