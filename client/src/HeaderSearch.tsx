import { useQuery } from "@tanstack/react-query"
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useNavigate } from "react-router-dom"
import { fetchJson } from "./api"
import { MediaImage } from "./MediaImage"
import { titlePath } from "./paths"
import type { SearchHit } from "./title"

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}

export function HeaderSearch({
  autoFocus = false,
  onNavigate,
}: {
  autoFocus?: boolean
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const root = useRef<HTMLDivElement>(null)
  const rawId = useId()
  const listId = `header-search-${rawId.replaceAll(":", "")}`
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const trimmed = query.trim()
  const debounced = useDebounced(trimmed, 225)
  const ready = trimmed.length >= 2
  const search = useQuery({
    queryKey: ["search", "header", debounced],
    queryFn: ({ signal }) =>
      fetchJson<SearchHit[]>(`/api/search?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: debounced.length >= 2,
    staleTime: 1000 * 60 * 5,
  })
  const suggestions = debounced === trimmed ? (search.data ?? []).slice(0, 5) : []
  const optionCount = suggestions.length + 1
  const expanded = open && ready

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  function finishNavigation(path: string) {
    setOpen(false)
    setActiveIndex(-1)
    setQuery("")
    navigate(path)
    onNavigate?.()
  }

  function openTitle(title: SearchHit) {
    finishNavigation(titlePath(title))
  }

  function openAll() {
    if (!trimmed) return
    finishNavigation(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    if (expanded && activeIndex >= 0 && activeIndex < suggestions.length) {
      openTitle(suggestions[activeIndex])
      return
    }
    openAll()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (event.key === "Enter" && expanded && activeIndex >= 0) {
      event.preventDefault()
      if (activeIndex < suggestions.length) openTitle(suggestions[activeIndex])
      else openAll()
      return
    }
    if (!ready || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return
    event.preventDefault()
    setOpen(true)
    setActiveIndex((current) => {
      if (event.key === "ArrowDown") return current >= optionCount - 1 ? 0 : current + 1
      return current <= 0 ? optionCount - 1 : current - 1
    })
  }

  return (
    <div ref={root} className="relative w-full">
      <form onSubmit={submit}>
        <label className="header-search flex h-9 items-center gap-3 px-3">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="size-4 shrink-0 text-text-dim"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <span className="sr-only">Search titles</span>
          <input
            autoFocus={autoFocus}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(event.target.value.trim().length >= 2)
              setActiveIndex(-1)
            }}
            onFocus={() => {
              if (ready) setOpen(true)
            }}
            onKeyDown={onKeyDown}
            placeholder="SEARCH TITLES"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={
              expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
            }
            className="bare-input min-w-0 flex-1 bg-transparent font-mono text-[11px] tracking-[0.08em] text-text outline-none placeholder:text-text-dim"
          />
        </label>
      </form>

      {expanded && (
        <div
          id={listId}
          role="listbox"
          aria-label="Title suggestions"
          className="header-search-results absolute inset-x-0 top-[calc(100%+4px)] z-50 border border-border bg-surface-raised"
        >
          {search.isFetching && suggestions.length === 0 && (
            <p className="px-3 py-3 font-mono text-[10px] tracking-[0.1em] text-text-dim">
              SEARCHING
            </p>
          )}
          {search.isError && (
            <p className="px-3 py-3 font-mono text-[10px] tracking-[0.1em] text-text-dim">
              SEARCH UNAVAILABLE
            </p>
          )}
          {suggestions.map((title, index) => (
            <button
              key={`${title.mediaType}-${title.tmdbId}`}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openTitle(title)}
              className={`header-search-option grid min-h-[74px] w-full grid-cols-[44px_1fr] items-center gap-3 border-t border-border px-3 py-2 text-left${
                activeIndex === index ? " is-active" : ""
              }`}
            >
              <MediaImage
                src={title.posterUrl}
                alt=""
                className="h-[66px] w-11"
                imageClassName="object-cover"
                fallback="—"
              />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-text">{title.title}</span>
                <span className="mt-1 block font-mono text-[10px] tracking-[0.08em] text-text-dim">
                  {title.year ?? "—"} · {title.mediaType === "tv" ? "SERIES" : "MOVIE"}
                </span>
              </span>
            </button>
          ))}
          <button
            id={`${listId}-${suggestions.length}`}
            type="button"
            role="option"
            aria-selected={activeIndex === suggestions.length}
            onMouseEnter={() => setActiveIndex(suggestions.length)}
            onClick={openAll}
            className={`header-search-option min-h-[48px] w-full border-t border-border px-3 py-3 text-left font-mono text-[11px] tracking-[0.06em] text-accent${
              activeIndex === suggestions.length ? " is-active" : ""
            }`}
          >
            VIEW ALL RESULTS FOR “{trimmed.toUpperCase()}” →
          </button>
        </div>
      )}
    </div>
  )
}
