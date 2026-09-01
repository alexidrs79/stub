import type { Request, Response } from "express"
import { requireUser } from "./auth.js"
import { prisma } from "./db.js"
import {
  buildArchiveEntries,
  parseWatchedAt,
  ensureDefaultLists,
  hydrateEntries,
  listArchiveItems,
  savedOne,
} from "./archive.js"
import { getTitleCards } from "./title-cache.js"
import type { MediaType } from "./tmdb.js"
import {
  removeFromArchive,
  transitionToWatched,
  transitionToWatchlist,
  updateWatchedVerdict,
} from "./watch-state.js"

function parseRef(body: { tmdbId?: unknown; mediaType?: unknown } | undefined) {
  if (typeof body?.tmdbId !== "number") return null
  const tmdbId = body.tmdbId
  const mediaType = body?.mediaType
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null
  if (mediaType !== "movie" && mediaType !== "tv") return null
  return { tmdbId, mediaType: mediaType as MediaType }
}

function parseMediaTypeValue(value: unknown) {
  return value === "movie" || value === "tv" ? value : null
}

function parsePathRef(mediaType: string, id: string) {
  const tmdbId = Number(id)
  if (
    (mediaType !== "movie" && mediaType !== "tv") ||
    !Number.isSafeInteger(tmdbId) ||
    tmdbId <= 0
  ) {
    return null
  }
  return { tmdbId, mediaType: mediaType as MediaType }
}

function parseNote(value: unknown) {
  if (value == null || value === "") return { valid: true, note: null }
  if (typeof value !== "string") return { valid: false, note: null }
  const note = value.trim()
  if (note.length > 140) return { valid: false, note: null }
  return { valid: true, note: note || null }
}

const VIEWS = ["watchlist", "watching", "watched", "favorites"] as const
type ArchiveView = (typeof VIEWS)[number]

const SORTS = ["added", "title", "year", "score"] as const
type ArchiveSort = (typeof SORTS)[number]

/// Sorting by title or year needs card data, so those two orders read the title
/// cache for the matching set. The other two sort on archive fields alone.
const CARD_SORTS: ArchiveSort[] = ["title", "year"]

const DEFAULT_PAGE_SIZE = 48
const MAX_PAGE_SIZE = 100

function parsePageSize(value: unknown) {
  if (value == null || value === "") return DEFAULT_PAGE_SIZE
  const size = Number(value)
  if (!Number.isInteger(size) || size < 1) return null
  return Math.min(size, MAX_PAGE_SIZE)
}

function parsePage(value: unknown) {
  if (value == null || value === "") return 1
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : null
}

/// Collapses the three default lists into one row per title. A title can sit in
/// more than one during a transition, and the furthest-along status wins.
/**
 * The whole archive without artwork. Every page uses this to mark titles the
 * user already saved, so it has to stay cheap: no upstream calls, no paging.
 */
export async function listArchiveIndex(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  res.json(await buildArchiveEntries(userId, await listArchiveItems(userId)))
}

/**
 * One page of a collection view, with artwork. Paged because hydrating is the
 * only part of the archive that costs anything.
 */
