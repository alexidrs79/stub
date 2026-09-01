import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { fetchJson } from "./api"
import { TicketStub } from "./TicketStub"
import { TvProgressEditor } from "./TvProgressEditor"
import { setPageMeta } from "./pageMeta"
import { listIdFromSlug, listPath } from "./paths"
import type {
  ArchiveEntry,
  ArchiveSort,
  ArchiveView,
  CollectionList,
  CustomCollection,
  MediaType,
  SavedTitle,
} from "./title"
import { useArchivePage } from "./useArchive"

type CollectionPageProps = {
  onMarkWatched: (tmdbId: number, mediaType: MediaType, name: string) => void
  onToggleFavorite: (entry: ArchiveEntry) => void
  onUpdateProgress: (
    tmdbId: number,
    season: number,
    episode: number,
  ) => Promise<void>
}

type Filter = "all" | MediaType

const PAGE_SIZE = 48

const views = [
  {
    id: "watchlist",
    label: "WATCHLIST",
    eyebrow: "STILL TO SEE",
    heading: "The watchlist",
    blurb: "Titles you saved for later, waiting on a free evening.",
    emptyHeading: "Nothing queued yet",
    emptyBody: "Search the programme and save something worth an evening.",
  },
  {
    id: "watching",
    label: "WATCHING",
    eyebrow: "IN PROGRESS",
    heading: "Currently watching",
    blurb: "Shows you started, with the season and episode you reached.",
    emptyHeading: "No show in progress",
    emptyBody: "Save a season and episode on a TV title to start tracking it here.",
  },
  {
    id: "watched",
    label: "WATCHED",
    eyebrow: "STAMPED",
    heading: "Stamped and filed",
    blurb: "Everything you finished, with the verdict you gave it.",
    emptyHeading: "No stamps yet",
    emptyBody: "Mark something watched and give it a score from 1 to 10.",
  },
  {
    id: "favorites",
    label: "FAVORITES",
    eyebrow: "PINNED",
    heading: "Pinned favorites",
    blurb: "The ones you pinned, whatever score you gave them.",
    emptyHeading: "Nothing pinned",
    emptyBody: "Pin a title from its page or from its stub to keep it here.",
  },
] as const

