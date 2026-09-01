import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { ApiError, fetchJson } from "./api"
import { Marquee } from "./Marquee"
import { MediaImage } from "./MediaImage"
import { PosterRail } from "./PosterRail"
import { VerdictForm } from "./VerdictForm"
import { setPageMeta } from "./pageMeta"
import {
  genrePath,
  numericIdFromSlug,
  personPath,
  titlePath,
} from "./paths"
import { TvProgressEditor } from "./TvProgressEditor"
import type {
  CollectionList,
  MediaType,
  ArchiveEntry,
  SearchHit,
  TitleDetail,
} from "./title"
import { titleKey } from "./title"

type DetailPageProps = {
  archive: ArchiveEntry[]
  archiveLoading: boolean
  signedIn: boolean
  onSave: (title: SearchHit | TitleDetail) => void
  onMarkWatched: (tmdbId: number, mediaType: MediaType, name: string) => void
  onRemove: (tmdbId: number, mediaType: MediaType) => Promise<void>
  onRate: (
    tmdbId: number,
    mediaType: MediaType,
    score: number,
    note: string | null,
  ) => Promise<void>
  onToggleFavorite: (entry: ArchiveEntry) => void
  onUpdateProgress: (
    tmdbId: number,
    season: number,
    episode: number,
  ) => Promise<void>
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-border py-4">
      <dt className="font-mono text-[11px] tracking-[0.1em] text-text-dim">{label}</dt>
      <dd className="mt-2 text-[14px] leading-5 text-text">{value}</dd>
    </div>
  )
}

function ScorePad({
  score,
  note,
  onRate,
}: {
  score: number | null
  note: string | null
  onRate: (score: number, note: string | null) => Promise<void>
}) {
  return (
    <div className="verdict-panel">
      <div className="mb-6 border-b border-border pb-5">
        <p className="font-mono text-[10px] tracking-[0.14em] text-accent">YOUR SCORE</p>
        <h2 className="mt-3 font-display text-display-sm font-normal">Your verdict</h2>
        <p className="mt-2 text-body-sm leading-6 text-text-dim">
          Your rating and note stay attached to this stub.
        </p>
      </div>
      <VerdictForm
        initialScore={score}
        initialNote={note}
        submitLabel="Save verdict"
        pendingLabel="Saving…"
        onSubmit={onRate}
      />
    </div>
  )
}

