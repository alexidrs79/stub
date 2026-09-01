import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import { fetchJson } from "./api"
import { MediaImage } from "./MediaImage"
import { titlePath } from "./paths"
import type { DiaryEvent } from "./title"

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function dayLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function localDateKey(value: string) {
  const date = new Date(value)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

export function DiaryPage() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(currentMonth)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const removeTrigger = useRef<HTMLButtonElement | null>(null)
  const diary = useQuery({
    queryKey: ["diary", month],
    queryFn: () => fetchJson<DiaryEvent[]>(`/api/diary?month=${month}`),
  })
  const removeEvent = useMutation({
    mutationFn: (eventId: string) =>
      fetchJson<{
        eventId: string
        remainingWatchCount: number
        status: "watchlist" | "watched"
      }>(`/api/diary/${eventId}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmingId(null)
      queryClient.invalidateQueries({ queryKey: ["diary"] })
      queryClient.invalidateQueries({ queryKey: ["titles"] })
      queryClient.invalidateQueries({ queryKey: ["lists"] })
      queryClient.invalidateQueries({ queryKey: ["list"] })
    },
  })

  function cancelRemoval() {
    setConfirmingId(null)
    removeEvent.reset()
    requestAnimationFrame(() => removeTrigger.current?.focus())
  }
  const groups = new Map<string, DiaryEvent[]>()
  for (const event of diary.data ?? []) {
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
                    </div>
                    <div className="diary-entry-action">
                      {confirmingId === event.id ? (
                        <div className="diary-remove-confirm" role="group" aria-label="Remove stamp">
                          <p>
                            If this is the only stamp, the title goes back to your
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
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