export async function listTitles(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return

  const view = (req.query.view || "watchlist") as ArchiveView
  const sort = (req.query.sort || "added") as ArchiveSort
  const mediaFilter = req.query.mediaType
  if (!VIEWS.includes(view)) {
    res.status(400).json({ error: "Unknown view." })
    return
  }
  if (!SORTS.includes(sort)) {
    res.status(400).json({ error: "Unknown sort." })
    return
  }
  if (mediaFilter != null && mediaFilter !== "" && !parseMediaTypeValue(mediaFilter)) {
    res.status(400).json({ error: "Bad media type." })
    return
  }
  const page = parsePage(req.query.page)
  const pageSize = parsePageSize(req.query.pageSize)
  if (page == null || pageSize == null) {
    res.status(400).json({ error: "Bad page." })
    return
  }

  const entries = await buildArchiveEntries(userId, await listArchiveItems(userId))
  const matching = entries.filter((entry) => {
    if (view === "favorites" ? !entry.favorite : entry.status !== view) return false
    return !mediaFilter || entry.mediaType === mediaFilter
  })

  // Sorting has to run over the whole view, not the page, or paging would
  // reorder the results as the reader walks through them.
  let ordered = matching
  if (CARD_SORTS.includes(sort)) {
    const cards = await getTitleCards(matching)
    ordered = [...matching].sort((a, b) => {
      const left = cards.get(`${a.mediaType}-${a.tmdbId}`)
      const right = cards.get(`${b.mediaType}-${b.tmdbId}`)
      if (sort === "year") return (right?.year ?? 0) - (left?.year ?? 0)
      return (left?.title ?? "").localeCompare(right?.title ?? "")
    })
  } else if (sort === "score") {
    ordered = [...matching].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  } else {
    ordered = [...matching].sort(
      (a, b) =>
        new Date(b.lastWatchedAt ?? b.savedAt).getTime() -
        new Date(a.lastWatchedAt ?? a.savedAt).getTime(),
    )
  }

  const start = (page - 1) * pageSize
  const slice = ordered.slice(start, start + pageSize)

  res.json({
    titles: await hydrateEntries(slice),
    page,
    pageSize,
    total: ordered.length,
    hasMore: start + slice.length < ordered.length,
  })
}

export async function addToWatchlist(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  if (!ref) {
    res.status(400).json({ error: "Bad title" })
    return
  }
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  const status = await transitionToWatchlist(userId, ref, {
    watchlist: watchlist.id,
    watching: watching.id,
    watched: watched.id,
  })
  res
    .status(status === "watchlist" ? 201 : 200)
    .json(await savedOne(userId, ref.tmdbId, ref.mediaType, status))
}

export async function markWatched(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  const score = typeof req.body?.score === "number" ? req.body.score : Number.NaN
  const parsedNote = parseNote(req.body?.note)
  const parsedDate = parseWatchedAt(req.body?.watchedAt)
  if (
    !ref ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 10 ||
    !parsedNote.valid ||
    !parsedDate.valid
  ) {
    res.status(400).json({
      error: !parsedNote.valid
        ? "Notes can contain up to 140 characters."
        : !parsedDate.valid
          ? "Enter a watch date that is not in the future."
          : "Choose a whole-number score from 1 to 10.",
    })
    return
  }
  const note = parsedNote.note
  const { watchlist, watching, watched } = await ensureDefaultLists(userId)
  await transitionToWatched(
    userId,
    ref,
    score,
    note,
    { watchlist: watchlist.id, watching: watching.id, watched: watched.id },
    parsedDate.watchedAt,
  )
  res.json(await savedOne(userId, ref.tmdbId, ref.mediaType, "watched"))
}

export async function removeTitle(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parsePathRef(String(req.params.mediaType), String(req.params.id))
  if (!ref) {
    res.status(400).json({ error: "Bad title" })
    return
  }
  await removeFromArchive(userId, ref)
  res.status(204).end()
}

export async function rateTitle(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return
  const ref = parseRef(req.body)
  const score = typeof req.body?.score === "number" ? req.body.score : Number.NaN
  const parsedNote = parseNote(req.body?.note)
  if (
    !ref ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 10 ||
    !parsedNote.valid
  ) {
    res.status(400).json({
      error: parsedNote.valid
        ? "Score must be a whole number from 1 to 10."
        : "Notes can contain up to 140 characters.",
    })
    return
  }
  const note = parsedNote.note
  const { watched } = await ensureDefaultLists(userId)
  const item = await prisma.listItem.findUnique({
    where: {
      listId_tmdbId_mediaType: {
        listId: watched.id,
        tmdbId: ref.tmdbId,
        mediaType: ref.mediaType,
      },
    },
  })
  if (!item) {
    res.status(400).json({ error: "Mark watched before rating." })
    return
  }
  await updateWatchedVerdict(userId, ref, score, note)
  res.json(await savedOne(userId, ref.tmdbId, ref.mediaType, "watched"))
}
