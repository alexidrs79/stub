import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { fetchJson } from "./api"
import { MediaImage } from "./MediaImage"
import { PageState } from "./PageState"
import { titlePath } from "./paths"
import { PosterRail } from "./PosterRail"
import type { ArchiveEntry, MediaType, SearchHit, TitleDetail } from "./title"
import { titleKey } from "./title"

type SearchPageProps = {
  archive: ArchiveEntry[]
  onSave: (title: SearchHit | TitleDetail) => void
  onRemove: (tmdbId: number, mediaType: MediaType) => Promise<void>
}

type Filter = "all" | MediaType

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "movie", label: "MOVIES" },
  { id: "tv", label: "TV" },
]

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function SearchPage({ archive, onSave, onRemove }: SearchPageProps) {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get("q") ?? "")
  const [filter, setFilter] = useState<Filter>("all")
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState("")
  const lastWrittenQuery = useRef<string | null>(null)
  const debounced = useDebounced(query.trim(), 300)
  const savedByKey = new Map(archive.map((title) => [titleKey(title), title]))
  const ready = debounced.length >= 2
  const search = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => fetchJson<SearchHit[]>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: ready,
    staleTime: 1000 * 60 * 5,
  })
  const trending = useQuery({
    queryKey: ["catalog", "trending"],
    queryFn: () => fetchJson<SearchHit[]>("/api/catalog/trending"),
    enabled: !ready,
    staleTime: 1000 * 60 * 15,
  })

  const results = (search.data ?? []).filter(
    (title) => filter === "all" || title.mediaType === filter,
  )

  useEffect(() => {
    const urlQuery = params.get("q") ?? ""
    if (lastWrittenQuery.current === urlQuery) {
      lastWrittenQuery.current = null
      return
    }
    setQuery(urlQuery)
  }, [params])

  useEffect(() => {
    const urlQuery = params.get("q") ?? ""
    if (urlQuery === debounced) return
    const next = new URLSearchParams(params)
    if (debounced.length >= 2) next.set("q", debounced)
    else next.delete("q")
    lastWrittenQuery.current = debounced.length >= 2 ? debounced : ""
    setParams(next, { replace: true })
  }, [debounced, params, setParams])

  return (
    <main className="pb-24 pt-12">
      <div className="enter max-w-3xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
          FIND A TITLE
        </p>
        <h1 className="mt-3 font-display text-display-lg font-normal">Search</h1>
        <label className="mt-6 flex items-center gap-4 border-b border-border pb-3 focus-within:border-accent">
          <svg
            viewBox="0 0 24 24"
            className="size-5 shrink-0 text-text-dim"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" />
            <path d="m16 16 5 5" stroke="currentColor" />
          </svg>
          <span className="sr-only">Search movies and shows</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Movie, show, or director"
            className="bare-input w-full bg-transparent font-sans text-xl text-text outline-none placeholder:text-text-dim/55"
          />
          <span className="font-mono text-[11px] tracking-[0.06em] text-text-dim">
            {search.isFetching
              ? "SEARCHING"
              : search.isSuccess
                ? `${results.length} FOUND`
                : ""}
          </span>
        </label>
        <div className="mt-4 flex gap-2">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={
                filter === option.id
                  ? "genre-chip is-active"
                  : "genre-chip"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!ready && (
        <div className="mt-16 border-t border-border pt-8">
          <p className="font-mono text-[11px] tracking-[0.08em] text-text-dim">
            TYPE TWO LETTERS, OR{" "}
            <Link to="/genres" className="text-accent hover:underline">
              BROWSE BY GENRE
            </Link>
            .
          </p>
          <PosterRail
            title="Trending this week"
            titles={trending.data ?? []}
            loading={trending.isLoading}
            error={trending.isError}
            onRetry={() => void trending.refetch()}
          />
        </div>
      )}
      {search.isError && (
        <PageState
          heading="Search unavailable"
          body="Try that query again."
          action={
            <button type="button" className="button-primary" onClick={() => void search.refetch()}>
              Retry
            </button>
          }
        />
      )}
      {ready && search.isLoading && (
        <div className="mt-12 divide-y divide-border border-y border-border" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="search-result grid grid-cols-[80px_1fr] items-center gap-4 py-5 sm:grid-cols-[96px_1fr]"
            >
              <div className="skeleton-pulse poster w-20 sm:w-24" />
              <div className="min-w-0">
                <div className="skeleton-pulse h-6 max-w-xs" />
                <div className="skeleton-pulse mt-3 h-3 max-w-48" />
              </div>
            </div>
          ))}
        </div>
      )}
      {ready && search.isSuccess && results.length === 0 && (
        <p className="mt-16 text-text-dim">
          Nothing matched that. Try another title.
        </p>
      )}
      {results.length > 0 && (
        <div className="mt-12 divide-y divide-border border-y border-border">
          {results.map((title) => {
            const saved = savedByKey.get(titleKey(title))
            return (
              <article
                key={titleKey(title)}
                className="search-result grid grid-cols-[80px_1fr] items-center gap-4 py-5 sm:grid-cols-[96px_1fr_auto] sm:gap-6"
              >
                <MediaImage
                  src={title.posterUrl}
                  alt=""
                  className="poster w-20 sm:w-24"
                  imageClassName="object-cover"
                  fallback="NO POSTER"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={titlePath(title)}
                      className="font-display text-xl leading-tight text-text hover:text-accent sm:text-display-sm"
                    >
                      {title.title}
                    </Link>
                    {saved && (
                      <span className="border border-border px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-accent">
                        {saved.status.toUpperCase()}
                        {saved.score != null ? ` · ${saved.score}/10` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-[12px] leading-5 tracking-[0.03em] text-text-dim">
                    {title.year ?? "—"} · {title.genre} · {title.mediaType.toUpperCase()}
                    {title.voteAverage != null ? ` · TMDB ${title.voteAverage.toFixed(1)}` : ""}
                  </p>
                </div>
                {saved && confirmingRemoval === titleKey(title) ? (
                  <div
                    className="col-span-2 border border-border p-4 sm:col-span-3"
                    role="group"
                    aria-label={`Remove ${title.title} from archive`}
                  >
                    <p className="text-body-sm text-text-dim">
                      Remove this title and its diary, verdict, favorite, progress,
                      and custom-list entries?
                    </p>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={removing != null}
                        className="button-outline min-h-11 px-4 text-body-sm"
                        onClick={() => {
                          setConfirmingRemoval(null)
                          setRemoveError("")
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={removing != null}
                        className="button-danger min-h-11 px-4"
                        onClick={async () => {
                          const key = titleKey(title)
                          setRemoving(key)
                          setRemoveError("")
                          try {
                            await onRemove(title.tmdbId, title.mediaType)
                            setConfirmingRemoval(null)
                          } catch (caught) {
                            setRemoveError(
                              caught instanceof Error
                                ? caught.message
                                : "Title could not be removed.",
                            )
                          } finally {
                            setRemoving(null)
                          }
                        }}
                      >
                        {removing === titleKey(title) ? "Removing…" : "Remove from archive"}
                      </button>
                    </div>
                    {removeError && (
                      <p className="mt-3 text-body-sm text-stamp" role="alert">
                        {removeError}
                      </p>
                    )}
                  </div>
                ) : saved ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveError("")
                      setConfirmingRemoval(titleKey(title))
                    }}
                    className="col-span-2 min-h-11 border border-border px-4 py-3 font-mono text-[11px] tracking-[0.08em] text-text-dim hover:border-accent-dim hover:text-accent sm:col-span-1"
                  >
                    REMOVE FROM ARCHIVE
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSave(title)}
                    className="button-primary col-span-2 min-h-11 px-4 py-3 text-body-sm font-semibold sm:col-span-1"
                  >
                    Save to Watchlist
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
