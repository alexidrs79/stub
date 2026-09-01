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
import {
  parseMediaType,
  parseNote,
  parsePage,
  parsePageSize,
  parseScore,
  parseTitleRef,
} from "./http.js"
import { getTitleCards } from "./title-cache.js"
import {
  removeFromArchive,
  transitionToWatched,
  transitionToWatchlist,
  updateWatchedVerdict,
} from "./watch-state.js"

const VIEWS = ["watchlist", "watching", "watched", "favorites"] as const
type ArchiveView = (typeof VIEWS)[number]

const SORTS = ["added", "title", "year", "score"] as const
type ArchiveSort = (typeof SORTS)[number]

/// Sorting by title or year needs card data, so those two orders read the title
/// cache for the matching set. The other two sort on archive fields alone.
const CARD_SORTS: ArchiveSort[] = ["title", "year"]

const DEFAULT_PAGE_SIZE = 24

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
 * only part of the archive that costs anything. `list` pages a custom list
 * instead of a default view; both draw from the same archive entries.
 */
export async function listTitles(req: Request, res: Response) {
  const userId = await requireUser(req, res)
  if (!userId) return

  const listId = typeof req.query.list === "string" ? req.query.list : null
  const view = (req.query.view || "watchlist") as ArchiveView
  const sort = (req.query.sort || "added") as ArchiveSort
  const mediaFilter = req.query.mediaType
  if (!listId && !VIEWS.includes(view)) {
    res.status(400).json({ error: "Unknown view." })
    return
  }
  if (!SORTS.includes(sort)) {
    res.status(400).json({ error: "Unknown sort." })
    return
  }
  if (mediaFilter != null && mediaFilter !== "" && !parseMediaType(mediaFilter)) {
    res.status(400).json({ error: "Bad media type." })
    return
  }
  const page = parsePage(req.query.page)
  const pageSize = parsePageSize(req.query.pageSize, DEFAULT_PAGE_SIZE)
  if (page == null || pageSize == null) {
    res.status(400).json({ error: "Bad page." })
    return
  }
  if (listId) {
    const owned = await prisma.list.findFirst({
      where: { id: listId, userId, type: "custom" },
      select: { id: true },
    })
    if (!owned) {
      res.status(404).json({ error: "List not found." })
      return
    }
  }

  const entries = await buildArchiveEntries(userId, await listArchiveItems(userId))
  const matching = entries.filter((entry) => {
    if (listId) {
      if (!entry.customListIds.includes(listId)) return false
    } else if (view === "favorites" ? !entry.favorite : entry.status !== view) {
      return false
    }
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
  const ref = parseTitleRef(req.body)
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
  const ref = parseTitleRef(req.body)
  const score = parseScore(req.body?.score)
  const parsedNote = parseNote(req.body?.note)
  const parsedDate = parseWatchedAt(req.body?.watchedAt)
  if (!ref || score == null || !parsedNote.valid || !parsedDate.valid) {
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
  const ref = parseTitleRef({
    tmdbId: req.params.id,
    mediaType: req.params.mediaType,
  })
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
  const ref = parseTitleRef(req.body)
  const score = parseScore(req.body?.score)
  const parsedNote = parseNote(req.body?.note)
  if (!ref || score == null || !parsedNote.valid) {
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