export function DetailPage({
  archive,
  archiveLoading,
  signedIn,
  onSave,
  onMarkWatched,
  onRemove,
  onRate,
  onToggleFavorite,
  onUpdateProgress,
}: DetailPageProps) {
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const queryClient = useQueryClient()
  const { mediaType: legacyMediaType, id, titleRef } = useParams()
  const mediaType =
    legacyMediaType ??
    (routeLocation.pathname.startsWith("/movies/") ? "movie" : "tv")
  const validType = mediaType === "movie" || mediaType === "tv"
  const tmdbId = id ? Number(id) : numericIdFromSlug(titleRef)
  const detail = useQuery({
    queryKey: ["title", mediaType, tmdbId],
    queryFn: () => fetchJson<TitleDetail>(`/api/title/${mediaType}/${tmdbId}`),
    enabled: validType && Number.isInteger(tmdbId),
    staleTime: 1000 * 60 * 10,
    retry: false,
  })
  const similar = useQuery({
    queryKey: ["similar", mediaType, tmdbId],
    queryFn: () =>
      fetchJson<SearchHit[]>(`/api/title/${mediaType}/${tmdbId}/similar`),
    enabled: validType && Number.isInteger(tmdbId),
    staleTime: 1000 * 60 * 15,
    retry: false,
  })
  const lists = useQuery({
    queryKey: ["lists"],
    queryFn: () => fetchJson<CollectionList[]>("/api/lists"),
    enabled: signedIn,
  })
  const [selectedList, setSelectedList] = useState("")
  const [actionMessage, setActionMessage] = useState("")
  const [confirmArchiveRemoval, setConfirmArchiveRemoval] = useState(false)
  const [removing, setRemoving] = useState(false)
  const addToList = useMutation({
    mutationFn: (listId: string) =>
      fetchJson(`/api/lists/${listId}/titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, mediaType }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] })
      queryClient.invalidateQueries({ queryKey: ["list", selectedList] })
      setActionMessage("ADDED TO LIST")
    },
    onError: (error) => {
      setActionMessage(error instanceof Error ? error.message : "COULD NOT ADD TO LIST")
    },
  })
  const title = detail.data
  const saved = title
    ? archive.find((item) => titleKey(item) === titleKey(title))
    : undefined

  useEffect(() => {
    if (!title) return
    const canonicalPath = titlePath(title)
    if (routeLocation.pathname !== canonicalPath) {
      navigate(canonicalPath, { replace: true })
      return
    }
    setPageMeta({
      title: `${title.title} · Stub`,
      description: title.synopsis,
      image: title.posterUrl ?? title.backdropUrl,
      canonicalPath,
    })
  }, [navigate, routeLocation.pathname, title])

  const notFound =
    !validType ||
    !Number.isInteger(tmdbId) ||
    (detail.error instanceof ApiError && detail.error.status === 404)

  if (notFound) {
    return (
      <main className="person-state">
        <Link to="/search" className="back-control">
          ← BACK TO SEARCH
        </Link>
        <p>WRONG SCREEN</p>
        <h1>Title not found</h1>
        <span>This title is not in today’s programme.</span>
        <Link to="/search" className="button-primary">
          SEARCH TITLES
        </Link>
      </main>
    )
  }

  if (detail.isError) {
    return (
      <main className="person-state">
        <Link to="/search" className="back-control">
          ← BACK TO SEARCH
        </Link>
        <p>PROJECTION INTERRUPTED</p>
        <h1>Title unavailable</h1>
        <span>We could not load this title. Try the projection again.</span>
        <button
          type="button"
          className="button-primary"
          onClick={() => void detail.refetch()}
        >
          RETRY
        </button>
      </main>
    )
  }

  if (!title) {
    return (
      <main className="py-24">
        <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
          LOADING
        </p>
      </main>
    )
  }

  const kicker = [
    title.mediaType === "tv" ? "SERIES" : "MOVIE",
    title.year == null ? null : String(title.year),
    title.runtime,
  ]
    .filter(Boolean)
    .join(" · ")

  const released = title.releaseDate == null ? null : new Date(title.releaseDate)
  const releasedOn =
    released == null || Number.isNaN(released.getTime())
      ? null
      : released.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })

  return (
    <main className="pb-24 pt-8">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) navigate(-1)
          else navigate("/")
        }}
        className="back-control mt-6"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M13 8H3m4-4L3 8l4 4" />
        </svg>
        BACK
      </button>

      <section className="enter relative -mx-4 mt-5 h-[340px] overflow-hidden bg-surface-raised sm:-mx-8 lg:h-[420px]">
        {title.backdropUrl ? (
          <>
            <MediaImage
              src={title.backdropUrl}
              alt=""
              className="media-image-fill inset-0"
              imageClassName="object-cover object-[center_20%]"
              fallback=""
              loading="eager"
              fetchPriority="high"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent"
              aria-hidden="true"
            />
          </>
        ) : null}

        <div className="relative flex h-full max-w-[720px] flex-col justify-end p-8 sm:p-12">
          <p className="font-mono text-[10px] tracking-[0.16em] text-accent">{kicker}</p>
          <h1 className="mt-3 font-display text-[38px] font-normal leading-[1.08] sm:text-display-lg lg:text-[58px]">
            {title.title}
          </h1>
          <p className="mt-4 font-mono text-[11px] tracking-[0.04em] text-text-dim">
            {title.mediaType === "tv" ? "CREATED BY" : "DIRECTED BY"}{" "}
            {title.director.toUpperCase()}
          </p>
        </div>
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[214px_1fr] lg:gap-12">
        <div className="detail-actions">
          <div className="film-frame relative border border-border bg-surface p-2 pl-6">
            <MediaImage
              src={title.posterUrl}
              alt={`${title.title} poster`}
              className="poster w-full"
              imageClassName="object-cover"
              fallback="NO POSTER"
              loading="eager"
              fetchPriority="high"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {signedIn && archiveLoading && (
              <button
                type="button"
                disabled
                className="button-primary w-full min-h-11 px-4 py-3 text-body-sm font-semibold"
              >
                CHECKING ARCHIVE…
              </button>
            )}
            {!archiveLoading && !saved && (
              <button
                type="button"
                onClick={() => onSave(title)}
                className="button-primary w-full min-h-11 px-4 py-3 text-body-sm font-semibold"
              >
                Save to Watchlist
              </button>
            )}
            {saved?.status === "watchlist" && (
              <>
                <p className="detail-status">IN WATCHLIST</p>
                <button
                  type="button"
                  onClick={() => onMarkWatched(title.tmdbId, title.mediaType, title.title)}
                  className="button-primary w-full min-h-11 px-4 py-3 text-body-sm font-semibold"
                >
                  Mark watched & rate
                </button>
              </>
            )}
            {saved?.status === "watching" && (
              <>
                <p className="detail-status">
                  WATCHING
                  {saved.progress
                    ? ` · S${String(saved.progress.season).padStart(2, "0")} E${String(saved.progress.episode).padStart(2, "0")}`
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => onMarkWatched(title.tmdbId, title.mediaType, title.title)}
                  className="button-primary w-full min-h-11 px-4 py-3 text-body-sm font-semibold"
                >
                  Finish & rate
                </button>
              </>
            )}
            {saved && (
              <button
                type="button"
                onClick={() => onToggleFavorite(saved)}
                className={saved.favorite ? "favorite-control is-active" : "favorite-control"}
                aria-pressed={saved.favorite}
              >
                <span aria-hidden="true">★</span>
                {saved.favorite ? "PINNED FAVORITE" : "PIN AS FAVORITE"}
              </button>
            )}
            {saved?.status === "watched" && (
              <p className="detail-status">WATCHED</p>
            )}
            {saved && !confirmArchiveRemoval && (
              <button
                type="button"
                onClick={() => setConfirmArchiveRemoval(true)}
                className="min-h-11 py-2 font-mono text-[11px] tracking-[0.08em] text-text-dim hover:text-accent"
              >
                REMOVE FROM ARCHIVE
              </button>
            )}
            {saved && confirmArchiveRemoval && (
              <div className="archive-remove-confirm">
                <p>
                  Remove this title, its diary history, verdict, favorite, progress,
                  and custom-list entries?
                </p>
                <div>
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => setConfirmArchiveRemoval(false)}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    className="text-stamp"
                    disabled={removing}
                    onClick={async () => {
                      setRemoving(true)
                      setActionMessage("")
                      try {
                        await onRemove(title.tmdbId, title.mediaType)
                        setConfirmArchiveRemoval(false)
                      } catch (caught) {
                        setActionMessage(
                          caught instanceof Error
                            ? caught.message
                            : "COULD NOT REMOVE FROM ARCHIVE",
                        )
                      } finally {
                        setRemoving(false)
                      }
                    }}
                  >
                    {removing ? "REMOVING…" : "REMOVE"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {saved && (
            <p className="mt-2 font-mono text-[10px] tracking-[0.08em] text-text-dim">
              № {saved.serial}
            </p>
          )}
          {saved?.mediaType === "tv" && saved.status !== "watched" && (
            <TvProgressEditor
              key={`${saved.tmdbId}-${saved.progress?.season}-${saved.progress?.episode}`}
              seasonOptions={title.seasonOptions}
              progress={saved.progress}
              mode="detail"
              onUpdate={(season, episode) =>
                onUpdateProgress(saved.tmdbId, season, episode)
              }
              onMessage={setActionMessage}
            />
          )}
          {saved && (
            <div className="detail-list-picker">
              <label htmlFor="detail-custom-list">ADD TO A LIST</label>
              <div>
                <select
                  id="detail-custom-list"
                  value={selectedList}
                  onChange={(event) => setSelectedList(event.target.value)}
                >
                  <option value="">CHOOSE LIST</option>
                  {(lists.data ?? [])
                    .filter((list) => list.type === "custom")
                    .map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name.toUpperCase()}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedList || addToList.isPending}
                  onClick={() => addToList.mutate(selectedList)}
                >
                  ADD
                </button>
              </div>
            </div>
          )}
          {actionMessage && (
            <p className="mt-3 font-mono text-[10px] leading-4 text-text-dim">
              {actionMessage}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <p className="max-w-[640px] leading-7 text-text-dim">{title.synopsis}</p>

          <dl className="mt-10 grid border-t border-border sm:grid-cols-2 sm:gap-x-12">
            <Fact label="RELEASED" value={releasedOn ?? "—"} />
            <Fact label="RUNTIME" value={title.runtime} />
            <Fact
              label="TMDB"
              value={
                title.voteAverage == null
                  ? "—"
                  : `${title.voteAverage.toFixed(1)} · ${title.voteCount.toLocaleString()} VOTES`
              }
            />
            <Fact
              label="GENRES"
              value={
                title.genres.length === 0 ? (
                  "—"
                ) : (
                  <span className="flex flex-wrap gap-2">
                    {((title.genreRefs && title.genreRefs.length > 0
                      ? title.genreRefs
                      : title.genres.map((name) => ({ id: 0, name }))
                    ).map((genre) =>
                      genre.id > 0 ? (
                        <Link
                          key={genre.id}
                          to={genrePath(genre)}
                          className="genre-chip"
                        >
                          {genre.name.toUpperCase()}
                        </Link>
                      ) : (
                        <span key={genre.name} className="genre-chip">
                          {genre.name.toUpperCase()}
                        </span>
                      ),
                    ))}
                  </span>
                )
              }
            />
          </dl>

          {saved?.status === "watched" && (
            <div className="mt-10">
              <ScorePad
                key={`${titleKey(title)}-${saved.note ?? ""}`}
                score={saved.score}
                note={saved.note}
                onRate={(score, note) => onRate(title.tmdbId, title.mediaType, score, note)}
              />
            </div>
          )}
        </div>
      </div>

      <section className="enter enter-2 mt-16">
        <p className="mb-3 font-mono text-[10px] tracking-[0.14em] text-accent">TOP BILLING</p>
        {title.cast.length === 0 ? (
          <>
            <div className="section-heading">
              <h2 className="font-display text-display-sm font-normal">Cast</h2>
            </div>
            <p className="mt-6 text-body-sm text-text-dim">No cast listed.</p>
          </>
        ) : (
          <Marquee
            count={title.cast.length}
            align="start"
            heading={<h2 className="font-display text-display-sm font-normal">Cast</h2>}
          >
            {title.cast.map((person) => (
              <Link
                key={person.tmdbId}
                to={personPath(person)}
                className="cast-card marquee-item mr-3 w-[144px] shrink-0 last:mr-0"
              >
                <MediaImage
                  src={person.profileUrl}
                  alt={`${person.name} portrait`}
                  className="cast-face"
                  imageClassName="object-cover object-[center_15%]"
                  fallback={person.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                />
                <p className="mt-3 text-[14px] leading-5 text-text">{person.name}</p>
                <p className="mt-1 line-clamp-2 font-mono text-[11px] leading-4 text-text-dim">
                  {person.character}
                </p>
              </Link>
            ))}
          </Marquee>
        )}
      </section>

      <section className="mt-16">
        <p className="font-mono text-[10px] tracking-[0.14em] text-accent">TRAILER</p>
        <div className="section-heading mt-3">
          <h2 className="font-display text-display-sm font-normal">On the screen</h2>
        </div>
        {title.trailerKey ? (
          <div className="mt-6 aspect-video overflow-hidden border border-border bg-surface">
            <iframe
              className="size-full"
              src={`https://www.youtube-nocookie.com/embed/${title.trailerKey}`}
              title={`${title.title} trailer`}
              // The player returns error 153 unless it receives an origin.
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="mt-6 grid aspect-video place-items-center border border-border bg-surface">
            <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
              NO TRAILER ON FILE
            </p>
          </div>
        )}
      </section>

      <PosterRail
        title="More like this"
        titles={similar.data ?? []}
        loading={similar.isLoading}
        error={similar.isError}
        onRetry={() => void similar.refetch()}
        archive={archive}
        onSave={onSave}
        showArchiveStatus={signedIn}
      />
    </main>
  )
}