function titleDate(title: SavedTitle) {
  const value = title.lastWatchedAt ?? title.savedAt
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "DATE UNKNOWN"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function CollectionPage({
  onMarkWatched,
  onToggleFavorite,
  onUpdateProgress,
}: CollectionPageProps) {
  const { view = "watchlist", listRef } = useParams()
  const listId = listIdFromSlug(listRef)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [sort, setSort] = useState<ArchiveSort>("added")
  const [filter, setFilter] = useState<Filter>("all")
  const [pager, setPager] = useState({ scope: "", page: 1 })
  const [newName, setNewName] = useState("")
  const [editingName, setEditingName] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmingListRemoval, setConfirmingListRemoval] = useState<string | null>(null)
  const [formError, setFormError] = useState("")

  const collections = useQuery({
    queryKey: ["lists"],
    queryFn: () => fetchJson<CollectionList[]>("/api/lists"),
  })
  const custom = useQuery({
    queryKey: ["list", listId],
    queryFn: () => fetchJson<CustomCollection>(`/api/lists/${listId}`),
    enabled: Boolean(listRef && listId),
  })
  const createList = useMutation({
    mutationFn: (name: string) =>
      fetchJson<CollectionList>("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ["lists"] })
      setNewName("")
      navigate(listPath(list))
    },
  })
  const renameList = useMutation({
    mutationFn: (name: string) =>
      fetchJson(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] })
      queryClient.invalidateQueries({ queryKey: ["list", listId] })
      setEditingName("")
    },
  })
  const deleteList = useMutation({
    mutationFn: () => fetchJson(`/api/lists/${listId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] })
      navigate("/collection/watchlist", { replace: true })
    },
  })
  const removeFromList = useMutation({
    mutationFn: (title: SavedTitle) =>
      fetchJson(`/api/lists/${listId}/titles/${title.mediaType}/${title.tmdbId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setConfirmingListRemoval(null)
      queryClient.invalidateQueries({ queryKey: ["list", listId] })
      queryClient.invalidateQueries({ queryKey: ["lists"] })
    },
  })

  const isView = !listId && (views as readonly { id: string }[]).some(
    (item) => item.id === view,
  )
  // Page 4 of one sort is not page 4 of the next, so changing the view, sort,
  // or filter starts over. Derived rather than reset in an effect.
  const scope = `${listRef ?? view}|${sort}|${filter}`
  const pageNumber = pager.scope === scope ? pager.page : 1
  const goToPage = (next: number) => setPager({ scope, page: Math.max(1, next) })
  // The default views page and sort on the server; a custom list is small
  // enough to arrive whole and is arranged here.
  const archivePage = useArchivePage(view as ArchiveView, {
    page: pageNumber,
    pageSize: PAGE_SIZE,
    sort,
    mediaType: filter === "all" ? null : filter,
    enabled: isView,
  })

  const customTitles = (custom.data?.titles ?? [])
    .filter((title) => filter === "all" || title.mediaType === filter)
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title)
      if (sort === "year") return (b.year ?? 0) - (a.year ?? 0)
      if (sort === "score") return (b.score ?? -1) - (a.score ?? -1)
      return (
        new Date(b.lastWatchedAt ?? b.savedAt).getTime() -
        new Date(a.lastWatchedAt ?? a.savedAt).getTime()
      )
    })

  const visible = listId ? customTitles : (archivePage.data?.titles ?? [])
  const total = listId ? customTitles.length : (archivePage.data?.total ?? 0)
  const hasMore = listId ? false : Boolean(archivePage.data?.hasMore)
  const filtered = filter !== "all"

  const activeView = views.find((item) => item.id === view) ?? views[0]
  const currentLabel = listId
    ? custom.data?.name ?? "Custom list"
    : activeView.label
  const page = listId
    ? {
        eyebrow: "CUSTOM LIST",
        heading: custom.data?.name ?? "Custom list",
        blurb: "A list you built yourself. These titles stay in your archive too.",
        emptyHeading: "This list is empty",
        emptyBody: "Open any title and add it to this list.",
      }
    : activeView
  const pageLoading =
    collections.isLoading ||
    (listId ? custom.isLoading : archivePage.isLoading)
  const pageError = collections.isError || custom.isError || archivePage.isError
  const listActionError =
    renameList.error ?? deleteList.error ?? removeFromList.error

  async function submitNewList(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setFormError("")
    try {
      await createList.mutateAsync(name)
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "List could not be created.")
    }
  }

  useEffect(() => {
    if (!listRef && !views.some((item) => item.id === view)) {
      navigate("/collection/watchlist", { replace: true })
    }
  }, [listRef, navigate, view])


  useEffect(() => {
    if (!custom.data) return
    const canonicalPath = listPath(custom.data)
    if (location.pathname !== canonicalPath) {
      navigate(canonicalPath, { replace: true })
    }
  }, [custom.data, location.pathname, navigate])

  useEffect(() => {
    setPageMeta({
      title: `${page.heading} · Stub`,
      description: page.blurb,
      canonicalPath: location.pathname,
      indexable: false,
    })
  }, [location.pathname, page.blurb, page.heading])

  return (
    <main className="pb-24 pt-12">
      <p className="font-mono text-[10px] tracking-[0.16em] text-accent">{page.eyebrow}</p>
      <h1 className="mt-3 font-display text-display-lg font-normal">{page.heading}</h1>
      <p className="mt-4 max-w-2xl text-text-dim">{page.blurb}</p>

      <nav className="collection-tabs" aria-label="Collection views">
        {views.map((item) => (
          <Link
            key={item.id}
            to={`/collection/${item.id}`}
            className={!listId && view === item.id ? "is-active" : ""}
          >
            {item.label}
          </Link>
        ))}
        <Link to="/diary">DIARY</Link>
      </nav>

      <div className="collection-layout">
        <aside className="collection-lists">
          <h2>My lists</h2>
          {(collections.data ?? [])
            .filter((list) => list.type === "custom")
            .map((list) => (
              <Link
                key={list.id}
                to={listPath(list)}
                className={list.id === listId ? "is-active" : ""}
              >
                <span>{list.name}</span>
                <span>{list.count}</span>
              </Link>
            ))}
          <form onSubmit={submitNewList} className="collection-new-list">
            <label htmlFor="new-list-name">NEW LIST</label>
            <div>
              <input
                id="new-list-name"
                value={newName}
                maxLength={40}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Weekend queue"
              />
              <button type="submit" disabled={createList.isPending || !newName.trim()}>
                +
              </button>
            </div>
            {(formError || createList.error) && (
              <p>{formError || (createList.error as Error).message}</p>
            )}
          </form>
        </aside>

        <section className="min-w-0">
          <div className="collection-toolbar">
            <div>
              <h2>{currentLabel}</h2>
              <p>{visible.length} {visible.length === 1 ? "TITLE" : "TITLES"}</p>
            </div>
            <label>
              <span className="sr-only">Media type</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
                <option value="all">ALL TYPES</option>
                <option value="movie">MOVIES</option>
                <option value="tv">TV</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Sort collection</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as ArchiveSort)}>
                <option value="added">RECENTLY ADDED</option>
                <option value="title">TITLE A–Z</option>
                <option value="year">YEAR</option>
                <option value="score">SCORE</option>
              </select>
            </label>
          </div>

          {listId && custom.data && (
            <>
            <div className="collection-list-actions">
              {editingName ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (editingName.trim()) renameList.mutate(editingName.trim())
                  }}
                >
                  <input
                    autoFocus
                    value={editingName}
                    maxLength={40}
                    onChange={(event) => setEditingName(event.target.value)}
                  />
                  <button type="submit">SAVE NAME</button>
                  <button type="button" onClick={() => setEditingName("")}>CANCEL</button>
                </form>
              ) : confirmDelete ? (
                <>
                  <span className="mr-auto font-mono text-[10px] text-text-dim">
                    DELETE THIS LIST? TITLES STAY IN YOUR ARCHIVE.
                  </span>
                  <button type="button" onClick={() => setConfirmDelete(false)}>
                    CANCEL
                  </button>
                  <button
                    type="button"
                    className="text-stamp"
                    disabled={deleteList.isPending}
                    onClick={() => deleteList.mutate()}
                  >
                    {deleteList.isPending ? "DELETING…" : "CONFIRM DELETE"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setEditingName(custom.data.name)}>
                    RENAME
                  </button>
                  <button
                    type="button"
                    className="text-stamp"
                    onClick={() => setConfirmDelete(true)}
                  >
                    DELETE LIST
                  </button>
                </>
              )}
            </div>
            {listActionError && (
              <p className="mt-3 font-mono text-[11px] text-stamp">
                {listActionError instanceof Error
                  ? listActionError.message
                  : "LIST ACTION FAILED"}
              </p>
            )}
            </>
          )}

          {pageLoading ? (
            <div className="collection-state">LOADING THE ARCHIVE</div>
          ) : pageError ? (
            <div className="collection-state">
              <h2>Projection interrupted</h2>
              <p>We could not load this collection.</p>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  void collections.refetch()
                  if (listId) void custom.refetch()
                  else void archivePage.refetch()
                }}
              >
                Retry
              </button>
            </div>
          ) : visible.length === 0 && filtered ? (
            <div className="collection-state">
              <h2>Nothing matches this filter</h2>
              <p>
                {filter === "movie"
                  ? "No movies in this view yet."
                  : "No television in this view yet."}
              </p>
              <button
                type="button"
                className="button-primary"
                onClick={() => setFilter("all")}
              >
                Show all types
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="collection-state">
              <h2>{page.emptyHeading}</h2>
              <p>{page.emptyBody}</p>
              <Link to="/search" className="button-primary">Search titles</Link>
            </div>
          ) : (
            <div className="collection-grid">
              {visible.map((title) => (
                <div key={`${title.mediaType}-${title.tmdbId}`} className="collection-ticket">
                  <TicketStub
                    title={title}
                    onMarkWatched={onMarkWatched}
                    onToggleFavorite={onToggleFavorite}
                  />
                  <div className="collection-ticket-actions">
                    <span>{title.lastWatchedAt ? `WATCHED · ${titleDate(title)}` : `ADDED · ${titleDate(title)}`}</span>
                    {title.mediaType === "tv" && title.status !== "watched" && (
                      <TvProgressEditor
                        key={`${title.tmdbId}-${title.progress?.season}-${title.progress?.episode}`}
                        seasonOptions={title.seasonOptions}
                        progress={title.progress}
                        mode="collection"
                        onUpdate={(season, episode) =>
                          onUpdateProgress(title.tmdbId, season, episode)
                        }
                      />
                    )}
                    {listId && (
                      confirmingListRemoval === `${title.mediaType}-${title.tmdbId}` ? (
                        <div role="group" aria-label={`Remove ${title.title} from this list`}>
                          <span>REMOVE FROM THIS LIST?</span>
                          <button
                            type="button"
                            disabled={removeFromList.isPending}
                            onClick={() => setConfirmingListRemoval(null)}
                          >
                            CANCEL
                          </button>
                          <button
                            type="button"
                            className="text-stamp"
                            disabled={removeFromList.isPending}
                            onClick={() => removeFromList.mutate(title)}
                          >
                            {removeFromList.isPending ? "REMOVING…" : "CONFIRM"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmingListRemoval(`${title.mediaType}-${title.tmdbId}`)
                          }
                        >
                          REMOVE FROM LIST
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!pageLoading && !pageError && visible.length > 0 && !listId && total > PAGE_SIZE && (
            <nav className="collection-pager" aria-label="Collection pages">
              <button
                type="button"
                className="button-outline"
                disabled={pageNumber === 1 || archivePage.isFetching}
                onClick={() => goToPage(pageNumber - 1)}
              >
                ← NEWER
              </button>
              <p aria-live="polite">
                {(pageNumber - 1) * PAGE_SIZE + 1}–{(pageNumber - 1) * PAGE_SIZE + visible.length}{" "}
                OF{" "}
                {total}
              </p>
              <button
                type="button"
                className="button-outline"
                disabled={!hasMore || archivePage.isFetching}
                onClick={() => goToPage(pageNumber + 1)}
              >
                OLDER →
              </button>
            </nav>
          )}

        </section>
      </div>
    </main>
  )
}
