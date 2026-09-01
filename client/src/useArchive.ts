import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { fetchJson } from "./api"
import { useAuth } from "./auth"
import { safeReturnPath } from "./paths"
import type {
  ArchiveEntry,
  ArchivePage,
  ArchiveSort,
  ArchiveView,
  MediaType,
  SavedTitle,
  SearchHit,
  TitleDetail,
} from "./title"
import { titleKey, toArchiveEntry, upsertSaved } from "./title"

export const ARCHIVE_INDEX_KEY = ["archive", "index"] as const

type TitleRef = { tmdbId: number; mediaType: MediaType }

function jsonBody(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

/**
 * Owns the archive: the index of every saved title plus every mutation that
 * changes it. Pages read the index for their "already saved" markers and call
 * the actions; none of them talk to the archive endpoints directly.
 */
export function useArchive() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [error, setError] = useState("")
  const [justStamped, setJustStamped] = useState<string | null>(null)

  const indexQuery = useQuery({
    queryKey: ARCHIVE_INDEX_KEY,
    queryFn: () => fetchJson<ArchiveEntry[]>("/api/titles/index"),
    enabled: Boolean(user),
  })
  // A fresh [] each render would invalidate every callback that reads it.
  const entries = useMemo(() => indexQuery.data ?? [], [indexQuery.data])

  const patchIndex = useCallback(
    (update: (current: ArchiveEntry[]) => ArchiveEntry[]) => {
      queryClient.setQueryData<ArchiveEntry[]>(ARCHIVE_INDEX_KEY, (current) =>
        update(current ?? []),
      )
    },
    [queryClient],
  )

  /// Any archive write can reorder or re-scope a paged view, so the paged
  /// queries are dropped rather than patched.
  const invalidatePagedViews = useCallback(() => {
    for (const key of [["archive", "page"], ["lists"], ["list"], ["diary"]]) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }, [queryClient])

  const applySaved = useCallback(
    (saved: SavedTitle) => {
      patchIndex((current) => upsertSaved(current, toArchiveEntry(saved)))
      invalidatePagedViews()
    },
    [invalidatePagedViews, patchIndex],
  )

  const reportError = useCallback((fallback: string) => {
    return (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : fallback)
    }
  }, [])

  const saveMutation = useMutation({
    mutationFn: (title: TitleRef) =>
      fetchJson<SavedTitle>("/api/watchlist", {
        method: "POST",
        ...jsonBody({ tmdbId: title.tmdbId, mediaType: title.mediaType }),
      }),
    onSuccess: (saved) => {
      setError("")
      applySaved(saved)
    },
    onError: reportError("TITLE COULD NOT BE SAVED"),
  })

  const watchedMutation = useMutation({
    mutationFn: (body: TitleRef & {
      score: number
      note: string | null
      watchedAt?: string
    }) => fetchJson<SavedTitle>("/api/watched", { method: "POST", ...jsonBody(body) }),
    onSuccess: (saved) => {
      applySaved(saved)
      setJustStamped(titleKey(saved))
    },
  })

  const removeMutation = useMutation({
    mutationFn: (ref: TitleRef) =>
      fetchJson<void>(`/api/titles/${ref.mediaType}/${ref.tmdbId}`, {
        method: "DELETE",
      }),
    onSuccess: (_void, ref) => {
      const key = titleKey(ref)
      patchIndex((current) => current.filter((entry) => titleKey(entry) !== key))
      invalidatePagedViews()
    },
    onError: reportError("TITLE COULD NOT BE REMOVED"),
  })

  const rateMutation = useMutation({
    mutationFn: (body: TitleRef & { score: number; note: string | null }) =>
      fetchJson<SavedTitle>("/api/ratings", { method: "PUT", ...jsonBody(body) }),
    onSuccess: applySaved,
  })

  const favoriteMutation = useMutation({
    mutationFn: (entry: ArchiveEntry) =>
      entry.favorite
        ? fetchJson<void>(`/api/favorites/${entry.mediaType}/${entry.tmdbId}`, {
            method: "DELETE",
          })
        : fetchJson("/api/favorites", {
            method: "PUT",
            ...jsonBody({ tmdbId: entry.tmdbId, mediaType: entry.mediaType }),
          }),
    onSuccess: (_result, entry) => {
      setError("")
      const key = titleKey(entry)
      patchIndex((current) =>
        current.map((item) =>
          titleKey(item) === key ? { ...item, favorite: !entry.favorite } : item,
        ),
      )
      invalidatePagedViews()
    },
    onError: reportError("FAVORITE COULD NOT BE UPDATED"),
  })

  const progressMutation = useMutation({
    mutationFn: (body: { tmdbId: number; season: number; episode: number }) =>
      fetchJson<SavedTitle>("/api/progress", {
        method: "PUT",
        ...jsonBody({ ...body, mediaType: "tv" }),
      }),
    onSuccess: applySaved,
  })

  /// Every action is a no-op for a signed-out visitor, who is sent to log in
  /// with the current page remembered.
  const requireUser = useCallback(() => {
    if (user) return true
    navigate("/login", { state: { from: safeReturnPath(location.pathname) } })
    return false
  }, [location.pathname, navigate, user])

  const entryFor = useCallback(
    (ref: TitleRef) => entries.find((entry) => titleKey(entry) === titleKey(ref)),
    [entries],
  )

  const actions = {
    save(title: SearchHit | TitleDetail | TitleRef) {
      if (!requireUser()) return
      if (entryFor(title)) return
      // Double-submitting the same title would create a duplicate request for
      // an operation the server already treats as idempotent.
      if (
        saveMutation.isPending &&
        saveMutation.variables &&
        titleKey(saveMutation.variables) === titleKey(title)
      ) {
        return
      }
      saveMutation.mutate({ tmdbId: title.tmdbId, mediaType: title.mediaType })
    },
    async logWatched(
      ref: TitleRef,
      score: number,
      note: string | null,
      watchedAt?: string,
    ) {
      if (!requireUser()) return
      await watchedMutation.mutateAsync({ ...ref, score, note, watchedAt })
    },
    async remove(ref: TitleRef) {
      if (!requireUser()) return
      await removeMutation.mutateAsync(ref)
    },
    async rate(ref: TitleRef, score: number, note: string | null) {
      if (!requireUser()) return
      await rateMutation.mutateAsync({ ...ref, score, note })
    },
    toggleFavorite(entry: ArchiveEntry) {
      if (!requireUser()) return
      favoriteMutation.mutate(entry)
    },
    async updateProgress(tmdbId: number, season: number, episode: number) {
      if (!requireUser()) return
      await progressMutation.mutateAsync({ tmdbId, season, episode })
    },
  }

  return {
    entries,
    entryFor,
    loading: indexQuery.isLoading,
    failed: indexQuery.isError,
    error,
    justStamped,
    watchedMutation,
    actions,
    requireUser,
  }
}

export type Archive = ReturnType<typeof useArchive>

/**
 * One page of a collection view. Views are hydrated with artwork, so they are
 * fetched a page at a time rather than as the whole archive.
 */
export function useArchivePage(
  view: ArchiveView,
  options: {
    pageSize?: number
    page?: number
    sort?: ArchiveSort
    mediaType?: MediaType | null
    enabled?: boolean
  } = {},
) {
  const { pageSize, page = 1, sort = "added", mediaType = null, enabled = true } = options
  const params = new URLSearchParams({ view, page: String(page), sort })
  if (pageSize) params.set("pageSize", String(pageSize))
  if (mediaType) params.set("mediaType", mediaType)

  return useQuery({
    queryKey: ["archive", "page", view, page, pageSize ?? "default", sort, mediaType],
    queryFn: () => fetchJson<ArchivePage>(`/api/titles?${params}`),
    enabled,
    // Keeps the current page on screen while the next sort or filter loads,
    // instead of flashing the empty state between them.
    placeholderData: (previous) => previous,
  })
}
