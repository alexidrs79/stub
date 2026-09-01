import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { fetchJson } from "./api"
import { localDateKey } from "./dates"
import { MediaImage } from "./MediaImage"
import { Pager } from "./Pager"
import { titlePath } from "./paths"
import type { DiaryEvent, DiaryPageResponse } from "./title"
import { ARCHIVE_INDEX_KEY, invalidatePagedViews } from "./useArchive"
import { VerdictForm } from "./VerdictForm"

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

const PAGE_SIZE = 25

function dayLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function DiaryPage() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(currentMonth)
  const [pager, setPager] = useState({ month: "", page: 1 })
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const removeTrigger = useRef<HTMLButtonElement | null>(null)
  const editTrigger = useRef<HTMLButtonElement | null>(null)
  // Picking another month starts at its newest stamps. Derived so the month
  // input stays the only thing that has to change.
  const page = pager.month === month ? pager.page : 1
  const diary = useQuery({
    queryKey: ["diary", month, page],
    queryFn: () =>
      fetchJson<DiaryPageResponse>(`/api/diary?month=${month}&page=${page}`),
    placeholderData: (previous) => previous,
  })

  /// A stamp edit can move an entry to another month or change the verdict the
  /// rest of the app shows, so both the log and the archive index are dropped.
  function invalidateAfterChange() {
    invalidatePagedViews(queryClient)
    for (const key of [ARCHIVE_INDEX_KEY, ["profile"]]) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }

  const editEvent = useMutation({
    mutationFn: (input: {
      eventId: string
      score: number
      note: string | null
      watchedAt?: string
    }) =>
      fetchJson<DiaryEvent>(`/api/diary/${input.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: input.score,
          note: input.note,
          ...(input.watchedAt ? { watchedAt: input.watchedAt } : {}),
        }),
      }),
    onSuccess: () => {
      setEditingId(null)
      invalidateAfterChange()
      requestAnimationFrame(() => editTrigger.current?.focus())
    },
  })

  const removeEvent = useMutation({
    mutationFn: (eventId: string) =>
      fetchJson<{
        eventId: string
        remainingWatchCount: number
        status: "watchlist" | "watched"
      }>(`/api/diary/${eventId}`, { method: "DELETE"       }),
    onSuccess: () => {
      setConfirmingId(null)
      invalidateAfterChange()
    },
  })

  function cancelRemoval() {
    setConfirmingId(null)
    removeEvent.reset()
    requestAnimationFrame(() => removeTrigger.current?.focus())
  }
  const events = diary.data?.events ?? []
  const total = diary.data?.total ?? 0

  // Removing stamps can strand the reader past the end of a shrunken month,
  // where the empty state would wrongly claim they logged nothing. Corrected
  // while rendering so no blank page is ever shown.
  if (events.length === 0 && total > 0) {
    const lastPage = Math.ceil(total / PAGE_SIZE)
    if (lastPage < page) setPager({ month, page: lastPage })
  }

  const groups = new Map<string, DiaryEvent[]>()
  for (const event of events) {
    const key = localDateKey(event.watchedAt)
    groups.set(key, [...(groups.get(key) ?? []), event])
  }

  return (
    <main className="pb-24 pt-12">
      <p className="font-mono text-[10px] tracking-[0.16em] text-accent">YOUR DIARY</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-display-lg font-normal">Screening log</h1>
          <p className="mt-4 max-w-xl text-text-dim">
            Every title you finished, in the order you stamped it.
          </p>
          {total > 0 && (
            <p className="mt-3 font-mono text-[11px] tracking-[0.08em] text-text-dim">
              {total} {total === 1 ? "STAMP" : "STAMPS"} THIS MONTH
            </p>
          )}
        </div>
        <label className="diary-month">
          <span>MONTH</span>
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      </div>

      <nav className="collection-tabs" aria-label="Collection views">
        <Link to="/collection/watchlist">WATCHLIST</Link>
        <Link to="/collection/watching">WATCHING</Link>
        <Link to="/collection/watched">WATCHED</Link>
        <Link to="/collection/favorites">FAVORITES</Link>
        <Link to="/diary" className="is-active">DIARY</Link>
      </nav>

      {diary.isLoading ? (
        <div className="collection-state">OPENING THE LOG</div>
      ) : diary.isError ? (
        <div className="collection-state">
          <h2>Diary unavailable</h2>
          <p>Your stamps are safe. Try opening the log again.</p>
          <button type="button" className="button-primary" onClick={() => diary.refetch()}>
            Retry
          </button>
        </div>
      ) : groups.size === 0 ? (
        <div className="collection-state">
          <h2>No stamps this month</h2>
          <p>Stamp a title when you finish watching it.</p>
          <Link to="/collection/watchlist" className="button-primary">Open watchlist</Link>
        </div>
      ) : (
        <div className="diary-days">
          {[...groups.entries()].map(([date, events]) => (
            <section key={date} className="diary-day">
              <h2>{dayLabel(`${date}T12:00:00`)}</h2>
              <div>
                {events.map((event) => (
                  <article key={event.id} className="diary-entry">
                    <Link to={titlePath(event.title)}>
                      <MediaImage
                        src={event.title.posterUrl}
                        alt={`${event.title.title} poster`}
                        className="poster w-16"
                        imageClassName="object-cover"
                        fallback="NO POSTER"
                      />
                    </Link>
                    <div className="min-w-0">
                      <Link
                        to={titlePath(event.title)}
                        className="font-display text-display-sm hover:text-accent"
                      >
                        {event.title.title}
                      </Link>
                      <p className="mt-1 font-mono text-[11px] text-text-dim">
                        {event.title.year ?? "—"} · {event.title.mediaType.toUpperCase()}
                        {event.score != null ? ` · ${event.score}/10` : ""}
                      </p>
                      {event.note && <p className="diary-note">“{event.note}”</p>}
                      {editingId === event.id && (
                        <div className="diary-edit">
                          <VerdictForm
                            showDate
                            initialScore={event.score}
                            initialNote={event.note}
                            initialDate={localDateKey(event.watchedAt)}
                            submitLabel="Save stamp"
                            pendingLabel="Saving…"
                            pending={editEvent.isPending}
                            error={
                              editEvent.error instanceof Error
                                ? editEvent.error.message
                                : null
                            }
                            onSubmit={async (score, note, watchedAt) => {
                              await editEvent.mutateAsync({
                                eventId: event.id,
                                score,
                                note,
                                watchedAt,
                              })
                            }}
                            onCancel={() => {
                              setEditingId(null)
                              editEvent.reset()
                              requestAnimationFrame(() => editTrigger.current?.focus())
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="diary-entry-action">
                      {confirmingId === event.id ? (
                        <div className="diary-remove-confirm" role="group" aria-label="Remove stamp">
                          <p>
                            Removing this stamp puts the title back on your
                            Watchlist.
                          </p>
                          <div>
                            <button
                              type="button"
                              disabled={removeEvent.isPending}
                              onClick={cancelRemoval}
                            >
                              CANCEL
                            </button>
                            <button
                              type="button"
                              className="text-stamp"
                              disabled={removeEvent.isPending}
                              onClick={() => removeEvent.mutate(event.id)}
                            >
                              {removeEvent.isPending ? "REMOVING…" : "REMOVE STAMP"}
                            </button>
                          </div>
                          {removeEvent.isError && (
                            <p className="text-stamp" role="alert">
                              {removeEvent.error instanceof Error
                                ? removeEvent.error.message
                                : "Stamp could not be removed."}
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-expanded={editingId === event.id}
                            onClick={(click) => {
                              editTrigger.current = click.currentTarget
                              editEvent.reset()
                              setEditingId((current) =>
                                current === event.id ? null : event.id,
                              )
                            }}
                          >
                            {editingId === event.id ? "CLOSE" : "EDIT ENTRY"}
                          </button>
                          <button
                            ref={confirmingId == null ? removeTrigger : undefined}
                            type="button"
                            onClick={(click) => {
                              removeTrigger.current = click.currentTarget
                              removeEvent.reset()
                              setConfirmingId(event.id)
                            }}
                          >
                            REMOVE ENTRY
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!diary.isLoading && !diary.isError && (
        <Pager
          label="Diary pages"
          page={diary.data?.page ?? page}
          pageSize={diary.data?.pageSize ?? PAGE_SIZE}
          shown={events.length}
          total={total}
          hasMore={Boolean(diary.data?.hasMore)}
          busy={diary.isFetching}
          onPage={(next) => setPager({ month, page: next })}
        />
      )}
    </main>
  )
}
